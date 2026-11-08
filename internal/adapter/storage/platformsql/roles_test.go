// Author: yunnuo <ymz@ebox.vip>
// Description: Fixed roles, separate account stores and realm-specific credential revocation.
package platformsql

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"testing"
	"time"
)

// rolePtr marks a UserUpdate role as explicitly assigned.
func rolePtr(v string) *string { return &v }

func exerciseRoles(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, admin contracts.User) {
	t.Helper()
	admins := &Repository{Store: store, Administrators: true}
	identity, administration := platform.New(r), platform.New(admins)
	if _, err := identity.Create(ctx, contracts.UserCreate{Username: admin.Username, Email: admin.Email, Password: "member-password-strong", Role: "user"}, admin.ID); !errors.Is(err, platform.ErrConflict) {
		t.Fatalf("duplicate account accepted: %v", err)
	}
	member, err := identity.Create(ctx, contracts.UserCreate{Username: "sharedmember", Email: "sharedmember@example.test", Password: "member-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(member.Permissions) != 7 {
		t.Fatal("default grants", member.Permissions)
	}
	_, token, err := administration.Login(ctx, contracts.LoginInput{Username: member.Username, Password: "member-password-strong"}, "shared-login", false, false, 1)
	if err != nil {
		t.Fatal(err)
	}
	if session, err := identity.Session(ctx, token); err != nil || session.User.ID != member.ID {
		t.Fatalf("shared session %v", err)
	}
	if err = identity.ChangePassword(ctx, member, contracts.ChangePasswordInput{CurrentPassword: "wrong-password-strong", Password: "next-password-strong"}, "wrong"); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal(err)
	}
	if err = identity.ChangePassword(ctx, member, contracts.ChangePasswordInput{CurrentPassword: "member-password-strong", Password: "next-password-strong"}, "change"); err != nil {
		t.Fatal(err)
	}
	if _, err = administration.Session(ctx, token); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("password change retained workspace session", err)
	}
	now := int(time.Now().Unix())
	challenge := platform.EmailChallenge{ID: platform.Token(), Purpose: "login", Digest: platform.Hash("654321"), Payload: "sealed", Created: now, Expires: now + 600}
	if err = admins.QueueEmailChallenge(ctx, member.Email, challenge); err != nil {
		t.Fatal(err)
	}
	if got, err := r.ConsumeEmailChallenge(ctx, challenge.ID, "login", challenge.Digest, "", platform.Hash(platform.Token()), now+600, now); err != nil || got.ID != member.ID {
		t.Fatal("shared email challenge", err)
	}
	if _, err = admins.ConsumeEmailChallenge(ctx, challenge.ID, "login", challenge.Digest, "", platform.Hash(platform.Token()), now+600, now); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("challenge reused", err)
	}
	if err = admins.CreateOIDCFlow(ctx, "shared-flow", "browser", "sealed", int64(now+600)); err != nil {
		t.Fatal(err)
	}
	if _, err = r.ConsumeOIDCFlow(ctx, "shared-flow", "browser"); err != nil {
		t.Fatal(err)
	}
	if _, err = admins.ConsumeOIDCFlow(ctx, "shared-flow", "browser"); !errors.Is(err, platform.ErrOIDC) {
		t.Fatal("OIDC flow reused", err)
	}
	proof := platform.Hash(platform.Token())
	if err = admins.QueueAccountToken(ctx, member.Email, "reset", proof, now+600, "sealed"); err != nil {
		t.Fatal(err)
	}
	if err = r.ConsumeAccountToken(ctx, proof, "reset", "new-hash", now); err != nil {
		t.Fatal(err)
	}
	if err = admins.ConsumeAccountToken(ctx, proof, "reset", "other-hash", now); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("recovery proof reused", err)
	}
}

// exerciseUserRoles covers the data-driven role echo and the status-only
// update path that must preserve assignments when the role is omitted.
func exerciseUserRoles(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, admin contracts.User) {
	t.Helper()
	admins := &Repository{Store: store, Administrators: true}
	identity := platform.New(r)
	member, err := identity.Create(ctx, contracts.UserCreate{Username: "rolemember", Email: "rolemember@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	// The echo mirrors the user_roles rows; a fresh member holds the builtin role.
	account, err := r.FindAccount(ctx, member.Username)
	if err != nil || len(account.User.Roles) != 1 || account.User.Roles[0] != "user" {
		t.Fatal("builtin role echo", account.User.Roles, err)
	}
	userRealm := "user"
	role, err := r.CreateRole(ctx, contracts.RoleSaveInput{Name: "审核员", Realm: &userRealm, Permissions: []string{"files:access"}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: rolePtr(role.ID), Status: "active"}, admin.ID); err != nil {
		t.Fatal("custom role assignment", err)
	}
	account, err = r.FindAccount(ctx, member.Username)
	if err != nil || len(account.User.Roles) != 1 || account.User.Roles[0] != role.ID || !platform.Has(account.User, "files:access") || platform.Has(account.User, "notes:access") {
		t.Fatal("custom role echo", account.User.Roles, account.User.Permissions, err)
	}
	// A member may hold several roles; the echo returns all of them.
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_user_roles(user_id,role_id) VALUES(?,'user')", member.ID); err != nil {
		t.Fatal(err)
	}
	account, err = r.FindAccount(ctx, member.Username)
	if err != nil || len(account.User.Roles) != 2 {
		t.Fatal("multi-role echo", account.User.Roles, err)
	}
	// Disabling with the role omitted keeps every assignment while sessions
	// still follow the current revoke-on-update semantics.
	_, token, err := identity.Issue(ctx, account.User, 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Status: "disabled"}, admin.ID); err != nil {
		t.Fatal("role omitted disable", err)
	}
	if _, err = identity.Session(ctx, token); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("disabled session retained", err)
	}
	account, err = r.FindAccount(ctx, member.Username)
	if err != nil || account.User.Status != "disabled" || len(account.User.Roles) != 2 {
		t.Fatal("role omitted update lost assignments", account.User.Roles, err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Status: "active"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	account, err = r.FindAccount(ctx, member.Username)
	if err != nil || account.User.Status != "active" || len(account.User.Roles) != 2 || !platform.Has(account.User, "files:access") {
		t.Fatal("role omitted enable lost assignments", account.User.Roles, account.User.Permissions, err)
	}
	// Administrator accounts keep the super_admin echo, and the omitted
	// role leaves the last active administrator untouched.
	adminAccount, err := admins.FindAccount(ctx, admin.Username)
	if err != nil || len(adminAccount.User.Roles) != 1 || adminAccount.User.Roles[0] != "super_admin" {
		t.Fatal("administrator role echo", adminAccount.User.Roles, err)
	}
	if _, err = admins.UpdateUser(ctx, admin.ID, contracts.UserUpdate{Status: "active"}, admin.ID); err != nil {
		t.Fatal("administrator role omitted update", err)
	}
	if _, err = admins.UpdateUser(ctx, admin.ID, contracts.UserUpdate{Role: rolePtr("user"), Status: "active"}, admin.ID); !errors.Is(err, platform.ErrLastAdmin) {
		t.Fatal("last super administrator demoted", err)
	}
}

// exerciseAdministratorRoles covers the administrator-realm dynamic roles:
// CRUD with the catalogue-wide grant bound, real role echo and permission
// union, cross-realm refusals, session revocation on role changes and the
// last-super-admin guard that ignores restricted administrators.
func exerciseAdministratorRoles(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, admin contracts.User) {
	t.Helper()
	admins := &Repository{Store: store, Administrators: true}
	identity := platform.New(r)
	administrator := platform.New(admins)
	administratorRealm := "administrator"
	userRealm := "user"

	// Administrator-realm roles may hold any catalogue point, including
	// management permissions; unknown points and user-realm bounds stay refused.
	restricted, err := admins.CreateRole(ctx, contracts.RoleSaveInput{Name: "受限管理员", Realm: &administratorRealm, Permissions: []string{"users:read", "users:create", "users:update", "announcements:read", "menus:write"}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restricted.Realm != "administrator" || restricted.Builtin || restricted.UserCount != 0 {
		t.Fatal("administrator role payload", restricted)
	}
	if _, err = admins.CreateRole(ctx, contracts.RoleSaveInput{Name: "未知权限", Realm: &administratorRealm, Permissions: []string{"not:a:permission"}}, admin.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("unknown grant accepted", err)
	}
	if _, err = admins.CreateRole(ctx, contracts.RoleSaveInput{Name: "越界用户角色", Realm: &userRealm, Permissions: []string{"users:read"}}, admin.ID); err != nil {
		t.Fatal("unified management grant", err)
	}

	// Creating an administrator with the restricted role works and echoes the
	// assignment together with the union of its grants.
	account, err := administrator.Create(ctx, contracts.UserCreate{Username: "restricted", Email: "restricted@example.test", Password: "test-password-strong", Role: restricted.ID}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(account.Roles) != 1 || account.Roles[0] != restricted.ID {
		t.Fatal("restricted role echo", account.Roles)
	}
	for _, permission := range []string{"users:read", "users:create", "users:update", "announcements:read", "menus:write"} {
		if !platform.Has(account, permission) {
			t.Fatal("union grant missing", permission, account.Permissions)
		}
	}
	if platform.Has(account, "settings:write") || platform.Has(account, "roles:write") {
		t.Fatal("ungranted management permission", account.Permissions)
	}
	listed, err := admins.FindAccount(ctx, "restricted")
	if err != nil || len(listed.User.Roles) != 1 || listed.User.Roles[0] != restricted.ID {
		t.Fatal("restricted listing echo", listed.User.Roles, err)
	}
	role, err := admins.role(ctx, store.DB, restricted.ID)
	if err != nil || role.UserCount != 1 {
		t.Fatal("administrator member count", role.UserCount, err)
	}

	// Any existing account may receive roles associated with either workspace.
	cross, err := identity.Create(ctx, contracts.UserCreate{Username: "crossed", Email: "crossed@example.test", Password: "test-password-strong", Role: restricted.ID}, admin.ID)
	if err != nil || !platform.Has(cross, "users:read") {
		t.Fatal("unified role assignment", err)
	}
	// A second administrator-realm role replaces the single assignment.
	second, err := admins.CreateRole(ctx, contracts.RoleSaveInput{Name: "公告员", Realm: &administratorRealm, Permissions: []string{"announcements:read"}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = admins.UpdateUser(ctx, account.ID, contracts.UserUpdate{Role: rolePtr(second.ID), Status: "active"}, admin.ID); err != nil {
		t.Fatal("role replacement", err)
	}
	replaced, err := admins.FindAccount(ctx, "restricted")
	if err != nil || len(replaced.User.Roles) != 1 || replaced.User.Roles[0] != second.ID || platform.Has(replaced.User, "users:read") || !platform.Has(replaced.User, "announcements:read") {
		t.Fatal("replacement echo", replaced.User.Roles, replaced.User.Permissions, err)
	}
	account = replaced.User

	// A permission change on the role revokes the member's administrator session.
	_, token, err := administrator.Issue(ctx, account, 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = administrator.Session(ctx, token); err != nil {
		t.Fatal(err)
	}
	if _, err = admins.UpdateRole(ctx, second.ID, contracts.RoleSaveInput{Name: "公告员", Permissions: []string{"menus:write"}}, admin.ID); err != nil {
		t.Fatal("role permission change", err)
	}
	if _, err = administrator.Session(ctx, token); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("role change kept administrator session", err)
	}

	// Options follow the realm: super_admin plus administrator-realm roles
	// only; user-realm roles never surface.
	options, err := admins.RoleOptions(ctx, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, option := range options.Items {
		seen[option.ID] = true
	}
	if !seen["super_admin"] || !seen[restricted.ID] || !seen[second.ID] || !seen["user"] {
		t.Fatal("administrator realm options", options.Items)
	}

	// A role with members cannot be deleted; a memberless one can.
	if _, err = admins.DeleteRole(ctx, second.ID, admin.ID); !errors.Is(err, platform.ErrConflict) {
		t.Fatal("member role deleted", err)
	}
	empty, err := admins.CreateRole(ctx, contracts.RoleSaveInput{Name: "临时角色", Realm: &administratorRealm}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = admins.DeleteRole(ctx, empty.ID, admin.ID); err != nil {
		t.Fatal("empty role delete", err)
	}

	// The last active super_admin stays protected while restricted
	// administrators exist: they never count toward the guard.
	if _, err = admins.UpdateUser(ctx, admin.ID, contracts.UserUpdate{Status: "disabled"}, admin.ID); !errors.Is(err, platform.ErrLastAdmin) {
		t.Fatal("restricted administrators must not satisfy the guard", err)
	}
	if _, err = admins.UpdateUser(ctx, admin.ID, contracts.UserUpdate{Role: rolePtr(restricted.ID), Status: "active"}, admin.ID); !errors.Is(err, platform.ErrLastAdmin) {
		t.Fatal("last super admin role conversion", err)
	}

	// A restricted administrator is disposable; the last active super_admin is not.
	if _, err = admins.UpdateUser(ctx, account.ID, contracts.UserUpdate{Status: "disabled"}, admin.ID); err != nil {
		t.Fatal("restricted disable", err)
	}
}
