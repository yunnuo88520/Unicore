// Author: yunnuo <ymz@ebox.vip>
package updatechannel

import (
	"context"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHTTPSBoundsAndRedirects(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/redirect":
			http.Redirect(w, r, "http://127.0.0.1/private", 302)
		case "/large":
			_, _ = io.WriteString(w, strings.Repeat("x", 100))
		default:
			_, _ = io.WriteString(w, `{"releases":[{"version":"1.2.0","notes":"ok"}]}`)
		}
	}))
	defer server.Close()
	h, e := New("", server.URL+"/feed")
	if e != nil {
		t.Fatal(e)
	}
	ca := filepath.Join(t.TempDir(), "ca.pem")
	_ = os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw}), 0600)
	if e = h.WithRootCA(ca); e != nil {
		t.Fatal(e)
	}
	if releases, e := h.Releases(context.Background()); e != nil || len(releases) != 1 {
		t.Fatal(e, releases)
	}
	if _, e = h.Read(context.Background(), server.URL+"/large", 10); e == nil {
		t.Fatal("oversize accepted")
	}
	if _, e = h.Read(context.Background(), server.URL+"/redirect", 1000); e == nil {
		t.Fatal("insecure redirect accepted")
	}
	if e = h.Download(context.Background(), server.URL+"/large", io.Discard, 99, nil); e == nil {
		t.Fatal("incorrect download size accepted")
	}
	for _, u := range []string{"http://example.com/feed", "https://user:password@example.com/feed", "https://example.com/feed#fragment"} {
		if _, e = New("", u); e == nil {
			t.Fatal("unsafe feed accepted")
		}
	}
}
