// Author: yunnuo <ymz@ebox.vip>
// Description: Real-dialect upgrade, delegation, role/session invariants and assignment/delete races.
package platformsql

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func exerciseRoles(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, admin contracts.User) {
	t.Helper()
	// Simulate a populated M2c database, then upgrade twice without reseeding identities.
	for _, query := range []string{"DELETE FROM role_permissions WHERE permission_id IN ('roles:read','roles:write')", "DELETE FROM permissions WHERE id IN ('roles:read','roles:write')", "DELETE FROM schema_migrations WHERE version=5"} {
		if _, err := store.DB.ExecContext(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		if err := store.Migrate(ctx, true); err != nil {
			t.Fatal("M2c upgrade", err)
		}
	}
	account, err := r.FindAccount(ctx, "admin")
	if err != nil || !platform.Has(account.User, "roles:write") || !platform.Has(account.User, "settings:write") {
		t.Fatal("upgrade lost grants", err)
	}
	input := contracts.RoleInput{Name: "运营角色", Permissions: []string{"users:read", "users:create", "roles:read"}}
	role, err := r.CreateRole(ctx, input, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if role.Builtin || role.UserCount != 0 || role.ID == "" {
		t.Fatal("invalid new role", role)
	}
	if _, err = r.CreateRole(ctx, input, admin.ID); !errors.Is(err, platform.ErrRoleConflict) {
		t.Fatal("duplicate name", err)
	}
	for _, permissions := range [][]string{{"roles:write"}, {"users:update"}, {"settings:write"}, {"unknown:action"}, {"users:read", "users:read"}, nil} {
		if _, err = r.CreateRole(ctx, contracts.RoleInput{Name: "拒绝", Permissions: permissions}, admin.ID); !errors.Is(err, platform.ErrInput) {
			t.Fatal("unsafe grants accepted", permissions, err)
		}
	}
	for _, id := range []string{"super_admin", "user"} {
		if _, err = r.UpdateRole(ctx, id, input, admin.ID); !errors.Is(err, platform.ErrBuiltinRole) {
			t.Fatal("builtin changed", err)
		}
		if err = r.DeleteRole(ctx, id, admin.ID); !errors.Is(err, platform.ErrBuiltinRole) {
			t.Fatal("builtin deleted", err)
		}
	}
	identity := platform.New(r)
	delegate, err := identity.Create(ctx, contracts.UserCreate{Username: "roleoperator", Email: "roleoperator@example.test", Password: "test-password-strong", Role: role.ID}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !platform.Has(delegate, "roles:read") || platform.Has(delegate, "roles:write") {
		t.Fatal("wrong derived permissions")
	}
	if _, err = r.CreateRole(ctx, input, delegate.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("delegated role edit", err)
	}
	stronger, err := r.CreateRole(ctx, contracts.RoleInput{Name: "配置查看角色", Permissions: []string{"settings:read"}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"super_admin", stronger.ID} {
		if _, err = identity.Create(ctx, contracts.UserCreate{Username: "escalated", Email: "escalated@example.test", Password: "test-password-strong", Role: id}, delegate.ID); !errors.Is(err, platform.ErrForbidden) {
			t.Fatal("delegation escalated", id, err)
		}
	}
	options, err := r.RoleOptions(ctx, delegate.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, option := range options.Items {
		if (option.ID == "super_admin" || option.ID == stronger.ID) && option.Assignable {
			t.Fatal("unsafe option", option)
		}
	}
	if _, err = identity.Create(ctx, contracts.UserCreate{Username: "delegated", Email: "delegated@example.test", Password: "test-password-strong", Role: role.ID}, delegate.ID); err != nil {
		t.Fatal("bounded delegation rejected", err)
	}
	if err = r.DeleteRole(ctx, role.ID, admin.ID); !errors.Is(err, platform.ErrRoleInUse) {
		t.Fatal("assigned role deleted", err)
	}
	_, token, err := identity.Issue(ctx, delegate, 1)
	if err != nil {
		t.Fatal(err)
	}
	now := int(time.Now().Unix())
	challenge := platform.EmailChallenge{ID: platform.Token(), Purpose: "login", Digest: platform.Hash("synthetic-code"), Created: now, Expires: now + 600, Payload: "synthetic-encrypted-payload"}
	if err = r.QueueEmailChallenge(ctx, delegate.Email, challenge); err != nil {
		t.Fatal(err)
	}
	input.Name = "运营只读"
	input.Permissions = []string{"users:read"}
	updated, err := r.UpdateRole(ctx, role.ID, input, admin.ID)
	if err != nil || updated.UserCount != 2 {
		t.Fatal("update role", updated, err)
	}
	if _, err = identity.Session(ctx, token); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("session survived permission change", err)
	}
	if _, err = r.ConsumeEmailChallenge(ctx, challenge.ID, "login", challenge.Digest, "", "new-session", now+3600, now); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("code survived permission change", err)
	}
	if _, err = identity.Create(ctx, contracts.UserCreate{Username: "staleactor", Email: "staleactor@example.test", Password: "test-password-strong", Role: "user"}, delegate.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("stale creator accepted", err)
	}
	if _, err = r.UpdateUser(ctx, admin.ID, contracts.UserUpdate{Role: "user", Status: "disabled"}, delegate.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("non-super changed identity", err)
	}
	if err = r.DeleteRole(ctx, stronger.ID, admin.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = r.UpdateRole(ctx, stronger.ID, input, admin.ID); !errors.Is(err, platform.ErrRoleNotFound) {
		t.Fatal("deleted role edited", err)
	}
	// Both paths take the installation lock: deletion cannot leave a dangling user role.
	raceRole, err := r.CreateRole(ctx, contracts.RoleInput{Name: "并发角色", Permissions: []string{}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	hash, err := platform.HashPassword("test-password-strong")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	var createErr, deleteErr error
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, createErr = r.CreateUser(ctx, contracts.UserCreate{Username: "racedrole", Email: "racedrole@example.test", Role: raceRole.ID}, hash, admin.ID)
	}()
	go func() { defer wg.Done(); deleteErr = r.DeleteRole(ctx, raceRole.ID, admin.ID) }()
	wg.Wait()
	if !((createErr == nil && errors.Is(deleteErr, platform.ErrRoleInUse)) || (deleteErr == nil && errors.Is(createErr, platform.ErrRoleNotFound))) {
		t.Fatal("non-atomic assignment/delete", createErr, deleteErr)
	}
	var count int
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM user_roles ur LEFT JOIN roles r ON ur.role_id=r.id WHERE r.id IS NULL").Scan(&count); err != nil || count != 0 {
		t.Fatal("dangling grant", count, err)
	}
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM audit_logs WHERE action LIKE 'roles.%'").Scan(&count); err != nil || count < 5 {
		t.Fatal("missing audit", count, err)
	}
}
