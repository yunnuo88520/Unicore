// Author: yunnuo <ymz@ebox.vip>
// Description: Maintenance blocks user APIs while preserving authenticated administrator recovery and public metadata.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
)

func TestMaintenanceBoundaryAndRecovery(t *testing.T) {
	ctx := context.Background()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	router := New(Config{Core: bootstrap.Core(), Install: manager, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, input any, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
		t.Helper()
		raw, _ := json.Marshal(input)
		r := httptest.NewRequest(method, "http://localhost"+path, bytes.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", csrf)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		if path == "/api/v1/install/complete" {
			token, _ := os.ReadFile(manager.TokenPath())
			r.Header.Set("X-Bootstrap-Token", strings.TrimSpace(string(token)))
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	w := request("POST", "/api/v1/install/complete", contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Maintenance test", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"}, nil, "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	cookie := w.Result().Cookies()[0]
	var boot contracts.BootstrapResponse
	json.Unmarshal(request("GET", "/api/v1/admin/bootstrap", nil, cookie, "").Body.Bytes(), &boot)
	csrf := *boot.Data.CsrfToken
	patch := func(enabled string) *httptest.ResponseRecorder {
		return request("PATCH", "/api/v1/admin/settings", contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "maintenance.enabled", Value: enabled}, {Key: "maintenance.message", Value: "Planned work"}, {Key: "site.police_number", Value: "Registration 123"}, {Key: "site.footer_html", Value: `<p>Public footer</p>`}}}, cookie, csrf)
	}
	if w = patch("true"); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/v1/auth/policy", "/api/v1/files", "/api/v1/notes", "/api/v1/files/missing/content"} {
		w = request("GET", path, nil, nil, "")
		if w.Code != 503 || !strings.Contains(w.Body.String(), "MAINTENANCE_MODE") || w.Header().Get("Retry-After") != "60" {
			t.Fatalf("unblocked %s: %d %s", path, w.Code, w.Body.String())
		}
	}
	w = request("POST", "/api/v1/core/execute", contracts.ExecuteInput{}, nil, "")
	if w.Code != 503 {
		t.Fatal("user write not blocked", w.Code)
	}
	w = request("POST", "/api/v1/auth/login", contracts.LoginInput{}, nil, "")
	if w.Code != 503 {
		t.Fatal("user login not blocked", w.Code)
	}
	for _, path := range []string{"/api/v1/bootstrap", "/api/v1/health/live", "/api/v1/health/ready", "/api/v1/admin/auth/policy"} {
		if w = request("GET", path, nil, nil, ""); w.Code != 200 {
			t.Fatal(path, w.Code)
		}
	}
	w = request("GET", "/api/v1/bootstrap", nil, nil, "")
	json.Unmarshal(w.Body.Bytes(), &boot)
	if boot.Data.MaintenanceEnabled == nil || !*boot.Data.MaintenanceEnabled || boot.Data.MaintenanceMessage == nil || *boot.Data.MaintenanceMessage != "Planned work" || boot.Data.SiteFooterHtml == nil || strings.Contains(w.Body.String(), "admin@example.test") {
		t.Fatal("unsafe/incomplete public metadata", w.Body.String())
	}
	if w = request("GET", "/api/v1/admin/settings", nil, nil, ""); w.Code != 401 {
		t.Fatal("anonymous admin exemption", w.Code)
	}
	if w = request("GET", "/api/v1/admin/settings", nil, cookie, ""); w.Code != 200 {
		t.Fatal("admin recovery blocked", w.Code)
	}
	if w = patch("false"); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = request("GET", "/api/v1/auth/policy", nil, nil, ""); w.Code != 200 {
		t.Fatal("maintenance did not recover", w.Code)
	}
}
