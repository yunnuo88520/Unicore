// Author: yunnuo <ymz@ebox.vip>
// Description: Exercise real handlers, transport parity and API/SPA boundaries.
package httpadapter

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	cliadapter "github.com/yunnuo/unicore/internal/adapter/cli"
	"github.com/yunnuo/unicore/internal/adapter/desktop"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/runtime"
)

func handler() http.Handler {
	return New(Config{Core: bootstrap.Core(), Metadata: runtime.Metadata(runtime.WebStandalone, "development"), Assets: fstest.MapFS{"index.html": {Data: []byte("<html>SPA</html>")}, "assets/app.js": {Data: []byte("console.log('app')")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
}

func TestAdaptersReturnSameCoreResult(t *testing.T) {
	input := contracts.ExecuteInput{Text: "你好 Unicore\nOne core"}
	body, _ := json.Marshal(input)
	r := httptest.NewRequest("POST", "http://localhost/api/v1/core/execute", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler().ServeHTTP(w, r)
	var response contracts.ExecuteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || response.Code != "OK" || response.RequestID == "" {
		t.Fatalf("bad response: %s", w.Body.String())
	}
	bridgeResult := desktop.New(bootstrap.Core()).Execute(input)
	if bridgeResult.Code != "OK" || bridgeResult.Data != response.Data {
		t.Fatal("HTTP and Wails bridge results differ")
	}
	command := cliadapter.New(bootstrap.Core())
	var cliOutput bytes.Buffer
	command.SetOut(&cliOutput)
	command.SetArgs([]string{"execute", "--text", input.Text})
	if err := command.Execute(); err != nil {
		t.Fatal(err)
	}
	var result contracts.ExecuteOutput
	if err := json.Unmarshal(cliOutput.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result != response.Data {
		t.Fatal("CLI and HTTP results differ")
	}
}

func TestInvalidRequests(t *testing.T) {
	for _, tc := range []struct {
		name, body, contentType, origin string
		status                          int
		code                            string
	}{
		{"blank", `{"text":" "}`, "application/json", "", 400, "INVALID_INPUT"},
		{"unknown field", `{"text":"hi","admin":true}`, "application/json", "", 400, "INVALID_JSON"},
		{"trailing JSON", `{"text":"hi"} {}`, "application/json", "", 400, "INVALID_JSON"},
		{"wrong type", `{"text":3}`, "application/json", "", 400, "INVALID_JSON"},
		{"unsupported media", `{"text":"hi"}`, "text/plain", "", 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"cross origin", `{"text":"hi"}`, "application/json", "https://attacker.example", 403, "ORIGIN_REJECTED"},
		{"opaque origin", `{"text":"hi"}`, "application/json", "null", 403, "ORIGIN_REJECTED"},
		{"oversized input", `{"text":"` + strings.Repeat("a", 65537) + `"}`, "application/json", "", 400, "INVALID_INPUT"},
		{"oversized body", `{"text":"` + strings.Repeat("a", 512*1024) + `"}`, "application/json", "", 413, "BODY_TOO_LARGE"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "http://localhost/api/v1/core/execute", strings.NewReader(tc.body))
			r.Header.Set("Content-Type", tc.contentType)
			r.Header.Set("Origin", tc.origin)
			w := httptest.NewRecorder()
			handler().ServeHTTP(w, r)
			var response contracts.ErrorResponse
			_ = json.Unmarshal(w.Body.Bytes(), &response)
			if w.Code != tc.status || response.Code != tc.code || response.RequestID == "" {
				t.Fatalf("got %d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestFetchSiteMetadataAuthorizesSamePageRequests(t *testing.T) {
	body := `{"text":"hi"}`
	for _, tc := range []struct {
		name, origin, fetchSite string
		status                  int
	}{
		// Gateways and tunnels legitimately rewrite Host; browser-asserted fetch
		// metadata must keep same-page requests working.
		{"rewritten host, same-origin", "https://unicore.example", "same-origin", 200},
		{"no origin, same-origin", "", "same-origin", 200},
		{"cross-site", "http://localhost:8080", "cross-site", 403},
		{"mismatch without metadata", "https://attacker.example", "", 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "http://localhost/api/v1/core/execute", strings.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			if tc.fetchSite != "" {
				r.Header.Set("Sec-Fetch-Site", tc.fetchSite)
			}
			w := httptest.NewRecorder()
			handler().ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("got %d %s", w.Code, w.Body.String())
			}
			if tc.status == 200 {
				var response contracts.ExecuteResponse
				if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || response.Code != "OK" {
					t.Fatalf("accepted request failed: %s", w.Body.String())
				}
			}
		})
	}
}

func TestAPINeverFallsBackToHTML(t *testing.T) {
	for _, tc := range []struct {
		path    string
		status  int
		content string
	}{
		{"/api", 404, "application/json"}, {"/api/v1/missing", 404, "application/json"},
		{"/api/v1/install/status", 404, "application/json"}, {"/api/v1/admin/update/check", 404, "application/json"},
		{"/settings", 200, "text/html"}, {"/assets/missing.js", 404, "text/plain"}, {"/assets/app.js", 200, "javascript"},
	} {
		r := httptest.NewRequest("GET", tc.path, nil)
		w := httptest.NewRecorder()
		handler().ServeHTTP(w, r)
		if w.Code != tc.status || !strings.Contains(w.Header().Get("Content-Type"), tc.content) {
			t.Fatalf("%s: got %d %s", tc.path, w.Code, w.Header().Get("Content-Type"))
		}
	}
}

func TestProfileMetadataIsHonest(t *testing.T) {
	for _, profile := range []contracts.Profile{runtime.WebPlatform, runtime.WebStandalone, runtime.Desktop, runtime.CLI} {
		data := runtime.Metadata(profile, "development")
		if !data.Capabilities.Execute || data.Capabilities.Authentication || data.Capabilities.Database || data.Capabilities.Installation || data.Capabilities.License || data.Capabilities.Updater {
			t.Fatalf("unexpected M1 capabilities: %+v", data)
		}
	}
	if _, err := runtime.ParseWebProfile("desktop"); err == nil {
		t.Fatal("server must reject desktop profile")
	}
}
