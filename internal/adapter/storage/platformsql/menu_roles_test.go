// Author: yunnuo <ymz@ebox.vip>
// Description: Reverse menu grants preserve concurrent role edits, respect privilege bounds, and revoke only affected sessions.
package platformsql

import (
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"slices"
	"testing"
	"time"
)

func TestAssignMenuRolesAtomicPatch(t *testing.T) {
	ctx := t.Context()
	_, repo, owner := navigationFixture(t, ctx)
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Management reader", Permissions: []string{"notes:access"}, MenuIds: &[]string{}, ActionIds: &[]string{}, OperationIds: &[]string{"listNotes"}}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Menu visibility never widens authorization: assigning the users page is
	// refused until the role editor grants users:read explicitly.
	navBefore, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AssignMenuRoles(ctx, "users", contracts.MenuRoleAssignmentInput{Version: navBefore.Version, ExpectedRoleIds: []string{}, RoleIds: []string{role.ID}}, owner.ID); !errors.Is(err, platform.ErrMenuRolePermissionMissing) {
		t.Fatalf("assignment without the page point must be refused, got %v", err)
	}
	// The explicit authorization change happens in the role editor.
	role, err = repo.UpdateRole(ctx, role.ID, contracts.RoleSaveInput{Version: currentRoleVersion(t, ctx, repo, role.ID), Name: "Management reader", Permissions: []string{"notes:access", "users:read"}, MenuIds: &[]string{}, ActionIds: &[]string{}, OperationIds: &[]string{"listNotes", "listUsers"}}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	nav, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	member, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "reader", Email: "reader@example.test", RoleIds: &[]string{role.ID}}, "synthetic-hash", owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = repo.CreateSession(ctx, "member-session", member.ID, int(time.Now().Unix())+3600, ""); err != nil {
		t.Fatal(err)
	}
	if err = repo.CreateSession(ctx, "owner-session", owner.ID, int(time.Now().Unix())+3600, ""); err != nil {
		t.Fatal(err)
	}
	input := contracts.MenuRoleAssignmentInput{Version: nav.Version, ExpectedRoleIds: []string{}, RoleIds: []string{role.ID}}
	result, err := repo.AssignMenuRoles(ctx, "users", input, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	var saved contracts.Role
	for _, r := range result.Items {
		if r.ID == role.ID {
			saved = r
		}
	}
	if !slices.Contains(saved.MenuIds, "users") || !slices.Contains(saved.MenuIds, "administration") || !slices.Contains(saved.Permissions, "users:read") || !slices.Contains(saved.OperationIds, "listUsers") || !slices.Contains(saved.OperationIds, "listNotes") || slices.Contains(saved.OperationIds, "createUser") || len(saved.ActionIds) != 0 {
		t.Fatal("wrong grants", saved)
	}
	var count int
	if err = repo.Store.Row(ctx, repo.Store.DB, "SELECT COUNT(*) FROM unicore_sessions WHERE user_id=?", member.ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("affected session survived", count, err)
	}
	if err = repo.Store.Row(ctx, repo.Store.DB, "SELECT COUNT(*) FROM unicore_sessions WHERE user_id=?", owner.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("unrelated session revoked", count, err)
	}
	if _, err = repo.AssignMenuRoles(ctx, "users", input, owner.ID); !errors.Is(err, platform.ErrConflict) {
		t.Fatal("stale membership accepted", err)
	}
	// A concurrent role edit is merged, not replaced by the dialog's old snapshot.
	if _, err = repo.UpdateRole(ctx, role.ID, contracts.RoleSaveInput{Version: currentRoleVersion(t, ctx, repo, role.ID), Name: "Renamed", Permissions: append(saved.Permissions, "notes:delete")}, owner.ID); err != nil {
		t.Fatal(err)
	}
	input.ExpectedRoleIds = []string{role.ID}
	input.RoleIds = []string{}
	result, err = repo.AssignMenuRoles(ctx, "users", input, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range result.Items {
		if r.ID == role.ID {
			saved = r
		}
	}
	if saved.Name != "Renamed" || !slices.Contains(saved.Permissions, "notes:delete") || slices.Contains(saved.MenuIds, "users") || !slices.Contains(saved.OperationIds, "listUsers") {
		t.Fatal("patch lost independent grants", saved)
	}
	input.RoleIds = []string{role.ID}
	input.ExpectedRoleIds = []string{}
	input.Version--
	if _, err = repo.AssignMenuRoles(ctx, "users", input, owner.ID); !errors.Is(err, platform.ErrConflict) {
		t.Fatal("stale tree accepted", err)
	}
}

func TestAssignMenuRolesPrivilegeBounds(t *testing.T) {
	ctx := t.Context()
	_, repo, owner := navigationFixture(t, ctx)
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Menu operator", Permissions: []string{"menus:write"}, OperationIds: &[]string{"listMenus", "saveMenus"}}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	operator, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "operator", Email: "operator@example.test", RoleIds: &[]string{role.ID}}, "synthetic-hash", owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	nav, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	input := contracts.MenuRoleAssignmentInput{Version: nav.Version, ExpectedRoleIds: []string{}, RoleIds: []string{role.ID}}
	if _, err = repo.AssignMenuRoles(ctx, "users", input, operator.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("non-super assigned roles", err)
	}
	for _, id := range []string{"monitor", "user"} {
		node := "monitor"
		input.RoleIds = []string{role.ID}
		if id == "user" {
			node = "users"
			input.RoleIds = []string{"user"}
		}
		if _, err = repo.AssignMenuRoles(ctx, node, input, owner.ID); err == nil || (id == "monitor" && !errors.Is(err, platform.ErrForbidden)) || (id == "users" && !errors.Is(err, platform.ErrMenuRolePermissionMissing)) {
			t.Fatal("reserved/unauthorized grant accepted", id, err)
		}
	}
	input.RoleIds = []string{"super_admin"}
	if _, err = repo.AssignMenuRoles(ctx, "users", input, owner.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("immutable super role modified", err)
	}
}

func TestMenuPatchStalesRoleSnapshotAndNoopKeepsVersion(t *testing.T) {
	ctx := t.Context()
	_, repo, owner := navigationFixture(t, ctx)
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Interleaved", Permissions: []string{"notes:access", "users:read"}, MenuIds: &[]string{}, ActionIds: &[]string{}, OperationIds: &[]string{"listNotes", "listUsers"}}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	nav, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	input := contracts.MenuRoleAssignmentInput{Version: nav.Version, ExpectedRoleIds: []string{}, RoleIds: []string{role.ID}}
	if _, err = repo.AssignMenuRoles(ctx, "users", input, owner.ID); err != nil {
		t.Fatal(err)
	}
	after, err := repo.role(ctx, repo.Store.DB, role.ID)
	if err != nil || after.Version != role.Version+1 {
		t.Fatalf("menu patch version: %+v %v", after, err)
	}
	// The role editor opened first: its full stale save must not erase the menu patch.
	if _, err = repo.UpdateRole(ctx, role.ID, contracts.RoleSaveInput{Name: "Stale rename", Version: &role.Version, Permissions: role.Permissions, MenuIds: &role.MenuIds, OperationIds: &role.OperationIds}, owner.ID); !errors.Is(err, platform.ErrConflict) {
		t.Fatal("stale role overwrote menu", err)
	}
	input.ExpectedRoleIds = []string{role.ID}
	if _, err = repo.AssignMenuRoles(ctx, "users", input, owner.ID); err != nil {
		t.Fatal(err)
	}
	noop, err := repo.role(ctx, repo.Store.DB, role.ID)
	if err != nil || noop.Version != after.Version || !slices.Contains(noop.MenuIds, "users") {
		t.Fatalf("menu no-op changed snapshot: %+v %v", noop, err)
	}
	// Legacy whole-tree assignment also advances only changed role snapshots.
	assignments := []contracts.NavigationRoleAssignment{{RoleID: role.ID, MenuIds: []string{}, ActionIds: after.ActionIds}}
	saved, err := repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: nav.Version, Sections: nav.Sections, Nodes: nav.Nodes, RoleAssignments: &assignments}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	cleared, err := repo.role(ctx, repo.Store.DB, role.ID)
	if err != nil || cleared.Version != after.Version+1 || len(cleared.MenuIds) != 0 {
		t.Fatalf("legacy assignment version: %+v %v", cleared, err)
	}
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: saved.Version, Sections: saved.Sections, Nodes: saved.Nodes, RoleAssignments: &assignments}, owner.ID); err != nil {
		t.Fatal(err)
	}
	if got := *currentRoleVersion(t, ctx, repo, role.ID); got != cleared.Version {
		t.Fatalf("legacy no-op advanced version %d", got)
	}
}
