// Author: yunnuo <ymz@ebox.vip>
// Description: User-realm file endpoints enforce the contract files:access grant and the role-omitting status update preserves assignments.
package httpadapter

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/runtime"
)

func TestFileAccessAndRoleOmittedUpdate(t *testing.T) {
	ctx := t.Context()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	tokenBytes, _ := os.ReadFile(manager.TokenPath())
	_, admin, err := manager.Complete(ctx, strings.TrimSpace(string(tokenBytes)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Storage", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	_, _, identity, _ := manager.Services()
	member, err := identity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	router := New(Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "development"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	session := func(realm bool, user contracts.User) (*http.Cookie, string) {
		s, raw, err := manager.Identity(realm).Issue(ctx, user, 1)
		if err != nil {
			t.Fatal(err)
		}
		name := sessionCookie
		if realm {
			name = administratorSessionCookie
		}
		return &http.Cookie{Name: name, Value: raw}, s.CsrfToken
	}
	request := func(method, path string, input any, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
		t.Helper()
		raw, _ := json.Marshal(input)
		r := httptest.NewRequest(method, "http://localhost"+path, strings.NewReader(string(raw)))
		r.Header.Set("Content-Type", "application/json")
		if csrf != "" {
			r.Header.Set("X-CSRF-Token", csrf)
		}
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	adminCookie, adminCSRF := session(true, admin)
	memberCookie, _ := session(false, member)
	// The builtin user role holds the assignable files:access point, so the
	// listing passes the contract policy gate.
	if w := request("GET", "/api/v1/files", nil, memberCookie, ""); w.Code == 401 || w.Code == 403 {
		t.Fatal("files:access member refused", w.Code, w.Body.String())
	}
	// A custom role without files:access is created and assigned.
	if w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "viewer", "permissions": []string{}}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var role contracts.RoleListResponse
	if err := json.Unmarshal(request("GET", "/api/v1/admin/roles", nil, adminCookie, "").Body.Bytes(), &role); err != nil {
		t.Fatal(err)
	}
	viewerID := ""
	for _, item := range role.Data.Items {
		if item.Name == "viewer" {
			viewerID = item.ID
		}
	}
	if viewerID == "" {
		t.Fatal("viewer role missing", role.Data)
	}
	if w := request("PATCH", "/api/v1/admin/users/"+member.ID, contracts.UserUpdate{Role: rolePtr(viewerID), Status: "active"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role assignment", w.Code, w.Body.String())
	}
	// The assignment revoked the member session issued before the change.
	memberCookie, memberCSRF := session(false, member)
	for _, spec := range []struct{ method, path string }{
		{"GET", "/api/v1/files"},
		{"GET", "/api/v1/files/multipart/missing"},
		{"DELETE", "/api/v1/files/missing"},
		{"POST", "/api/v1/files/multipart"},
	} {
		w := request(spec.method, spec.path, map[string]any{}, memberCookie, memberCSRF)
		if w.Code != 403 {
			t.Fatal("revoked files:access accepted", spec.method, spec.path, w.Code, w.Body.String())
		}
		var response contracts.ErrorResponse
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || response.Code != "PERMISSION_DENIED" {
			t.Fatal("expected PERMISSION_DENIED", spec.path, w.Body.String(), err)
		}
	}
	// The status-only update (role omitted) keeps the assignments; the list
	// echoes the real role ids and the refusal persists.
	if w := request("PATCH", "/api/v1/admin/users/"+member.ID, map[string]any{"status": "active"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role omitted update", w.Code, w.Body.String())
	}
	w := request("GET", "/api/v1/admin/users?search=member", nil, adminCookie, "")
	var list contracts.UserListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || w.Code != 200 {
		t.Fatal("member list", w.Code, w.Body.String(), err)
	}
	roles := []string{}
	for _, item := range list.Data.Items {
		if item.ID == member.ID {
			roles = item.Roles
		}
	}
	if len(roles) != 1 || roles[0] != viewerID {
		t.Fatal("role omitted update changed roles", roles)
	}
	memberCookie, _ = session(false, member)
	if w := request("GET", "/api/v1/files", nil, memberCookie, ""); w.Code != 403 {
		t.Fatal("files:access restored unexpectedly", w.Code, w.Body.String())
	}
	// Restoring the builtin role reopens the user file surface.
	if w := request("PATCH", "/api/v1/admin/users/"+member.ID, contracts.UserUpdate{Role: rolePtr("user"), Status: "active"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role restore", w.Code, w.Body.String())
	}
	memberCookie, _ = session(false, member)
	if w := request("GET", "/api/v1/files", nil, memberCookie, ""); w.Code == 401 || w.Code == 403 {
		t.Fatal("builtin member refused after restore", w.Code, w.Body.String())
	}
}
