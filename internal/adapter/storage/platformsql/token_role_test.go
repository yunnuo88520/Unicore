// Author: yunnuo <ymz@ebox.vip>
// Description: Bearer role restrictions survive actor reloads and cannot widen read/write data scopes.
package platformsql

import (
	"errors"
	"slices"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestTokenRoleRestrictionSurvivesTransactions(t *testing.T) {
	ctx := t.Context()
	_, repo, super := navigationFixture(t, ctx)
	a, err := repo.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "A"}, super.ID)
	if err != nil {
		t.Fatal(err)
	}
	b, err := repo.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "B"}, super.ID)
	if err != nil {
		t.Fatal(err)
	}
	narrow, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Department editor", Permissions: []string{"users:read", "users:update"}, DataScope: strPtr(platform.ScopeDept)}, super.ID)
	if err != nil {
		t.Fatal(err)
	}
	wide, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Global editor", Permissions: []string{"users:read", "users:update", "users:create"}, DataScope: strPtr(platform.ScopeAll)}, super.ID)
	if err != nil {
		t.Fatal(err)
	}
	roles := []string{narrow.ID, wide.ID}
	actor, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "dual-editor", Email: "dual@example.test", RoleIds: &roles, DepartmentID: &a.ID}, "hash", super.ID)
	if err != nil {
		t.Fatal(err)
	}
	outside, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "outside", Email: "outside@example.test", Role: "user", DepartmentID: &b.ID}, "hash", super.ID)
	if err != nil {
		t.Fatal(err)
	}
	limited := platform.WithTokenRole(ctx, actor.ID, narrow.ID)
	user, err := repo.principalUser(limited, repo.Store.DB, actor.ID)
	if err != nil || !slices.Equal(user.Roles, []string{narrow.ID}) || platform.Has(user, "users:create") {
		t.Fatalf("role union leaked: %+v %v", user, err)
	}
	scope, err := repo.DataScope(limited, user, "users:read")
	if err != nil || scope.All || scope.Contains(outside.ID) {
		t.Fatalf("read scope widened: %+v %v", scope, err)
	}
	_, err = repo.UpdateUser(limited, outside.ID, contracts.UserUpdate{Status: "active"}, actor.ID)
	if !errors.Is(err, platform.ErrForbidden) {
		t.Fatalf("transaction re-expanded actor: %v", err)
	}
	_, err = repo.CreateUser(limited, contracts.UserCreate{Username: "forbidden", Email: "forbidden@example.test", Role: "user", DepartmentID: &a.ID}, "hash", actor.ID)
	if !errors.Is(err, platform.ErrForbidden) {
		t.Fatalf("other role supplied create permission: %v", err)
	}
	// Even the actor's own resource retains all assignments for self-edit and
	// privileged-target protections; only the acting principal is narrowed.
	own, err := repo.user(limited, repo.Store.DB, actor.ID)
	if err != nil || len(own.Roles) != 2 {
		t.Fatalf("own resource was narrowed: %+v %v", own, err)
	}
	// A target account is still a resource with all of its assigned roles.
	target, err := repo.user(limited, repo.Store.DB, outside.ID)
	if err != nil || !slices.Equal(target.Roles, []string{"user"}) {
		t.Fatal(target, err)
	}
	_, err = repo.principalUser(platform.WithTokenRole(ctx, actor.ID, "unassigned"), repo.Store.DB, actor.ID)
	if !errors.Is(err, platform.ErrCredentials) {
		t.Fatalf("unassigned role accepted: %v", err)
	}
}
