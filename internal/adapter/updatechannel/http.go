// Author: yunnuo <ymz@ebox.vip>
// Description: Public GitHub Releases and replaceable HTTPS feed adapters with bounded reads and redirects.
package updatechannel

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"github.com/yunnuo/unicore/internal/updates"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

var repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$`)

type HTTP struct {
	Repository string
	Feed       string
	Client     *http.Client
}

// WithRootCA supports operator-managed intranet channels without disabling TLS verification.
func (h *HTTP) WithRootCA(file string) error {
	if file == "" {
		return nil
	}
	raw, err := os.ReadFile(file)
	if err != nil || len(raw) > 1024*1024 {
		return updates.ErrRejected
	}
	roots, err := x509.SystemCertPool()
	if err != nil {
		return updates.ErrRejected
	}
	if !roots.AppendCertsFromPEM(raw) {
		return updates.ErrRejected
	}
	transport := h.Client.Transport.(*http.Transport)
	transport.TLSClientConfig = &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}
	return nil
}

func New(repository, feed string) (*HTTP, error) {
	h := &HTTP{Repository: repository, Feed: feed}
	if feed != "" {
		u, e := url.Parse(feed)
		if e != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Fragment != "" {
			return nil, updates.ErrRejected
		}
	} else if !repositoryPattern.MatchString(repository) {
		return nil, updates.ErrRejected
	}
	h.Client = &http.Client{Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, ResponseHeaderTimeout: 10 * time.Second, TLSHandshakeTimeout: 10 * time.Second, MaxIdleConns: 8, IdleConnTimeout: 30 * time.Second}, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) > 5 || !h.allowed(r.URL) {
			return updates.ErrRejected
		}
		return nil
	}}
	return h, nil
}
func (h *HTTP) Name() string {
	if h.Feed != "" {
		u, _ := url.Parse(h.Feed)
		return "HTTPS · " + u.Host
	}
	return "GitHub · " + h.Repository
}
func (h *HTTP) allowed(u *url.URL) bool {
	if u.Scheme != "https" || u.User != nil || u.Fragment != "" {
		return false
	}
	if h.Feed != "" {
		base, _ := url.Parse(h.Feed)
		return u.Host == base.Host
	}
	host := u.Hostname()
	if u.Port() != "" && u.Port() != "443" {
		return false
	}
	return host == "api.github.com" || host == "github.com" || strings.HasSuffix(host, ".githubusercontent.com") || strings.HasSuffix(host, ".blob.core.windows.net")
}
func (h *HTTP) request(ctx context.Context, address string) (*http.Response, error) {
	u, e := url.Parse(address)
	if e != nil || !h.allowed(u) {
		return nil, updates.ErrRejected
	}
	if h.Feed == "" && u.Hostname() == "github.com" && !strings.HasPrefix(u.Path, "/"+h.Repository+"/releases/") {
		return nil, updates.ErrRejected
	}
	req, e := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if e != nil {
		return nil, updates.ErrUnavailable
	}
	req.Header.Set("User-Agent", "Unicore-Updater/1")
	req.Header.Set("Accept", "application/vnd.github+json")
	response, e := h.Client.Do(req)
	if e != nil {
		return nil, updates.ErrUnavailable
	}
	if response.StatusCode != 200 {
		response.Body.Close()
		return nil, updates.ErrUnavailable
	}
	return response, nil
}
func (h *HTTP) Read(ctx context.Context, address string, limit int64) ([]byte, error) {
	response, e := h.request(ctx, address)
	if e != nil {
		return nil, e
	}
	defer response.Body.Close()
	data, e := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if e != nil || int64(len(data)) > limit {
		return nil, updates.ErrUnavailable
	}
	return data, nil
}
func (h *HTTP) Releases(ctx context.Context) ([]updates.Release, error) {
	if h.Feed != "" {
		data, e := h.Read(ctx, h.Feed, 2*1024*1024)
		if e != nil {
			return nil, e
		}
		var feed struct {
			Releases []updates.Release `json:"releases"`
		}
		if json.Unmarshal(data, &feed) != nil || len(feed.Releases) > 100 {
			return nil, updates.ErrUnavailable
		}
		return h.validate(feed.Releases), nil
	}
	data, e := h.Read(ctx, "https://api.github.com/repos/"+h.Repository+"/releases?per_page=30", 2*1024*1024)
	if e != nil {
		return nil, e
	}
	var source []struct {
		Tag       string `json:"tag_name"`
		Notes     string `json:"body"`
		Published string `json:"published_at"`
		Draft     bool   `json:"draft"`
		Preview   bool   `json:"prerelease"`
		URL       string `json:"html_url"`
		Assets    []struct {
			Name  string `json:"name"`
			URL   string `json:"browser_download_url"`
			State string `json:"state"`
		} `json:"assets"`
	}
	if json.Unmarshal(data, &source) != nil {
		return nil, updates.ErrUnavailable
	}
	releases := []updates.Release{}
	for _, item := range source {
		version := updates.TagVersion(item.Tag)
		if item.Draft || version == "" {
			continue
		}
		release := updates.Release{Version: version, Notes: item.Notes, PublishedAt: item.Published, Prerelease: item.Preview, URL: item.URL, Assets: []updates.AssetLink{}}
		for _, a := range item.Assets {
			if a.State == "uploaded" {
				release.Assets = append(release.Assets, updates.AssetLink{Name: a.Name, URL: a.URL})
			}
		}
		releases = append(releases, release)
	}
	return h.validate(releases), nil
}
func (h *HTTP) validate(releases []updates.Release) []updates.Release {
	result := []updates.Release{}
	seen := map[string]bool{}
	for _, r := range releases {
		if !updates.ValidVersion(r.Version) || seen[r.Version] || len(r.Notes) > 128*1024 || len(r.Assets) > 100 {
			continue
		}
		seen[r.Version] = true
		if u, e := url.Parse(r.URL); e != nil || !h.allowed(u) {
			r.URL = ""
		}
		assets := []updates.AssetLink{}
		names := map[string]bool{}
		for _, a := range r.Assets {
			u, e := url.Parse(a.URL)
			if e == nil && h.allowed(u) && !names[a.Name] {
				assets = append(assets, a)
				names[a.Name] = true
			}
		}
		r.Assets = assets
		result = append(result, r)
	}
	return result
}

type counted struct {
	destination io.Writer
	total       int64
	progress    func(int64)
}

func (w *counted) Write(p []byte) (int, error) {
	n, e := w.destination.Write(p)
	w.total += int64(n)
	if w.progress != nil {
		w.progress(w.total)
	}
	return n, e
}
func (h *HTTP) Download(ctx context.Context, address string, destination io.Writer, size int64, progress func(int64)) error {
	response, e := h.request(ctx, address)
	if e != nil {
		return e
	}
	defer response.Body.Close()
	if response.ContentLength > 0 && response.ContentLength != size {
		return updates.ErrRejected
	}
	count := &counted{destination: destination, progress: progress}
	_, e = io.Copy(count, io.LimitReader(response.Body, size+1))
	if e != nil || count.total != size {
		return fmt.Errorf("%w: download size", updates.ErrRejected)
	}
	return nil
}
