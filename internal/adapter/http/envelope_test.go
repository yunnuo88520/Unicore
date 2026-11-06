// Author: yunnuo <ymz@ebox.vip>
// Description: Wire-level envelope contract: exact JSON keys, catalog-agreeing statuses and stable error codes for every response class.
package httpadapter

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// assertEnvelope pins the response envelope on the wire: the JSON body must
// carry exactly {code, message, request_id} (plus fields for input errors),
// the code must be stable, the status must agree with the generated catalog
// and request_id must always be present. Success envelopes keep message "".
func assertEnvelope(t *testing.T, w *httptest.ResponseRecorder, status int, code string, wantFields bool) map[string]any {
	t.Helper()
	if w.Code != status {
		t.Fatalf("want %d got %d %s", status, w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("envelope is not a JSON object: %v %s", err, w.Body.String())
	}
	allowed := map[string]bool{"code": true, "message": true, "request_id": true}
	if wantFields {
		allowed["fields"] = true
	}
	if status < 400 {
		allowed["data"] = true
	}
	for key := range body {
		if !allowed[key] {
			t.Fatalf("unexpected envelope key %q in %v", key, body)
		}
	}
	for key := range allowed {
		if _, ok := body[key]; !ok {
			t.Fatalf("missing envelope key %q in %v", key, body)
		}
	}
	if body["code"] != code {
		t.Fatalf("want code %s got %v", code, body["code"])
	}
	if id, _ := body["request_id"].(string); id == "" {
		t.Fatalf("empty request_id in %v", body)
	}
	_, messageEmpty := body["message"].(string)
	if status < 400 && !messageEmpty {
		if message, _ := body["message"].(string); message != "" {
			t.Fatalf("success envelope must keep message empty, got %v", body)
		}
	} else if status >= 400 {
		if message, _ := body["message"].(string); message == "" {
			t.Fatalf("error envelope must carry a message, got %v", body)
		}
	}
	_, hasFields := body["fields"]
	if wantFields && !hasFields {
		t.Fatalf("missing fields map in %v", body)
	}
	if !wantFields && hasFields {
		t.Fatalf("unexpected fields map in %v", body)
	}
	if definition, ok := contracts.ErrorCatalog[code]; ok && definition.Status != status {
		t.Fatalf("status %d disagrees with catalog status %d for %s", status, definition.Status, code)
	}
	return body
}

func TestEnvelopeCatalogSanity(t *testing.T) {
	if len(contracts.ErrorCatalog) < 40 {
		t.Fatalf("catalog suspiciously small: %d entries", len(contracts.ErrorCatalog))
	}
	for code, definition := range contracts.ErrorCatalog {
		if definition.Status < 400 || definition.Status > 599 {
			t.Errorf("code %s has non-error status %d", code, definition.Status)
		}
		if strings.TrimSpace(definition.Message) == "" {
			t.Errorf("code %s has an empty message", code)
		}
	}
}

func TestErrorEnvelopes(t *testing.T) {
	ctx := context.Background()
	manager, e := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if e != nil {
		t.Fatal(e)
	}
	defer func() { manager.Close() }()
	uninstalled := New(Config{Core: bootstrap.Core(), Install: manager, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: discardLogger()})
	request := func(router http.Handler, method, path, body, contentType, cookieName, cookie, csrf string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://localhost"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", contentType)
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: cookieName, Value: cookie})
		}
		if csrf != "" {
			r.Header.Set("X-CSRF-Token", csrf)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	// Before installation the session gate reports INSTALL_REQUIRED.
	assertEnvelope(t, request(uninstalled, "GET", "/api/v1/admin/users", "", "application/json", "", "", ""), 409, "INSTALL_REQUIRED", false)

	admin, adminRaw, memberRaw := newPolicyFixture(t)
	router := New(Config{Core: bootstrap.Core(), Install: admin, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: discardLogger()})
	session, err := admin.Identity(true).Session(ctx, adminRaw)
	if err != nil {
		t.Fatal(err)
	}
	csrf := session.CsrfToken

	assertEnvelope(t, request(router, "GET", "/api/v1/admin/users", "", "application/json", "", "", ""), 401, "AUTH_REQUIRED", false)
	assertEnvelope(t, request(router, "GET", "/api/v1/admin/users", "", "application/json", sessionCookie, memberRaw, ""), 403, "PERMISSION_DENIED", false)
	assertEnvelope(t, request(router, "POST", "/api/v1/admin/users", `{"username":"x"}`, "application/json", administratorSessionCookie, adminRaw, ""), 403, "CSRF_INVALID", false)
	assertEnvelope(t, request(router, "POST", "/api/v1/admin/users", `{"username":"x"`, "application/json", administratorSessionCookie, adminRaw, csrf), 400, "INVALID_JSON", false)
	assertEnvelope(t, request(router, "POST", "/api/v1/admin/users", `{"username":"x"}`, "text/plain", administratorSessionCookie, adminRaw, csrf), 415, "UNSUPPORTED_MEDIA_TYPE", false)
	body := assertEnvelope(t, request(router, "POST", "/api/v1/admin/announcements", `{}`, "application/json", administratorSessionCookie, adminRaw, csrf), 400, "INVALID_INPUT", true)
	if fields, ok := body["fields"].(map[string]any); !ok || len(fields) == 0 {
		t.Fatalf("INVALID_INPUT must carry field errors, got %v", body)
	}
	assertEnvelope(t, request(router, "GET", "/api/v1/admin/no-such-api", "", "application/json", "", "", ""), 404, "NOT_FOUND", false)
	assertEnvelope(t, request(router, "DELETE", "/api/v1/admin/users", "", "application/json", administratorSessionCookie, adminRaw, ""), 405, "METHOD_NOT_ALLOWED", false)

	// Maintenance mode answers 503 with its own stable code on user paths.
	patch := func(value string) {
		payload, _ := json.Marshal(contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "maintenance.enabled", Value: value}}})
		if w := request(router, "PATCH", "/api/v1/admin/settings", string(payload), "application/json", administratorSessionCookie, adminRaw, csrf); w.Code != 200 {
			t.Fatalf("maintenance patch failed: %s", w.Body.String())
		}
	}
	patch("true")
	assertEnvelope(t, request(router, "GET", "/api/v1/announcements", "", "application/json", "", "", ""), 503, "MAINTENANCE_MODE", false)
	patch("false")

	// Success responses share the envelope with an OK code and data.
	w := request(router, "GET", "/api/v1/admin/users?page=1&page_size=20", "", "application/json", administratorSessionCookie, adminRaw, "")
	envelope := assertEnvelope(t, w, 200, "OK", false)
	if _, ok := envelope["data"]; !ok {
		t.Fatalf("success envelope must carry data, got %v", envelope)
	}
}
