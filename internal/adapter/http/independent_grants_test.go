// Author: yunnuo <ymz@ebox.vip>
// Description: Independent grant namespaces (menu / action / API operation) and the
// data-scope write boundary: revoking one namespace keeps the others, and scoped
// operators cannot write targets outside their resolved user set.
package httpadapter

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
)

// TestIndependentGrantRevocation pins the ADR-0040 namespaces: menu and action
// revocations leave API operation grants intact, and revoking the operations
// alone closes the API while the held permission point still reads.
func TestIndependentGrantRevocation(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "用户运营", "realm": "administrator", "permissions": []string{"users:read", "users:create"}, "operation_ids": []string{"createUser", "exportUsers", "importUsers", "listUsers", "roleOptions", "userImportTemplate"}}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	// Explicit grants only: the submitted operation rows persist, while menu
	// and action visibility start empty until the editor grants them.
	if len(created.Data.OperationIds) == 0 || len(created.Data.MenuIds) != 0 || len(created.Data.ActionIds) != 0 {
		t.Fatal("explicit grants missing", created.Data.MenuIds, created.Data.ActionIds, created.Data.OperationIds)
	}
	operations := append([]string{}, created.Data.OperationIds...)

	// Revoke menus and buttons explicitly, omit the operation array: the API
	// layer keeps working, the entry points disappear.
	empty := []string{}
	w = request("PUT", "/api/v1/admin/roles/"+created.Data.ID, map[string]any{
		"version": created.Data.Version, "name": "用户运营",
		"permissions": []string{"users:read", "users:create"}, "operation_ids": []string{"createUser", "exportUsers", "importUsers", "listUsers", "roleOptions", "userImportTemplate"},
		"menu_ids": empty, "action_ids": empty,
	}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("menu/action revocation", w.Code, w.Body.String())
	}
	var revoked contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &revoked); err != nil {
		t.Fatal(err)
	}
	if len(revoked.Data.MenuIds) != 0 || len(revoked.Data.ActionIds) != 0 {
		t.Fatal("menu or action grants survived", revoked.Data.MenuIds, revoked.Data.ActionIds)
	}
	if len(revoked.Data.OperationIds) != len(operations) {
		t.Fatal("menu revocation altered API grants", revoked.Data.OperationIds, operations)
	}
	_, _, identity, _ := manager.Services()
	operator, err := identity.Create(t.Context(), contracts.UserCreate{Username: "operator", Email: "operator@example.test", Password: "test-password-strong", Role: created.Data.ID}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	operatorCookie, _ := issueSession(t, manager, true, operator)
	if w = request("GET", "/api/v1/admin/users", nil, operatorCookie, ""); w.Code != http.StatusOK {
		t.Fatal("API grant lost after menu revocation", w.Code, w.Body.String())
	}

	// Revoking the operations alone closes the API while the permission point
	// and the (revoked) menus stay untouched elsewhere.
	w = request("PUT", "/api/v1/admin/roles/"+created.Data.ID, map[string]any{
		"version": revoked.Data.Version, "name": "用户运营",
		"permissions":   []string{"users:read", "users:create"},
		"operation_ids": empty,
	}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("operation revocation", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &revoked); err != nil {
		t.Fatal(err)
	}
	if len(revoked.Data.OperationIds) != 0 || len(revoked.Data.MenuIds) != 0 {
		t.Fatal("operation revocation payload", revoked.Data.OperationIds, revoked.Data.MenuIds)
	}
	// The role edit revoked the member session; grants are baked into sessions.
	operatorCookie, _ = issueSession(t, manager, true, operator)
	if w = request("GET", "/api/v1/admin/users", nil, operatorCookie, ""); w.Code != http.StatusForbidden {
		t.Fatal("revoked operation still serves", w.Code, w.Body.String())
	}
}

// TestDataScopeWriteBoundary pins the write side of the five-value scopes: a
// department-scoped operator refuses reads and writes outside the resolved
// user set, including create targets in foreign departments, while the same
// requests inside the department succeed.
func TestDataScopeWriteBoundary(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	dept := func(name string) string {
		t.Helper()
		w := request("POST", "/api/v1/admin/departments", map[string]any{"name": name}, adminCookie, adminCSRF)
		if w.Code != http.StatusOK {
			t.Fatal("department create", name, w.Code, w.Body.String())
		}
		var created struct {
			Data struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
			t.Fatal("department payload", w.Body.String(), err)
		}
		return created.Data.ID
	}
	deptA, deptB := dept("范围内部门"), dept("范围外部门")
	scope := "dept"
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "部门运营", "data_scope": scope, "permissions": []string{"users:read", "users:create", "users:update"}, "operation_ids": []string{"createUser", "exportUsers", "importUsers", "listUsers", "roleOptions", "updateUser", "userImportTemplate"}}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	_, _, identity, _ := manager.Services()
	admin := adminUser(t, manager)
	operator, err := identity.Create(t.Context(), contracts.UserCreate{Username: "dept-operator", Email: "dept-operator@example.test", Password: "test-password-strong", Role: created.Data.ID, DepartmentID: &deptA}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	operatorCookie, operatorCSRF := issueSession(t, manager, true, operator)
	member := func(username, department string) contracts.User {
		t.Helper()
		input := contracts.UserCreate{Username: username, Email: username + "@example.test", Password: "test-password-strong", Role: "user"}
		if department != "" {
			input.DepartmentID = &department
		}
		w := request("POST", "/api/v1/admin/users", input, adminCookie, adminCSRF)
		if w.Code != http.StatusOK {
			t.Fatal("member create", username, w.Code, w.Body.String())
		}
		var created contracts.UserResponse
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
			t.Fatal("member payload", w.Body.String(), err)
		}
		return created.Data
	}
	inside := member("inside-member", deptA)
	outside := member("outside-member", deptB)

	// The scoped list only contains the own department.
	w = request("GET", "/api/v1/admin/users?search=member", nil, operatorCookie, "")
	if w.Code != http.StatusOK {
		t.Fatal("scoped list", w.Code, w.Body.String())
	}
	var list contracts.UserListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	for _, item := range list.Data.Items {
		if item.ID == outside.ID {
			t.Fatal("out-of-scope member listed")
		}
	}
	insideSeen := false
	for _, item := range list.Data.Items {
		if item.ID == inside.ID {
			insideSeen = true
		}
	}
	if !insideSeen {
		t.Fatal("in-scope member missing from scoped list")
	}

	// Writes outside the scope are refused even for a pure status change.
	if w = request("PATCH", "/api/v1/admin/users/"+outside.ID, contracts.UserUpdate{Status: "disabled"}, operatorCookie, operatorCSRF); w.Code != http.StatusForbidden {
		t.Fatal("out-of-scope update accepted", w.Code, w.Body.String())
	}
	if w = request("PATCH", "/api/v1/admin/users/"+inside.ID, contracts.UserUpdate{Status: "disabled"}, operatorCookie, operatorCSRF); w.Code != http.StatusOK {
		t.Fatal("in-scope update refused", w.Code, w.Body.String())
	}
	// Creation targets outside the scope are refused as well.
	if w = request("POST", "/api/v1/admin/users", contracts.UserCreate{Username: "foreign-target", Email: "foreign-target@example.test", Password: "test-password-strong", Role: "user", DepartmentID: &deptB}, operatorCookie, operatorCSRF); w.Code != http.StatusForbidden {
		t.Fatal("out-of-scope create accepted", w.Code, w.Body.String())
	}
	if w = request("POST", "/api/v1/admin/users", contracts.UserCreate{Username: "inside-target", Email: "inside-target@example.test", Password: "test-password-strong", Role: "user", DepartmentID: &deptA}, operatorCookie, operatorCSRF); w.Code != http.StatusOK {
		t.Fatal("in-scope create refused", w.Code, w.Body.String())
	}
}
