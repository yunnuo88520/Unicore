// Author: yunnuo <ymz@ebox.vip>
// Description: Independent grants, workspace identity and permission-specific data-scope regressions.
package platformsql

import (
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"testing"
)

func TestRoleEditPreservesRevokedGrantsAndScope(t *testing.T) {
	ctx := t.Context()
	_, repo, super := navigationFixture(t, ctx)
	dep, err := repo.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "Scope"}, super.ID)
	if err != nil {
		t.Fatal(err)
	}
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Limited", Permissions: []string{"notes:access", "notes:create"}, MenuIds: &[]string{}, ActionIds: &[]string{}, OperationIds: &[]string{"listNotes"}, DataScope: strPtr(platform.ScopeCustom), DepartmentIds: &[]string{dep.ID}}, super.ID)
	if err != nil {
		t.Fatal(err)
	}
	// A rename/widening must not regrant createNote, actions, menus or scope.
	role, err = repo.UpdateRole(ctx, role.ID, contracts.RoleSaveInput{Name: "Renamed", Permissions: []string{"notes:access", "notes:create", "notes:delete"}}, super.ID)
	if err != nil || len(role.OperationIds) != 1 || role.OperationIds[0] != "listNotes" || len(role.ActionIds) != 0 || len(role.MenuIds) != 0 || role.DataScope != platform.ScopeCustom || len(role.DepartmentIds) != 1 || role.DepartmentIds[0] != dep.ID {
		t.Fatalf("revoked grants restored or scope lost: %+v %v", role, err)
	}
	role, err = repo.UpdateRole(ctx, role.ID, contracts.RoleSaveInput{Name: "Reduced", Permissions: []string{"notes:create"}}, super.ID)
	if err != nil || len(role.OperationIds) != 0 {
		t.Fatalf("reduced permission retained API: %+v %v", role, err)
	}
}

func TestPermissionScopesAndAccountMutationBoundaries(t *testing.T) {
	ctx := t.Context()
	_, repo, super := navigationFixture(t, ctx)
	createDep := func(name string) contracts.Department {
		d, e := repo.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: name}, super.ID)
		if e != nil {
			t.Fatal(e)
		}
		return d
	}
	a, b := createDep("A"), createDep("B")
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Department manager", Permissions: []string{"users:read", "users:create", "users:update", "notes:access"}, DataScope: strPtr(platform.ScopeDept)}, super.ID)
	if err != nil {
		t.Fatal(err)
	}
	files, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Global file reader", Permissions: []string{"files:access"}, DataScope: strPtr(platform.ScopeAll)}, super.ID)
	if err != nil {
		t.Fatal(err)
	}
	create := func(name, dep string, roles []string) contracts.User {
		u, e := repo.CreateUser(ctx, contracts.UserCreate{Username: name, Email: name + "@example.test", RoleIds: &roles, DepartmentID: &dep}, "hash", super.ID)
		if e != nil {
			t.Fatal(e)
		}
		return u
	}
	actor := create("scope-manager", a.ID, []string{role.ID, files.ID})
	peer := create("scope-peer", a.ID, []string{"user"})
	outside := create("scope-outside", b.ID, []string{"user"})
	notes, err := repo.DataScope(ctx, actor, "notes:access")
	if err != nil || notes.All || !notes.Contains(peer.ID) || notes.Contains(outside.ID) {
		t.Fatalf("unrelated file scope widened notes: %+v %v", notes, err)
	}
	fileScope, err := repo.DataScope(ctx, actor, "files:access")
	if err != nil || !fileScope.All {
		t.Fatal(fileScope, err)
	}
	list, err := repo.ListUsersScoped(ctx, actor, "scope-", 1, 50)
	if err != nil || list.Total != 2 {
		t.Fatalf("list/export scope: %+v %v", list, err)
	}
	for _, u := range list.Items {
		if u.ID == outside.ID {
			t.Fatal("out-of-scope account leaked")
		}
	}
	update := func(target, dep string) error {
		_, e := repo.UpdateUser(ctx, target, contracts.UserUpdate{Status: "active", DepartmentID: &dep}, actor.ID)
		return e
	}
	if err := update(outside.ID, b.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("outside mutation", err)
	}
	if err := update(peer.ID, b.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("destination scope bypass", err)
	}
	if err := update(actor.ID, b.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("self scope pivot", err)
	}
	if err := update(peer.ID, a.ID); err != nil {
		t.Fatal("authorized same-department mutation", err)
	}
	if _, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "invalid-scope", Email: "invalid@example.test", DepartmentID: &b.ID}, "hash", actor.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("outside create", err)
	}
	if _, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "valid-scope", Email: "valid@example.test", DepartmentID: &a.ID}, "hash", actor.ID); err != nil {
		t.Fatal("authorized scoped create", err)
	}
}

func TestNavigationIDsAreGlobalAcrossWorkspaces(t *testing.T) {
	n := platform.DefaultNavigation()
	seen := map[string]bool{}
	for _, node := range n.Nodes {
		if seen[node.ID] {
			t.Fatal("shared workspace grant key", node.ID)
		}
		seen[node.ID] = true
	}
	ctx := t.Context()
	_, repo, super := navigationFixture(t, ctx)
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	route := "notes"
	listed.Nodes = append(listed.Nodes, contracts.NavigationNode{ID: "user:notes", SectionID: "admin:business", Type: "page", RouteID: &route, Visible: true, OpenMode: "same_tab"})
	if _, err := repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes}, super.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("cross-workspace duplicate accepted", err)
	}
}
