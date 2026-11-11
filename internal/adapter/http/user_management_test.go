// Author: yunnuo <ymz@ebox.vip>
// Description: User management completion: full-field editing, nickname display and the member password reset with its audit and revocation trail.
package httpadapter

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
)

// TestUserFullFieldEditingAndNickname covers the extended editor: creation with
// a nickname, the users list preferring it, email replacement with a conflict
// rejection and the session-revoking assignment semantics.
func TestUserFullFieldEditingAndNickname(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)

	w := request("POST", "/api/v1/admin/users", map[string]any{
		"username": "editor", "email": "editor@example.test", "password": "test-password-strong", "display_name": "小陈",
	}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("member create", w.Code, w.Body.String())
	}
	var created contracts.UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Data.DisplayName == nil || *created.Data.DisplayName != "小陈" {
		t.Fatal("created nickname missing", created.Data.DisplayName)
	}
	if created.Data.Username != "editor" {
		t.Fatal("username echo", created.Data.Username)
	}

	// The listing carries the nickname; displays prefer it over the username.
	w = request("GET", "/api/v1/admin/users?search=editor", nil, adminCookie, "")
	if w.Code != 200 {
		t.Fatal("user list", w.Code, w.Body.String())
	}
	var list contracts.UserListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Data.Items) != 1 || list.Data.Items[0].DisplayName == nil || *list.Data.Items[0].DisplayName != "小陈" {
		t.Fatal("listed nickname missing", w.Body.String())
	}

	// Email and nickname ride the shared update endpoint; roles stay omitted.
	w = request("PATCH", "/api/v1/admin/users/"+created.Data.ID, contracts.UserUpdate{
		Status: "active", Email: strPtr("chen@example.test"), DisplayName: strPtr("陈小二"),
	}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("email and nickname update", w.Code, w.Body.String())
	}
	var updated contracts.UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Data.Email != "chen@example.test" || updated.Data.DisplayName == nil || *updated.Data.DisplayName != "陈小二" {
		t.Fatal("edit echo", updated.Data.Email, updated.Data.DisplayName)
	}

	// A replacement address colliding with another account is a conflict, and
	// a malformed one is invalid input.
	w = request("PATCH", "/api/v1/admin/users/"+created.Data.ID, contracts.UserUpdate{Status: "active", Email: strPtr("admin@example.test")}, adminCookie, adminCSRF)
	if w.Code != 409 {
		t.Fatal("duplicate email accepted", w.Code, w.Body.String())
	}
	w = request("PATCH", "/api/v1/admin/users/"+created.Data.ID, contracts.UserUpdate{Status: "active", Email: strPtr("not-an-email")}, adminCookie, adminCSRF)
	if w.Code != 400 {
		t.Fatal("invalid email accepted", w.Code, w.Body.String())
	}

	// Clearing the nickname falls back to the username at every display point.
	w = request("PATCH", "/api/v1/admin/users/"+created.Data.ID, contracts.UserUpdate{Status: "active", DisplayName: strPtr("")}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("nickname clear", w.Code, w.Body.String())
	}
	var cleared contracts.UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &cleared); err != nil {
		t.Fatal(err)
	}
	if cleared.Data.DisplayName == nil || *cleared.Data.DisplayName != "" {
		t.Fatal("nickname not cleared", cleared.Data.DisplayName)
	}

	// The audit trail records the field updates.
	if !auditContains(t, manager, "users.updated", "email=updated") {
		t.Fatal("email change unaudited")
	}
}

// TestMemberPasswordReset covers the management reset endpoint: a generated
// temporary password comes back once, logs in, the old session dies, the
// dedicated audit action lands, and both the management boundary and the
// super-admin protection hold.
func TestMemberPasswordReset(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	_, _, identity, _ := manager.Services()

	member, err := identity.Create(t.Context(), contracts.UserCreate{Username: "resettable", Email: "reset@example.test", Password: "test-password-strong"}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	memberCookie, _ := issueSession(t, manager, false, member)

	// Login captchas stay off so the temporary password can be replayed
	// through the real login endpoint without OCR.
	if w := request("PATCH", "/api/v1/admin/settings", contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.login_captcha", Value: "false"}}}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("captcha setting", w.Code, w.Body.String())
	}

	// A member can never reach the management reset: the policy middleware
	// refuses before the handler runs.
	w := request("POST", "/api/v1/admin/users/"+member.ID+"/password", map[string]any{}, memberCookie, "")
	if w.Code != 401 && w.Code != 403 {
		t.Fatal("member reached the reset endpoint", w.Code, w.Body.String())
	}

	// Generated temporary password: echoed once, satisfies the login rules.
	w = request("POST", "/api/v1/admin/users/"+member.ID+"/password", map[string]any{}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("generated reset", w.Code, w.Body.String())
	}
	var generated contracts.AdminPasswordResetResponse
	if err := json.Unmarshal(w.Body.Bytes(), &generated); err != nil {
		t.Fatal(err)
	}
	if len(generated.Data.Password) < 12 {
		t.Fatal("temporary password too weak", generated.Data.Password)
	}
	if !auditContains(t, manager, "users.password.reset", "sessions=revoked") {
		t.Fatal("generated reset unaudited")
	}

	// The old session is gone; the temporary password logs in.
	w = request("GET", "/api/v1/auth/session", nil, memberCookie, "")
	if w.Code != 401 {
		t.Fatal("old session survived the reset", w.Code, w.Body.String())
	}
	w = request("POST", "/api/v1/auth/login", map[string]any{"username": "resettable", "password": generated.Data.Password, "captcha_id": "", "captcha_answer": ""}, nil, "")
	if w.Code != 200 {
		t.Fatal("temporary password rejected", w.Code, w.Body.String())
	}

	// An operator-typed replacement works the same way.
	w = request("POST", "/api/v1/admin/users/"+member.ID+"/password", map[string]any{"password": "typed-new-password-1"}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("typed reset", w.Code, w.Body.String())
	}
	var typed contracts.AdminPasswordResetResponse
	if err := json.Unmarshal(w.Body.Bytes(), &typed); err != nil || typed.Data.Password != "typed-new-password-1" {
		t.Fatal("typed echo", w.Body.String(), err)
	}
	w = request("POST", "/api/v1/auth/login", map[string]any{"username": "resettable", "password": "typed-new-password-1", "captcha_id": "", "captcha_answer": ""}, nil, "")
	if w.Code != 200 {
		t.Fatal("typed password rejected", w.Code, w.Body.String())
	}

	// The super administrator's own credential stays out of reach for
	// restricted operators: a users:update holder without the super role may
	// reset members but never a super administrator.
	realm := "administrator"
	passwordRole, err := identity.Store.CreateRole(t.Context(), contracts.RoleSaveInput{Name: "密码员", Realm: &realm, Permissions: []string{"users:read", "users:update"}}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal("role create", err)
	}
	restricted, err := identity.Create(t.Context(), contracts.UserCreate{Username: "restricted-op", Email: "restricted-op@example.test", Password: "test-password-strong", RoleIds: &[]string{passwordRole.ID}}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	restrictedCookie, restrictedCSRF := issueSession(t, manager, true, restricted)
	w = request("POST", "/api/v1/admin/users/"+adminUser(t, manager).ID+"/password", map[string]any{}, restrictedCookie, restrictedCSRF)
	if w.Code != 403 {
		t.Fatal("restricted operator reset a super administrator", w.Code, w.Body.String())
	}
	w = request("POST", "/api/v1/admin/users/"+adminUser(t, manager).ID+"/password", map[string]any{}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("self reset", w.Code, w.Body.String())
	}
	if !auditContains(t, manager, "users.password.reset", "sessions=revoked") {
		t.Fatal("typed reset unaudited")
	}
}

func strPtr(value string) *string { return &value }

// auditContains scans the audit log for one action carrying a detail fragment.
func auditContains(t *testing.T, manager *install.Manager, action, fragment string) bool {
	t.Helper()
	list, err := manager.Identity(false).Store.SystemLogs(t.Context(), contracts.AuditLogQuery{Action: action, Page: 1, PageSize: 20, Sort: "created_at", Direction: "desc"})
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range list.Items {
		if entry.Action == action && strings.Contains(entry.Detail, fragment) {
			return true
		}
	}
	return false
}
