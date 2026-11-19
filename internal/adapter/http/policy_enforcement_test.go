// Author: yunnuo <ymz@ebox.vip>
// Description: Contract policy negative matrix: Method/MethodFunc registration bypasses,
// undelegated operations, super-admin reservation, reserved permission points on role save,
// personal token scope and the bounded security audit for rejections.
package httpadapter

import (
	"bytes"
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

// enforcementRouter boots an installed web-platform instance and also exposes
// the raw router for Authorization-header requests.
func enforcementRouter(t *testing.T) (*install.Manager, http.Handler, func(string, string, any, *http.Cookie, string) *httptest.ResponseRecorder) {
	t.Helper()
	manager, err := install.Open(t.Context(), install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = manager.Close() })
	tokenBytes, _ := os.ReadFile(manager.TokenPath())
	router := New(Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "development"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}, "admin.html": {Data: []byte("admin")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, input any, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
		t.Helper()
		raw, _ := json.Marshal(input)
		r := httptest.NewRequest(method, "http://localhost"+path, bytes.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Bootstrap-Token", strings.TrimSpace(string(tokenBytes)))
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
	return manager, router, request
}

// TestPolicyCoversEveryRegistration proves the formerly unwrapped
// Method/MethodFunc registrations (branding and storage-location writes) now
// run the contract policy middleware: a super_admin-bound personal token is
// refused on super-admin-reserved writes even though its role projection holds
// every permission point, while delegable reads keep working.
func TestPolicyCoversEveryRegistration(t *testing.T) {
	_, router, request := enforcementRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	w := request("POST", "/api/v1/account/tokens", contracts.PersonalTokenInput{Name: "ops", ExpiresInDays: 7, RoleID: "super_admin"}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("personal token create", w.Code, w.Body.String())
	}
	var created struct {
		Data contracts.PersonalTokenCreated
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || !strings.HasPrefix(created.Data.Token, "ucp_") {
		t.Fatal("personal token payload", w.Body.String(), err)
	}
	bearer := func(method, path string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, "http://localhost"+path, nil)
		r.Header.Set("Authorization", "Bearer "+created.Data.Token)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, r)
		return rec
	}
	if w := bearer("GET", "/api/v1/admin/branding"); w.Code != http.StatusOK {
		t.Fatal("delegable personal token read refused", w.Code, w.Body.String())
	}
	for _, caseItem := range [][2]string{
		{"PUT", "/api/v1/admin/branding"},
		{"POST", "/api/v1/admin/storage/locations"},
		{"PUT", "/api/v1/admin/storage/locations/primary"},
	} {
		if w := bearer(caseItem[0], caseItem[1]); w.Code != http.StatusForbidden {
			t.Fatal("personal token bypass accepted", caseItem, w.Code, w.Body.String())
		}
	}
}

// TestPolicyBlocksUndelegatedOperations pins the operation-grant layer: a role
// holding users:read with an explicitly empty operation grant must not reach
// the user list even though the permission point passes.
func TestPolicyBlocksUndelegatedOperations(t *testing.T) {
	manager, _, request := enforcementRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "列表读者", "permissions": []string{"users:read"}, "operation_ids": []string{}}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	_, _, identity, _ := manager.Services()
	member, err := identity.Create(t.Context(), contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	if w := request("PATCH", "/api/v1/admin/users/"+member.ID, contracts.UserUpdate{Role: rolePtr(created.Data.ID), Status: "active"}, adminCookie, adminCSRF); w.Code != http.StatusOK {
		t.Fatal("role assignment", w.Code, w.Body.String())
	}
	memberCookie, _ := issueSession(t, manager, false, member)
	if w := request("GET", "/api/v1/admin/users", nil, memberCookie, ""); w.Code != http.StatusForbidden {
		t.Fatal("undelegated operation accepted", w.Code, w.Body.String())
	}
	if w := request("GET", "/api/v1/admin/users", nil, adminCookie, ""); w.Code != http.StatusOK {
		t.Fatal("super admin lost user list", w.Code, w.Body.String())
	}
}

// TestPolicyEnforcesSuperAdminReservation pins the contract superAdmin flag:
// logs:read is a grantable point and the plain log list serves it, but the
// tail and stream operations stay reserved for super_admin.
func TestPolicyEnforcesSuperAdminReservation(t *testing.T) {
	manager, _, request := enforcementRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "日志员", "realm": "administrator", "permissions": []string{"logs:read"}}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	_, _, identity, _ := manager.Services()
	auditor, err := identity.Create(t.Context(), contracts.UserCreate{Username: "auditor", Email: "auditor@example.test", Password: "test-password-strong", Role: created.Data.ID}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	auditorCookie, _ := issueSession(t, manager, true, auditor)
	if w := request("GET", "/api/v1/admin/logs", nil, auditorCookie, ""); w.Code != http.StatusOK {
		t.Fatal("granted log list refused", w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/v1/admin/logs/tail", "/api/v1/admin/logs/stream"} {
		if w := request("GET", path, nil, auditorCookie, ""); w.Code != http.StatusForbidden {
			t.Fatal("reserved operation accepted", path, w.Code, w.Body.String())
		}
	}
}

// TestRoleSaveRejectsReservedPermissions pins the grant-boundary at save time:
// super_admin reserved points never enter a stored role row, on create or
// update, while ordinary points keep saving normally.
func TestRoleSaveRejectsReservedPermissions(t *testing.T) {
	_, _, request := enforcementRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	for _, permissions := range [][]string{{"settings:write"}, {"users:read", "settings:write"}, {"tokens:read"}} {
		w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "保留点角色", "permissions": permissions}, adminCookie, adminCSRF)
		if w.Code != http.StatusForbidden {
			t.Fatal("reserved permission accepted on create", permissions, w.Code, w.Body.String())
		}
	}
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "日志员", "permissions": []string{"logs:read"}}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("ordinary role create refused", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	w = request("PUT", "/api/v1/admin/roles/"+created.Data.ID, map[string]any{"version": created.Data.Version, "name": "日志员", "permissions": []string{"tokens:read"}}, adminCookie, adminCSRF)
	if w.Code != http.StatusForbidden {
		t.Fatal("reserved permission accepted on update", w.Code, w.Body.String())
	}
	w = request("PUT", "/api/v1/admin/roles/"+created.Data.ID, map[string]any{"version": created.Data.Version, "name": "日志员", "permissions": []string{"logs:read"}}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("ordinary role update refused", w.Code, w.Body.String())
	}
}

// TestDenialAuditRows pins the security audit for rejections: authorization
// and CSRF refusals land in the audit log with the actor and reason, and the
// per-identity cap stops a probing client from flooding the table.
func TestDenialAuditRows(t *testing.T) {
	manager, _, request := enforcementRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "日志员", "realm": "administrator", "permissions": []string{"logs:read"}}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	_, _, identity, _ := manager.Services()
	auditor, err := identity.Create(t.Context(), contracts.UserCreate{Username: "auditor", Email: "auditor@example.test", Password: "test-password-strong", Role: created.Data.ID}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	auditorCookie, _ := issueSession(t, manager, true, auditor)
	// One reserved-operation denial and one CSRF denial, then flood the same
	// denial far beyond the cap.
	request("GET", "/api/v1/admin/logs/tail", nil, auditorCookie, "")
	w = request("POST", "/api/v1/admin/users", map[string]any{"username": "x"}, adminCookie, "wrong-csrf")
	if w.Code != http.StatusForbidden {
		t.Fatal("csrf rejection missing", w.Code, w.Body.String())
	}
	for i := 0; i < denialAuditPerMinute+10; i++ {
		request("GET", "/api/v1/admin/logs/tail", nil, auditorCookie, "")
	}
	entries := func(action string) []contracts.AuditEntry {
		t.Helper()
		list, err := identity.Store.SystemLogs(t.Context(), contracts.AuditLogQuery{Action: action, Page: 1, PageSize: 100, Sort: "created_at", Direction: "desc"})
		if err != nil {
			t.Fatal(err)
		}
		return list.Items
	}
	denials := entries("authz.denied")
	super := 0
	for _, entry := range denials {
		if entry.ActorName != "auditor" || entry.Realm != "administrator" {
			t.Fatal("denial audit attribution", entry)
		}
		if strings.Contains(entry.Detail, "reason=super_admin") && strings.Contains(entry.Detail, "operation=logTail") {
			super++
		}
	}
	if super == 0 {
		t.Fatal("super_admin denial not audited", len(denials))
	}
	// 1 + denialAuditPerMinute+10 attempts, capped at the per-identity limit.
	if len(denials) != denialAuditPerMinute {
		t.Fatal("denial audit cap not enforced", len(denials))
	}
	csrf := entries("auth.csrf.invalid")
	if len(csrf) != 1 || csrf[0].ActorName != "admin" {
		t.Fatal("csrf denial audit", csrf)
	}
}
