// Author: yunnuo <ymz@ebox.vip>
// Description: Authorization and CSRF across every role endpoint using real handlers.
package httpadapter

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
)

func exerciseRoleHTTP(t *testing.T, manager *install.Manager, request func(string, string, any, *http.Cookie, string) *httptest.ResponseRecorder, admin, member *http.Cookie, adminCSRF, memberCSRF string) {
	t.Helper()
	input := contracts.RoleInput{Name: "支持团队", Permissions: []string{"users:read", "roles:read"}}
	for _, endpoint := range []struct{ method, path string }{{"GET", "/admin/roles"}, {"POST", "/admin/roles"}, {"PATCH", "/admin/roles/missing"}, {"DELETE", "/admin/roles/missing"}, {"GET", "/admin/users/role-options"}} {
		path := "/api/v1" + endpoint.path
		if w := request(endpoint.method, path, input, nil, ""); w.Code != 401 {
			t.Fatal("anonymous role API", endpoint, w.Code, w.Body.String())
		}
		if w := request(endpoint.method, path, input, member, memberCSRF); w.Code != 403 {
			t.Fatal("ordinary role API", endpoint, w.Code, w.Body.String())
		}
		if endpoint.method != "GET" {
			if w := request(endpoint.method, path, input, admin, ""); w.Code != 403 {
				t.Fatal("role write missing CSRF", endpoint, w.Code)
			}
		}
	}
	// Even a stale/accidental protected grant cannot turn a business account into an administrator.
	_, _, identity, _ := manager.Services()
	repository := identity.Store.(*platformsql.Repository)
	for _, permission := range []string{"roles:write", "users:update", "settings:write"} {
		if _, err := repository.Store.Exec(t.Context(), repository.Store.DB, "INSERT INTO role_permissions(role_id,permission_id) VALUES('user',?)", permission); err != nil {
			t.Fatal(err)
		}
	}
	for _, endpoint := range []struct{ method, path string }{{"PATCH", "/admin/settings"}, {"POST", "/admin/settings/mail/test"}, {"POST", "/admin/roles"}, {"PATCH", "/admin/users/missing"}} {
		if w := request(endpoint.method, "/api/v1"+endpoint.path, input, member, memberCSRF); w.Code != 403 {
			t.Fatal("protected grant bypass", endpoint, w.Code, w.Body.String())
		}
	}
	if _, err := repository.Store.Exec(t.Context(), repository.Store.DB, "DELETE FROM role_permissions WHERE role_id='user'"); err != nil {
		t.Fatal(err)
	}
	w := request("POST", "/api/v1/admin/roles", input, admin, adminCSRF)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	for _, permission := range []string{"roles:write", "users:update", "settings:write", "unknown:action"} {
		if w = request("PATCH", "/api/v1/admin/roles/"+created.Data.ID, contracts.RoleInput{Name: input.Name, Permissions: []string{permission}}, admin, adminCSRF); w.Code != 400 {
			t.Fatal("protected grant accepted", w.Code, w.Body.String())
		}
	}
	if w = request("PATCH", "/api/v1/admin/roles/user", input, admin, adminCSRF); w.Code != 409 {
		t.Fatal("builtin edited", w.Code)
	}
	if w = request("DELETE", "/api/v1/admin/roles/super_admin", nil, admin, adminCSRF); w.Code != 409 {
		t.Fatal("builtin deleted", w.Code)
	}
	if w = request("GET", "/api/v1/admin/roles", nil, admin, ""); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	input.Name = "支持团队只读"
	if w = request("PATCH", "/api/v1/admin/roles/"+created.Data.ID, input, admin, adminCSRF); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = request("DELETE", "/api/v1/admin/roles/"+created.Data.ID, nil, admin, adminCSRF); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = request("DELETE", "/api/v1/admin/roles/"+created.Data.ID, nil, admin, adminCSRF); w.Code != 404 {
		t.Fatal("missing role", w.Code)
	}
}
