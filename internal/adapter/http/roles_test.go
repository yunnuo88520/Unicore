// Author: yunnuo <ymz@ebox.vip>
// Description: Management authorization matrices: anonymous/member refusal, realm-aware roles and restricted administrators.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
	apispec "github.com/yunnuo/unicore/packages/contracts"
)

// rolePtr marks a UserUpdate role as explicitly assigned.
func rolePtr(v string) *string { return &v }

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
			method, path := strings.ToUpper(parts[0]), strings.ReplaceAll(parts[1], "{id}", "missing")
			if w := request(method, path, map[string]any{}, nil, ""); w.Code != 401 {
				t.Fatal("anonymous", route, w.Code, w.Body.String())
			}
			expected := http.StatusForbidden
			if operation.ID == "adminFileAccess" {
				expected = http.StatusNotFound
			}
			if w := request(method, path, map[string]any{}, member, memberCSRF); w.Code != expected {
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
	// Departments moved to administrator-only and posts never were assignable,
	// so the assignable set is files:*/notes:* (seven in total).
	if len(boot.Data.CurrentUser.Permissions) != 7 || boot.Data.CurrentUser.Permissions[0] != "files:access" {
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
	if w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "escalated", "permissions": []string{"users:read"}}, admin, adminCSRF); w.Code != 200 {
		t.Fatal("management permission assignment failed", w.Code)
	}
	w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "编辑者", "permissions": []string{"files:access"}}, admin, adminCSRF)
	if w.Code != 200 {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" || created.Data.Builtin || created.Data.Realm != "user" {
		t.Fatal("role create payload", w.Body.String(), err)
	}
	roleID := created.Data.ID
	if w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "编辑者", "permissions": []string{}}, admin, adminCSRF); w.Code != 409 {
		t.Fatal("duplicate role name accepted", w.Code)
	}
	w = request("GET", "/api/v1/admin/roles", nil, admin, "")
	var roles contracts.RoleListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &roles); err != nil || w.Code != 200 || len(roles.Data.Items) != 4 {
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
	if w = request("PATCH", "/api/v1/admin/users/"+memberID, contracts.UserUpdate{Role: rolePtr(roleID), Status: "active"}, admin, adminCSRF); w.Code != 200 {
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
	if err := json.Unmarshal(w.Body.Bytes(), &options); err != nil || w.Code != 200 || len(options.Data.Items) != 4 {
		t.Fatal("role options", w.Code, w.Body.String(), err)
	}
	// Administrator options list super_admin plus administrator-realm roles only.
	w = request("GET", "/api/v1/admin/roles/admin-options", nil, admin, "")
	if err := json.Unmarshal(w.Body.Bytes(), &options); err != nil || w.Code != 200 || len(options.Data.Items) != 4 || options.Data.Items[0].ID != "super_admin" {
		t.Fatal("administrator role options", w.Code, w.Body.String(), err)
	}
	// Restore the builtin role, then delete the custom one.
	if w = request("PATCH", "/api/v1/admin/users/"+memberID, contracts.UserUpdate{Role: rolePtr("user"), Status: "active"}, admin, adminCSRF); w.Code != 200 {
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

// TestRestrictedAdministrator drives the restricted-administrator flow end to
// end: an administrator-realm role grants user management, announcement reads
// and menu edits; role management, administrator management and ungranted
// permissions stay refused; the last active super_admin keeps its guard and
// role changes revoke the member session.
func TestRestrictedAdministrator(t *testing.T) {
	ctx := context.Background()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	tokenBytes, _ := os.ReadFile(manager.TokenPath())
	token := strings.TrimSpace(string(tokenBytes))
	router := New(Config{Core: bootstrap.Core(), Metadata: runtime.Metadata("web-platform", "development"), Install: manager, Assets: fstest.MapFS{"admin.html": {Data: []byte("<html>admin</html>")}, "index.html": {Data: []byte("<html>app</html>")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, input any, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
		t.Helper()
		raw, _ := json.Marshal(input)
		r := httptest.NewRequest(method, "http://localhost"+path, bytes.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Bootstrap-Token", token)
		r.Header.Set("X-CSRF-Token", csrf)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	captchaLogin := func(username, password string) *http.Cookie {
		t.Helper()
		w := request("GET", "/api/v1/admin/auth/captcha", nil, nil, "")
		var challenge contracts.CaptchaResponse
		_ = json.Unmarshal(w.Body.Bytes(), &challenge)
		svg, _ := base64.StdEncoding.DecodeString(strings.SplitN(challenge.Data.Image, ",", 2)[1])
		answer := ""
		for _, match := range regexp.MustCompile(`>([0-9])</text>`).FindAllStringSubmatch(string(svg), -1) {
			answer += match[1]
		}
		w = request("POST", "/api/v1/admin/auth/login", contracts.LoginInput{Username: username, Password: password, CaptchaID: challenge.Data.ID, CaptchaAnswer: answer}, nil, "")
		if w.Code != 200 {
			t.Fatal("restricted login", w.Code, w.Body.String())
		}
		return w.Result().Cookies()[0]
	}

	input := contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Restricted", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"}
	w := request("POST", "/api/v1/install/complete", input, nil, "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	adminCookie := w.Result().Cookies()[0]
	w = request("GET", "/api/v1/admin/bootstrap", nil, adminCookie, "")
	var boot contracts.BootstrapResponse
	if err := json.Unmarshal(w.Body.Bytes(), &boot); err != nil {
		t.Fatal(err)
	}
	csrf := *boot.Data.CsrfToken
	superID := boot.Data.CurrentUser.ID

	// The administrator-realm role takes management permission points; the
	// omitted realm keeps the user-realm default.
	w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "受限管理员", "data_scope": "all", "realm": "administrator", "permissions": []string{"users:read", "users:create", "users:update", "announcements:read", "menus:write"}}, adminCookie, csrf)
	if w.Code != 200 {
		t.Fatal("restricted role create", w.Code, w.Body.String())
	}
	var restricted contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &restricted); err != nil || restricted.Data.Realm != "administrator" {
		t.Fatal("restricted role payload", w.Body.String(), err)
	}
	roleID := restricted.Data.ID
	w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "用户域角色", "permissions": []string{"files:access"}}, adminCookie, csrf)
	if w.Code != 200 {
		t.Fatal("user realm role create", w.Code, w.Body.String())
	}

	// Administrator options offer super_admin plus administrator-realm roles.
	w = request("GET", "/api/v1/admin/roles/admin-options", nil, adminCookie, "")
	var options contracts.RoleOptionsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &options); err != nil || w.Code != 200 || len(options.Data.Items) != 4 || options.Data.Items[0].ID != "super_admin" {
		t.Fatal("administrator options", w.Code, w.Body.String(), err)
	}

	// Creating an administrator with the restricted role works; user-realm
	// roles are refused.
	w = request("POST", "/api/v1/admin/administrators", contracts.UserCreate{Username: "restricted", Email: "restricted@example.test", Password: "test-password-strong", Role: roleID}, adminCookie, csrf)
	if w.Code != 200 {
		t.Fatal("restricted administrator create", w.Code, w.Body.String())
	}
	w = request("POST", "/api/v1/admin/administrators", contracts.UserCreate{Username: "crossed", Email: "crossed@example.test", Password: "test-password-strong", Role: "user"}, adminCookie, csrf)
	if w.Code != 200 {
		t.Fatal("unified role assignment", w.Code, w.Body.String())
	}
	w = request("GET", "/api/v1/admin/administrators", nil, adminCookie, "")
	var admins contracts.UserListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &admins); err != nil || w.Code != 200 {
		t.Fatal("administrator list", w.Code, w.Body.String(), err)
	}
	echo := false
	for _, account := range admins.Data.Items {
		if account.Username == "restricted" {
			echo = len(account.Roles) == 1 && account.Roles[0] == roleID && platform.Has(account, "users:read") && platform.Has(account, "menus:write") && !platform.Has(account, "settings:read")
		}
	}
	if !echo {
		t.Fatal("restricted administrator echo", w.Body.String())
	}

	// The restricted administrator signs in through the administrator realm.
	restrictedCookie := captchaLogin("restricted", "test-password-strong")
	w = request("GET", "/api/v1/admin/bootstrap", nil, restrictedCookie, "")
	if err := json.Unmarshal(w.Body.Bytes(), &boot); err != nil {
		t.Fatal(err)
	}
	restrictedCSRF := *boot.Data.CsrfToken
	if len(boot.Data.CurrentUser.Permissions) != 5 || boot.Data.CurrentUser.Permissions[0] != "announcements:read" {
		t.Fatal("restricted bootstrap grants", w.Body.String())
	}

	// Granted operations pass: user management, announcement reads, menu edits.
	w = request("GET", "/api/v1/admin/users", nil, restrictedCookie, "")
	if w.Code != 200 {
		t.Fatal("restricted user list", w.Code, w.Body.String())
	}
	w = request("POST", "/api/v1/admin/users", contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, restrictedCookie, restrictedCSRF)
	if w.Code != 200 {
		t.Fatal("restricted user create", w.Code, w.Body.String())
	}
	var member contracts.UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &member); err != nil || member.Data.ID == "" {
		t.Fatal("member payload", w.Body.String(), err)
	}
	w = request("PATCH", "/api/v1/admin/users/"+member.Data.ID, contracts.UserUpdate{Status: "disabled"}, restrictedCookie, restrictedCSRF)
	if w.Code != 200 {
		t.Fatal("restricted user update", w.Code, w.Body.String())
	}
	w = request("GET", "/api/v1/admin/announcements", nil, restrictedCookie, "")
	if w.Code != 200 {
		t.Fatal("restricted announcements", w.Code, w.Body.String())
	}
	w = request("PUT", "/api/v1/admin/menus", map[string]any{"version": 1, "sections": []any{}, "nodes": []any{}}, restrictedCookie, restrictedCSRF)
	if w.Code != 200 {
		t.Fatal("restricted menus save", w.Code, w.Body.String())
	}

	// Ungranted permissions and super-admin operations stay refused.
	forbidden := [][2]string{
		{"GET", "/api/v1/admin/roles"},
		{"GET", "/api/v1/admin/settings"},
		{"GET", "/api/v1/admin/logs"},
		{"GET", "/api/v1/admin/tasks"},
		{"GET", "/api/v1/admin/updates"},
	}
	for _, caseItem := range forbidden {
		if w = request(caseItem[0], caseItem[1], nil, restrictedCookie, ""); w.Code != 403 {
			t.Fatal("ungranted permission accepted", caseItem, w.Code, w.Body.String())
		}
	}
	if w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "越权", "permissions": []string{}}, restrictedCookie, restrictedCSRF); w.Code != 403 {
		t.Fatal("restricted role management", w.Code, w.Body.String())
	}
	if w = request("GET", "/api/v1/admin/roles/admin-options", nil, restrictedCookie, ""); w.Code != 403 {
		t.Fatal("restricted administrator options", w.Code, w.Body.String())
	}
	if w = request("POST", "/api/v1/admin/administrators", contracts.UserCreate{Username: "escalated", Email: "escalated@example.test", Password: "test-password-strong", Role: "super_admin"}, restrictedCookie, restrictedCSRF); w.Code != 403 {
		t.Fatal("restricted administrator management", w.Code, w.Body.String())
	}
	if w = request("PUT", "/api/v1/admin/branding", map[string]any{}, restrictedCookie, restrictedCSRF); w.Code != 403 {
		t.Fatal("restricted branding", w.Code, w.Body.String())
	}

	// The last active super_admin keeps its guard; the restricted
	// administrator does not count toward it.
	if w = request("PATCH", "/api/v1/admin/administrators/"+superID, contracts.UserUpdate{Status: "disabled"}, adminCookie, csrf); w.Code != 409 {
		t.Fatal("last super admin disable", w.Code, w.Body.String())
	}

	// A role permission change revokes the member session.
	w = request("PUT", "/api/v1/admin/roles/"+roleID, map[string]any{"name": "受限管理员", "data_scope": "all", "permissions": []string{"announcements:read"}}, adminCookie, csrf)
	if w.Code != 200 {
		t.Fatal("role permission change", w.Code, w.Body.String())
	}
	if w = request("GET", "/api/v1/admin/users", nil, restrictedCookie, ""); w.Code != 401 {
		t.Fatal("role change kept restricted session", w.Code, w.Body.String())
	}
}
