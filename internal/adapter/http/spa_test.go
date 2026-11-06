// Author: yunnuo <ymz@ebox.vip>
// Description: Conditional SPA requests: ETag stamping, 304 round trips and cache policies per asset class.
package httpadapter

import (
	"github.com/yunnuo/unicore/internal/bootstrap"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func spaHandler() http.Handler {
	return New(Config{Core: bootstrap.Core(), Assets: fstest.MapFS{
		"index.html":    {Data: []byte("<html>SPA</html>")},
		"assets/app.js": {Data: []byte("console.log('app')")},
	}, Logger: discardLogger()})
}

func TestSPAConditionalRequests(t *testing.T) {
	handler := spaHandler()
	get := func(path, ifNoneMatch string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "http://localhost"+path, nil)
		if ifNoneMatch != "" {
			r.Header.Set("If-None-Match", ifNoneMatch)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	first := get("/", "")
	if first.Code != 200 {
		t.Fatalf("first request: %d", first.Code)
	}
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("missing ETag on SPA entry")
	}
	if cached := first.Header().Get("Cache-Control"); cached != "no-cache" {
		t.Fatalf("entry cache policy: %q", cached)
	}
	revalidated := get("/", etag)
	if revalidated.Code != 304 {
		t.Fatalf("conditional entry: %d %s", revalidated.Code, revalidated.Body.String())
	}
	if body, _ := io.ReadAll(revalidated.Body); len(body) != 0 {
		t.Fatal("304 must not carry a body")
	}
	if weak := get("/", `W/`+etag); weak.Code != 304 {
		t.Fatalf("weak validator must revalidate: %d", weak.Code)
	}
	if stale := get(`/`, `"stale"`); stale.Code != 200 {
		t.Fatalf("unknown validator must serve: %d", stale.Code)
	}

	asset := get("/assets/app.js", "")
	if policy := asset.Header().Get("Cache-Control"); policy != "public, max-age=31536000, immutable" {
		t.Fatalf("hashed asset policy: %q", policy)
	}
	if asset.Header().Get("ETag") == "" {
		t.Fatal("missing ETag on hashed asset")
	}
	if revalidated := get("/assets/app.js", asset.Header().Get("ETag")); revalidated.Code != 304 {
		t.Fatalf("conditional asset: %d", revalidated.Code)
	}
}
