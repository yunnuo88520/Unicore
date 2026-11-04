// Author: yunnuo <ymz@ebox.vip>
package notifyadapter

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"github.com/yunnuo/unicore/internal/mailer"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSignedWebhookAndProviderErrors(t *testing.T) {
	sent := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mac := hmac.New(sha256.New, []byte("synthetic"))
		mac.Write(body)
		if r.Header.Get("X-Unicore-Signature") != hex.EncodeToString(mac.Sum(nil)) {
			t.Error("signature mismatch")
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Error("content type")
		}
		sent++
		w.WriteHeader(204)
	}))
	defer server.Close()
	sender := Sender{transport: server.Client().Transport}
	v := map[string]string{"notifications.webhook_url": server.URL, "notifications.signing_secret": "synthetic"}
	if e := sender.SendChannel(context.Background(), v, mailer.Message{Channel: "webhook", Subject: "Title", Body: "Content", Event: "login"}); e != nil || sent != 1 {
		t.Fatalf("delivery %v %d", e, sent)
	}
	for _, ip := range []string{"127.0.0.1", "::1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "fd00::1", "100.100.100.200", "198.18.0.1", "2001:db8::1", "::ffff:127.0.0.1"} {
		if PublicIP(net.ParseIP(ip)) {
			t.Errorf("private IP accepted %s", ip)
		}
	}
	// The production sender cannot access the test's loopback endpoint.
	if e := (Sender{}).SendChannel(context.Background(), v, mailer.Message{Channel: "webhook", Subject: "Title", Body: "Content"}); e == nil {
		t.Fatal("SSRF protection bypassed")
	}
	v["notifications.webhook_url"] = "http://example.com"
	if sender.SendChannel(context.Background(), v, mailer.Message{Channel: "webhook"}) == nil {
		t.Fatal("plaintext HTTP allowed")
	}
}

type responseTransport func(*http.Request) (*http.Response, error)

func (f responseTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestWeComApplicationResponse(t *testing.T) {
	for _, body := range []string{`{"errcode":0}`, `{"errcode":40058,"errmsg":"invalid parameter"}`, `{}`, `not-json`} {
		sender := Sender{transport: responseTransport(func(r *http.Request) (*http.Response, error) {
			if r.URL.Host != "qyapi.weixin.qq.com" || r.URL.Query().Get("key") != "synthetic" {
				t.Error("wrong WeCom destination")
			}
			data, _ := io.ReadAll(r.Body)
			if !strings.Contains(string(data), `"msgtype":"text"`) || !strings.Contains(string(data), `Title\n\nContent`) {
				t.Error("invalid WeCom payload")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		})}
		e := sender.SendChannel(context.Background(), map[string]string{"notifications.wecom_key": "synthetic"}, mailer.Message{Channel: "wecom", Subject: "Title", Body: "Content"})
		if (e == nil) != (body == `{"errcode":0}`) {
			t.Fatalf("response %q accepted=%v", body, e == nil)
		}
	}
}
