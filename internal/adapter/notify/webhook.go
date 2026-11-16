// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded WeCom and signed JSON webhook delivery with DNS-pinned public HTTPS destinations.
package notifyadapter

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/yunnuo/unicore/internal/mailer"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

var errRedirect = &mailer.DeliveryFailure{Code: mailer.FailureChannelRejected, Detail: "redirect refused"}

type Sender struct{ transport http.RoundTripper }

var nonPublic = func() []netip.Prefix {
	result := []netip.Prefix{}
	for _, cidr := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32", "2001::/32", "2002::/16", "64:ff9b::/96", "64:ff9b:1::/48"} {
		result = append(result, netip.MustParsePrefix(cidr))
	}
	return result
}()

func PublicIP(ip net.IP) bool {
	if ip == nil || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return false
	}
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	address = address.Unmap()
	for _, prefix := range nonPublic {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}
func (s Sender) SendChannel(ctx context.Context, v map[string]string, m mailer.Message) error {
	endpoint := v["notifications.webhook_url"]
	var payload any = struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Event   string `json:"event"`
	}{m.Subject, m.Body, m.Event}
	if m.Channel == "wecom" {
		if v["notifications.wecom_key"] == "" {
			return &mailer.DeliveryFailure{Code: mailer.FailureChannelInvalid, Detail: "missing wecom key"}
		}
		endpoint = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=" + url.QueryEscape(v["notifications.wecom_key"])
		payload = map[string]any{"msgtype": "text", "text": map[string]string{"content": m.Subject + "\n\n" + m.Body}}
	} else if m.Channel != "webhook" {
		return &mailer.DeliveryFailure{Code: mailer.FailureChannelInvalid, Detail: "unknown channel"}
	}
	u, e := url.Parse(endpoint)
	if e != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Fragment != "" || strings.ContainsAny(endpoint, "\r\n\x00") {
		return &mailer.DeliveryFailure{Code: mailer.FailureChannelInvalid, Detail: "invalid destination URL"}
	}
	body, e := json.Marshal(payload)
	if e != nil {
		return &mailer.DeliveryFailure{Code: mailer.FailureChannelInvalid, Detail: "payload encoding failed"}
	}
	delivery, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	transport := &http.Transport{Proxy: nil, ForceAttemptHTTP2: true, TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: 5 * time.Second, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, e := net.SplitHostPort(address)
		if e != nil {
			return nil, &mailer.DeliveryFailure{Code: mailer.FailureChannelUnavailable, Retryable: true}
		}
		ips, e := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if e != nil || len(ips) == 0 {
			return nil, &mailer.DeliveryFailure{Code: mailer.FailureChannelUnavailable, Retryable: true, Detail: "destination unresolved"}
		}
		for _, ip := range ips {
			if !PublicIP(ip) {
				return nil, &mailer.DeliveryFailure{Code: mailer.FailureChannelInvalid, Detail: "destination is not a public address"}
			}
		}
		return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
	}}
	defer transport.CloseIdleConnections()
	client := http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return errRedirect }}
	if s.transport != nil {
		client.Transport = s.transport
	}
	request, e := http.NewRequestWithContext(delivery, http.MethodPost, endpoint, bytes.NewReader(body))
	if e != nil {
		return &mailer.DeliveryFailure{Code: mailer.FailureChannelInvalid, Detail: "request construction failed"}
	}
	request.Header.Set("Content-Type", "application/json")
	if key := v["notifications.signing_secret"]; m.Channel == "webhook" && key != "" {
		mac := hmac.New(sha256.New, []byte(key))
		mac.Write(body)
		request.Header.Set("X-Unicore-Signature", hex.EncodeToString(mac.Sum(nil)))
	}
	response, e := client.Do(request)
	if e != nil {
		return classifyHTTP(e)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusTooManyRequests {
		return &mailer.DeliveryFailure{Code: mailer.FailureChannelRateLimited, Retryable: true}
	}
	if response.StatusCode >= 500 {
		return &mailer.DeliveryFailure{Code: mailer.FailureChannelUnavailable, Retryable: true}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return &mailer.DeliveryFailure{Code: mailer.FailureChannelRejected}
	}
	if m.Channel == "wecom" {
		var result struct {
			Code *int `json:"errcode"`
		}
		data, e := io.ReadAll(io.LimitReader(response.Body, 65537))
		if e != nil || len(data) > 65536 {
			return &mailer.DeliveryFailure{Code: mailer.FailureChannelUnavailable, Retryable: true}
		}
		if json.Unmarshal(data, &result) != nil || result.Code == nil {
			return &mailer.DeliveryFailure{Code: mailer.FailureChannelRejected, Detail: "unreadable wecom response"}
		}
		if *result.Code == 45009 {
			return &mailer.DeliveryFailure{Code: mailer.FailureChannelRateLimited, Retryable: true}
		}
		if *result.Code != 0 {
			return &mailer.DeliveryFailure{Code: mailer.FailureChannelRejected}
		}
	}
	return nil
}

// classifyHTTP maps transport-level failures to stable delivery codes.
// Timeouts stay retryable; everything else unclassified degrades to a
// retryable channel-unavailable outcome.
func classifyHTTP(err error) error {
	if err == nil {
		return nil
	}
	var failure *mailer.DeliveryFailure
	if errors.As(err, &failure) {
		return err
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return &mailer.DeliveryFailure{Code: mailer.FailureTimeout, Retryable: true}
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return &mailer.DeliveryFailure{Code: mailer.FailureTimeout, Retryable: true}
	}
	return &mailer.DeliveryFailure{Code: mailer.FailureChannelUnavailable, Retryable: true}
}
