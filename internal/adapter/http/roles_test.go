// Author: yunnuo <ymz@ebox.vip>
// Description: Every management operation rejects anonymous/member access, including stale grants.
package httpadapter

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	apispec "github.com/yunnuo/unicore/packages/contracts"
)

func exerciseRoleHTTP(t *testing.T, manager *install.Manager, request func(string, string, any, *http.Cookie, string) *httptest.ResponseRecorder, admin, member *http.Cookie, adminCSRF, memberCSRF string) {
	t.Helper()
	check := func() {
		for route, operation := range apispec.Operations() {
			parts := strings.SplitN(route, " ", 2)
			if !strings.HasPrefix(parts[1], "/api/v1/admin/") {
				continue
			}
			if len(operation.Policy.Permissions) == 0 {
				continue
			}
			if !operation.Policy.SuperAdmin {
				t.Fatal("management contract lacks admin requirement", route)
			}
			method, path := strings.ToUpper(parts[0]), strings.ReplaceAll(parts[1], "{id}", "missing")
			if w := request(method, path, map[string]any{}, nil, ""); w.Code != 401 {
				t.Fatal("anonymous", route, w.Code, w.Body.String())
			}
			if w := request(method, path, map[string]any{}, member, memberCSRF); w.Code != 403 {
				t.Fatal("member", route, w.Code, w.Body.String())
			}
			if method != "GET" {
				if w := request(method, path, map[string]any{}, admin, ""); w.Code != 403 {
					t.Fatal("missing csrf", route, w.Code)
				}
			}
		}
	}
	check()
	// The builtin user role starts with the assignable permission points only.
	w := request("GET", "/api/v1/bootstrap", nil, member, "")
	var boot contracts.BootstrapResponse
	if err := json.Unmarshal(w.Body.Bytes(), &boot); err != nil {
		t.Fatal(err)
	}
	if len(boot.Data.CurrentUser.Permissions) != 2 || boot.Data.CurrentUser.Permissions[0] != "files:access" {
		t.Fatal("member default grants wrong", w.Body.String())
	}
	memberID := boot.Data.CurrentUser.ID
	for _, path := range []string{"/api/v1/settings", "/api/v1/branding"} {
		if w = request("GET", path, nil, member, ""); w.Code != 404 {
			t.Fatal("local API bypass", path, w.Code)
		}
	}
	if w = request("GET", "/admin", nil, member, ""); w.Code != 200 {
		t.Fatal("administrator entry must allow independent login", w.Code)
	}
	// Custom role management is a super_admin capability.
	if w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "editor", "permissions": []string{}}, member, memberCSRF); w.Code != 403 {
		t.Fatal("member managed roles", w.Code)
	}
	if w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "", "permissions": []string{}}, admin, adminCSRF); w.Code != 400 {
		t.Fatal("empty role name", w.Code)
	}
	if w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "escalated", "permissions": []string{"users:read"}}, admin, adminCSRF); w.Code != 403 {
		t.Fatal("management permission grantable", w.Code)
	}
	w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "编辑者", "permissions": []string{"files:access"}}, admin, adminCSRF)
	if w.Code != 200 {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" || created.Data.Builtin {
		t.Fatal("role create payload", w.Body.String(), err)
	}
	roleID := created.Data.ID
	if w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "编辑者", "permissions": []string{}}, admin, adminCSRF); w.Code != 409 {
		t.Fatal("duplicate role name accepted", w.Code)
	}
	w = request("GET", "/api/v1/admin/roles", nil, admin, "")
	var roles contracts.RoleListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &roles); err != nil || w.Code != 200 || len(roles.Data.Items) != 3 {
		t.Fatal("role catalogue", w.Code, w.Body.String(), err)
	}
	for _, role := range roles.Data.Items {
		if role.ID == roleID && role.Builtin {
			t.Fatal("custom role flagged builtin")
		}
	}
	// Assign the custom role to the member; grants follow the role_permissions
	// table and the assignment revokes the member session.
	memberPerms := func() []string {
		w := request("GET", "/api/v1/admin/users?search=member", nil, admin, "")
		var list contracts.UserListResponse
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || w.Code != 200 {
			t.Fatal("member list", w.Code, w.Body.String(), err)
		}
		for _, u := range list.Data.Items {
			if u.ID == memberID {
				return u.Permissions
			}
		}
		t.Fatal("member not listed")
		return nil
	}
	if w = request("PATCH", "/api/v1/admin/users/"+memberID, contracts.UserUpdate{Role: roleID, Status: "active"}, admin, adminCSRF); w.Code != 200 {
		t.Fatal("role assignment", w.Code, w.Body.String())
	}
	if perms := memberPerms(); len(perms) != 1 || perms[0] != "files:access" {
		t.Fatal("custom role grants missing", perms)
	}
	if w = request("PUT", "/api/v1/admin/roles/"+roleID, map[string]any{"name": "编辑者", "permissions": []string{"notes:access"}}, admin, adminCSRF); w.Code != 200 {
		t.Fatal("role update", w.Code, w.Body.String())
	}
	if perms := memberPerms(); len(perms) != 1 || perms[0] != "notes:access" {
		t.Fatal("role update did not change grants", perms)
	}
	// The revocation removed the member session issued before the change.
	w = request("GET", "/api/v1/bootstrap", nil, member, "")
	if err := json.Unmarshal(w.Body.Bytes(), &boot); err != nil {
		t.Fatal(err)
	}
	_, _, identitySvc, _ := manager.Services()
	repo := identitySvc.Store.(*platformsql.Repository)
	var sessionCount int
	if err := repo.Store.DB.QueryRowContext(t.Context(), "SELECT COUNT(*) FROM unicore_sessions WHERE user_id=?", memberID).Scan(&sessionCount); err != nil {
		t.Fatal(err)
	}
	if sessionCount != 0 {
		t.Fatal("role change did not revoke sessions", sessionCount, w.Body.String())
	}
	if w = request("DELETE", "/api/v1/admin/roles/"+roleID, nil, admin, adminCSRF); w.Code != 409 {
		t.Fatal("role with members deleted", w.Code)
	}
	// Role options follow the realm: user realm offers user + custom roles.
	w = request("GET", "/api/v1/admin/users/role-options", nil, admin, "")
	var options contracts.RoleOptionsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &options); err != nil || w.Code != 200 || len(options.Data.Items) != 2 {
		t.Fatal("role options", w.Code, w.Body.String(), err)
	}
	// Restore the builtin role, then delete the custom one.
	if w = request("PATCH", "/api/v1/admin/users/"+memberID, contracts.UserUpdate{Role: "user", Status: "active"}, admin, adminCSRF); w.Code != 200 {
		t.Fatal("role restore", w.Code, w.Body.String())
	}
	if w = request("DELETE", "/api/v1/admin/roles/"+roleID, nil, admin, adminCSRF); w.Code != 200 {
		t.Fatal("role delete", w.Code, w.Body.String())
	}
	if w = request("DELETE", "/api/v1/admin/roles/user", nil, admin, adminCSRF); w.Code != 403 {
		t.Fatal("builtin role deleted", w.Code)
	}
	if w = request("POST", "/api/v1/admin/users", contracts.UserCreate{Username: "invalidrole", Email: "invalidrole@example.test", Password: "test-password-strong", Role: "missing-role"}, admin, adminCSRF); w.Code != 400 {
		t.Fatal("unknown role accepted", w.Code)
	}
	w = request("PATCH", "/api/v1/admin/settings", contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "appearance.theme", Value: "dark"}}}, admin, adminCSRF)
	if w.Code != 400 {
		t.Fatal("platform global appearance accepted", w.Code)
	}
	w = request("GET", "/api/v1/admin/settings", nil, admin, "")
	var values contracts.SettingsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &values); err != nil || w.Code != 200 {
		t.Fatal(err, w.Body.String())
	}
	for _, entry := range values.Data.Items {
		if entry.Key == "appearance.theme" {
			t.Fatal("platform global appearance exposed")
		}
	}
}
