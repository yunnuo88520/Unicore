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
	"github.com/yunnuo/unicore/internal/platform"
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
	_, _, identity, _ := manager.Services()
	repository := identity.Store.(*platformsql.Repository)
	for _, permission := range platform.Permissions {
		if _, err := repository.Store.Exec(t.Context(), repository.Store.DB, "INSERT INTO role_permissions(role_id,permission_id) VALUES('user',?)", permission); err != nil {
			t.Fatal(err)
		}
	}
	check()
	w := request("GET", "/api/v1/bootstrap", nil, member, "")
	var boot contracts.BootstrapResponse
	if err := json.Unmarshal(w.Body.Bytes(), &boot); err != nil {
		t.Fatal(err)
	}
	if len(boot.Data.CurrentUser.Permissions) != 0 || boot.Data.Theme != nil {
		t.Fatal("member received grants/global appearance", w.Body.String())
	}
	for _, path := range []string{"/api/v1/settings", "/api/v1/branding"} {
		if w = request("GET", path, nil, member, ""); w.Code != 404 {
			t.Fatal("local API bypass", path, w.Code)
		}
	}
	if w = request("GET", "/admin", nil, member, ""); w.Code != 200 {
		t.Fatal("administrator entry must allow independent login", w.Code)
	}
	if w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "bypass", "permissions": []string{}}, admin, adminCSRF); w.Code != 405 {
		t.Fatal("role creation still exists", w.Code)
	}
	for _, method := range []string{"PATCH", "DELETE"} {
		if w = request(method, "/api/v1/admin/roles/user", map[string]any{}, admin, adminCSRF); w.Code != 404 {
			t.Fatal("role mutation still exists", method, w.Code)
		}
	}
	if w = request("POST", "/api/v1/admin/users", contracts.UserCreate{Username: "invalidrole", Email: "invalidrole@example.test", Password: "test-password-strong", Role: "custom"}, admin, adminCSRF); w.Code != 400 {
		t.Fatal("custom role accepted", w.Code)
	}
	w = request("GET", "/api/v1/admin/roles", nil, admin, "")
	var roles contracts.RoleListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &roles); err != nil || w.Code != 200 || len(roles.Data.Items) != 2 {
		t.Fatal("fixed role catalogue", w.Code, w.Body.String(), err)
	}
	for _, role := range roles.Data.Items {
		if !role.Builtin {
			t.Fatal("custom role exposed")
		}
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
