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
	if !slices.Contains(saved.MenuIds, "users") || !slices.Contains(saved.MenuIds, "administration") || !slices.Contains(saved.OperationIds, "listUsers") || !slices.Contains(saved.OperationIds, "listNotes") || slices.Contains(saved.OperationIds, "createUser") || len(saved.ActionIds) != 0 {
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
	if _, err = repo.UpdateRole(ctx, role.ID, contracts.RoleSaveInput{Name: "Renamed", Permissions: append(saved.Permissions, "notes:delete")}, owner.ID); err != nil {
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
		if _, err = repo.AssignMenuRoles(ctx, node, input, owner.ID); !errors.Is(err, platform.ErrForbidden) {
			t.Fatal("reserved/registration grant accepted", id, err)
		}
	}
	input.RoleIds = []string{"super_admin"}
	if _, err = repo.AssignMenuRoles(ctx, "users", input, owner.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("immutable super role modified", err)
	}
}
