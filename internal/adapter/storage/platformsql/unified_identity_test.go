// Author: yunnuo <ymz@ebox.vip>
// Description: Unified account, multi-role and privilege-escalation regression coverage.
package platformsql

import (
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"testing"
	"time"
)

func TestUnifiedIdentityMultipleRoles(t *testing.T) {
	store, repo, owner := scopeSecurityStore(t)
	ctx := t.Context()
	if _, err := repo.UpdateRole(ctx, "user", contracts.RoleSaveInput{Name: "user", Permissions: []string{"users:read"}}, owner.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatalf("public registration role received management permissions: %v", err)
	}
	operator, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "operator", DataScope: strPtr(platform.ScopeAll), Permissions: []string{"users:read", "users:update", "users:create", "logs:read"}}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	roles := []string{"user", operator.ID}
	user, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "unified", Email: "unified@example.test", RoleIds: &roles}, "hash", owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !platform.OperationAllowed(user, "listUsers") || len(user.Roles) != 2 || !platform.Has(user, "users:read") || !platform.Has(user, "notes:access") {
		t.Fatalf("role union: %+v", user)
	}
	adminSurface := &Repository{Store: store, Administrators: true}
	account, err := adminSurface.FindAccount(ctx, "unified")
	if err != nil || account.User.ID != user.ID || len(account.User.Roles) != 2 {
		t.Fatalf("workspace account mismatch: %+v %v", account, err)
	}
	if err = repo.CreateSession(ctx, "shared", user.ID, int(time.Now().Unix())+3600, "hash"); err != nil {
		t.Fatal(err)
	}
	if _, _, err = adminSurface.Session(ctx, "shared"); err != nil {
		t.Fatalf("shared session: %v", err)
	}
	// A user editor cannot turn an ordinary account into a privileged account.
	target, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "target", Email: "target@example.test", Role: "user"}, "hash", user.ID)
	if err != nil {
		t.Fatal(err)
	}
	super := []string{"user", "super_admin"}
	if _, err = repo.UpdateUser(ctx, target.ID, contracts.UserUpdate{Status: "active", RoleIds: &super}, user.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatalf("self escalation allowed: %v", err)
	}
	// Whole-set validation is atomic; malformed sets never change membership.
	invalid := [][]string{{}, {operator.ID, operator.ID}, {"missing-role"}}
	for _, ids := range invalid {
		if _, err = repo.UpdateUser(ctx, user.ID, contracts.UserUpdate{Status: "active", RoleIds: &ids}, owner.ID); err == nil {
			t.Fatalf("invalid roles accepted: %v", ids)
		}
	}
	kept, err := repo.user(ctx, store.DB, user.ID)
	if err != nil || len(kept.Roles) != 2 {
		t.Fatalf("invalid update changed roles: %+v %v", kept, err)
	}
	// Removing a role revokes the one shared session across both workspaces.
	member := []string{"user"}
	if _, err = repo.UpdateUser(ctx, user.ID, contracts.UserUpdate{Status: "active", RoleIds: &member}, owner.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err = adminSurface.Session(ctx, "shared"); err == nil {
		t.Fatal("old session survived role removal")
	}
	// Last-super-admin protection works even when super_admin is one of several roles.
	if _, err = repo.UpdateUser(ctx, owner.ID, contracts.UserUpdate{Status: "active", RoleIds: &super}, owner.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.UpdateUser(ctx, owner.ID, contracts.UserUpdate{Status: "active", RoleIds: &member}, owner.ID); !errors.Is(err, platform.ErrLastAdmin) {
		t.Fatalf("last super admin removed: %v", err)
	}
	var tables int
	if err = store.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND (name='unicore_administrators' OR name LIKE 'unicore_administrator_%')").Scan(&tables); err != nil || tables != 0 {
		t.Fatalf("duplicate identity tables: %d %v", tables, err)
	}
}
