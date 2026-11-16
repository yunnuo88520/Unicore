// Author: yunnuo <ymz@ebox.vip>
// Description: Bearer role restrictions survive actor reloads and cannot widen read/write data scopes.
package platformsql

import (
	"errors"
	"fmt"
	"slices"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestManagementCredentialAuthorization(t *testing.T) {
	ctx := t.Context()
	if !platform.CatalogPermission("users:credentials:write") || platform.SuperOnlyPermission("users:credentials:write") || platform.AssignablePermission("users:credentials:write") {
		t.Fatal("credential permission must be explicitly delegable, not default-member or super-only")
	}
	store, repo, super := navigationFixture(t, ctx)
	role := func(name, scope string, permissions ...string) string {
		t.Helper()
		r, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: name, Permissions: permissions, DataScope: &scope}, super.ID)
		if err != nil {
			t.Fatal(err)
		}
		return r.ID
	}
	department := func(name string) string {
		t.Helper()
		d, err := repo.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: name}, super.ID)
		if err != nil {
			t.Fatal(err)
		}
		return d.ID
	}
	a, b := department("Credential A"), department("Credential B")
	create := func(name, dept string, roles ...string) contracts.User {
		t.Helper()
		u, err := repo.CreateUser(ctx, contracts.UserCreate{Username: name, Email: name + "@example.test", DepartmentID: &dept, RoleIds: &roles}, "original-hash", super.ID)
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	updateAll := role("Identity all", platform.ScopeAll, "users:update")
	updateDept := role("Identity department", platform.ScopeDept, "users:update")
	credentialDept := role("Credential department", platform.ScopeDept, "users:credentials:write")
	credentialAll := role("Credential all", platform.ScopeAll, "users:credentials:write")
	business := role("Business all", platform.ScopeAll, "notes:access")
	custom, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Credential B", Permissions: []string{"users:credentials:write"}, DataScope: strPtr(platform.ScopeCustom), DepartmentIds: &[]string{b}}, super.ID)
	if err != nil {
		t.Fatal(err)
	}
	union := create("credential-union", a, updateAll, credentialDept, custom.ID)
	patDept := role("PAT credential department", platform.ScopeDept, "users:update", "users:credentials:write")
	operator := create("credential-operator", a, updateAll, credentialDept, business, patDept)
	reverse := create("reverse-operator", a, updateDept, credentialAll)
	legacy := create("legacy-editor", a, updateAll)
	if err := repo.EnsurePermissions(ctx); err != nil {
		t.Fatal(err)
	}
	legacyReloaded, err := repo.user(ctx, store.DB, legacy.ID)
	if err != nil || platform.Has(legacyReloaded, "users:credentials:write") {
		t.Fatalf("catalogue refresh granted credentials to an old role: %+v %v", legacyReloaded, err)
	}
	credentialOnly := create("credential-only", a, credentialAll)
	inside := create("credential-inside", a, "user")
	outside := create("credential-outside", b, "user")
	management := create("management-target", a, "user", updateAll)
	businessTarget := create("business-target", a, business)

	// Snapshot persistent rows and security proofs: denied requests must not
	// update credentials, memberships, timestamps, audit or revoke any proof.
	type snapshot struct {
		status, email, hash, roles string
		updated                    int64
		sessions, tokens, audits   int
	}
	read := func(id string) snapshot {
		t.Helper()
		var s snapshot
		if err := store.Row(ctx, store.DB, "SELECT status,email,password_hash,updated_at FROM unicore_users WHERE id=?", id).Scan(&s.status, &s.email, &s.hash, &s.updated); err != nil {
			t.Fatal(err)
		}
		u, err := repo.user(ctx, store.DB, id)
		if err != nil {
			t.Fatal(err)
		}
		s.roles = fmt.Sprint(u.Roles)
		for query, dest := range map[string]*int{
			"SELECT COUNT(*) FROM unicore_sessions WHERE user_id=?":       &s.sessions,
			"SELECT COUNT(*) FROM unicore_account_tokens WHERE user_id=?": &s.tokens,
		} {
			if err := store.Row(ctx, store.DB, query, id).Scan(dest); err != nil {
				t.Fatal(err)
			}
		}
		if err := store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_audit_logs").Scan(&s.audits); err != nil {
			t.Fatal(err)
		}
		return s
	}
	proofs := func(id string) {
		t.Helper()
		if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_sessions(token_hash,user_id,expires_at) VALUES(?,?,4102444800)", "credential-session-"+id, id); err != nil {
			t.Fatal(err)
		}
		if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_account_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,'reset',4102444800)", "credential-token-"+id, id); err != nil {
			t.Fatal(err)
		}
	}
	for _, target := range []contracts.User{inside, outside, management, operator, super, businessTarget} {
		proofs(target.ID)
	}
	for _, tc := range []struct {
		name   string
		actor  contracts.User
		target contracts.User
		pat    bool
	}{
		{"legacy grant", legacy, inside, false},
		{"credential scope excludes target", operator, outside, false},
		{"management target full roles", operator, management, false},
		{"management self", operator, operator, false},
		{"super target", operator, super, false},
		{"PAT ordinary target", operator, inside, true},
		{"PAT self target", operator, operator, true},
		{"PAT super role", super, inside, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			requestCtx := ctx
			if tc.pat {
				r := patDept
				if tc.actor.ID == super.ID {
					r = "super_admin"
				}
				requestCtx = platform.WithTokenRole(ctx, tc.actor.ID, r)
			}
			before := read(tc.target.ID)
			if _, err := repo.ResetUserPassword(requestCtx, tc.target.ID, "forbidden-hash", tc.actor.ID); !errors.Is(err, platform.ErrForbidden) {
				t.Fatalf("password reset: %v", err)
			}
			email := "forbidden-" + tc.target.Email
			if _, err := repo.UpdateUser(requestCtx, tc.target.ID, contracts.UserUpdate{Status: "disabled", Email: &email}, tc.actor.ID); !errors.Is(err, platform.ErrForbidden) {
				t.Fatalf("email replacement: %v", err)
			}
			if after := read(tc.target.ID); after != before {
				t.Fatalf("denial had side effects: before=%+v after=%+v", before, after)
			}
		})
	}
	// Different roles contribute each permission's scope independently; email
	// requires the intersection, whereas password needs no users:update grant.
	before := read(outside.ID)
	email := "outside-next@example.test"
	if _, err := repo.UpdateUser(ctx, outside.ID, contracts.UserUpdate{Status: "active", Email: &email}, reverse.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatalf("users:update scope bypass: %v", err)
	}
	if read(outside.ID) != before {
		t.Fatal("scope denial mutated target")
	}
	if _, err := repo.ResetUserPassword(ctx, outside.ID, "credential-only-hash", credentialOnly.ID); err != nil {
		t.Fatalf("credential-only reset denied: %v", err)
	}
	if got := read(outside.ID); got.hash != "credential-only-hash" || got.sessions != 0 || got.tokens != 0 || got.audits != before.audits+1 {
		t.Fatalf("password revocation/audit missing: %+v", got)
	}
	email = "union-outside@example.test"
	if _, err := repo.UpdateUser(ctx, outside.ID, contracts.UserUpdate{Status: "active", Email: &email}, union.ID); err != nil {
		t.Fatalf("same-permission multi-role scope union denied: %v", err)
	}
	for _, target := range []contracts.User{inside, businessTarget} {
		email := "next-" + target.Email
		if _, err := repo.UpdateUser(ctx, target.ID, contracts.UserUpdate{Status: "active", Email: &email}, operator.ID); err != nil {
			t.Fatalf("delegated multi-role email: %v", err)
		}
		if got := read(target.ID); got.email != email || got.sessions != 0 || got.tokens != 0 {
			t.Fatalf("email replacement failed to revoke: %+v", got)
		}
	}
	if _, err := repo.ResetUserPassword(ctx, management.ID, "super-reset-hash", super.ID); err != nil {
		t.Fatalf("super cannot reset management target: %v", err)
	}
	email = "management-next@example.test"
	if _, err := repo.UpdateUser(ctx, management.ID, contracts.UserUpdate{Status: "active", Email: &email}, super.ID); err != nil {
		t.Fatalf("super cannot change management email: %v", err)
	}
	// An unchanged normalized email remains ordinary identity editing, including
	// PAT edits; compare against the persisted address, not input presence.
	unchanged := "  NEXT-CREDENTIAL-INSIDE@EXAMPLE.TEST  "
	if _, err := repo.UpdateUser(platform.WithTokenRole(ctx, operator.ID, updateAll), inside.ID, contracts.UserUpdate{Status: "active", Email: &unchanged}, operator.ID); err != nil {
		t.Fatalf("PAT unchanged email rejected: %v", err)
	}
}

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
