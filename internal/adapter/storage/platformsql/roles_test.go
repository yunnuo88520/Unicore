// Author: yunnuo <ymz@ebox.vip>
// Description: Real dialect migration from custom roles to fixed roles, preserving accounts and revoking credentials.
package platformsql

import (
	"context"
	"errors"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func exerciseRoles(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, admin contracts.User) {
	t.Helper()
	identity := platform.New(r)
	legacy, err := identity.Create(ctx, contracts.UserCreate{Username: "legacycustom", Email: "legacycustom@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, token, err := identity.Issue(ctx, legacy, 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		"DELETE FROM schema_migrations WHERE version=7",
		"INSERT INTO roles(id,name) VALUES('legacy-role','Legacy custom role')",
		"INSERT INTO role_permissions(role_id,permission_id) VALUES('legacy-role','settings:read')",
		"INSERT INTO role_permissions(role_id,permission_id) VALUES('user','users:read')",
	} {
		if _, err = store.Exec(ctx, store.DB, query); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = store.Exec(ctx, store.DB, "UPDATE user_roles SET role_id='legacy-role' WHERE user_id=?", legacy.ID); err != nil {
		t.Fatal(err)
	}
	// Legacy multi-role data must preserve the administrator rather than denying recovery access.
	for _, role := range []string{"user", "legacy-role"} {
		if _, err = store.Exec(ctx, store.DB, "INSERT INTO user_roles(user_id,role_id) VALUES(?,?)", admin.ID, role); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES('legacy-token',?,'reset',4102444800)", legacy.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO email_challenges(id,user_id,purpose,code_digest,expires_at,created_at,attempts) VALUES('legacy-challenge',?,'login','unused-digest',4102444800,1,0)", legacy.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO oidc_flows(state_hash,browser_hash,sealed_payload,expires_at) VALUES('legacy-flow','browser','sealed-test-context',4102444800)"); err != nil {
		t.Fatal(err)
	}
	for _, state := range []string{"pending", "sending", "sent"} {
		if _, err = store.Exec(ctx, store.DB, "INSERT INTO mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,'sealed-test-mail',?,1,1,1,4102444800,'old-lease',4102444800,'')", "legacy-"+state, "legacy-token", state); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO system_settings(setting_key,setting_value) VALUES('appearance.theme','dark')"); err != nil {
		t.Fatal(err)
	}
	before, err := r.FindAccount(ctx, legacy.Username)
	if err != nil || platform.Has(before.User, "settings:read") {
		t.Fatal("legacy grant authorized", err)
	}
	for range 2 {
		if err = store.Migrate(ctx, true); err != nil {
			t.Fatal("fixed role migration/retry", err)
		}
	}
	account, err := r.FindAccount(ctx, legacy.Username)
	if err != nil || len(account.User.Roles) != 1 || account.User.Roles[0] != "user" || len(account.User.Permissions) != 0 || !platform.VerifyPassword(account.PasswordHash, "test-password-strong") {
		t.Fatal("account not preserved/safely demoted", account.User, err)
	}
	if _, err = identity.Session(ctx, token); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("legacy session survived", err)
	}
	for _, table := range []string{"sessions", "account_tokens", "email_challenges", "oidc_flows"} {
		var count int
		if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM "+table).Scan(&count); err != nil || count != 0 {
			t.Fatal("legacy credential survived", table, count, err)
		}
	}
	for _, state := range []string{"pending", "sending"} {
		var actual, payload, lease string
		var until int64
		if err = store.Row(ctx, store.DB, "SELECT state,payload,lease_id,lease_until FROM mail_jobs WHERE id=?", "legacy-"+state).Scan(&actual, &payload, &lease, &until); err != nil || actual != "cancelled" || payload != "" || lease != "" || until != 0 {
			t.Fatal("legacy delivery still consumable", state, actual, err)
		}
	}
	var sentState string
	if err = store.Row(ctx, store.DB, "SELECT state FROM mail_jobs WHERE id='legacy-sent'").Scan(&sentState); err != nil || sentState != "sent" {
		t.Fatal("delivery history changed", sentState, err)
	}
	current, err := r.FindAccount(ctx, "admin")
	if err != nil || !platform.IsSuper(current.User) || !platform.Has(current.User, "settings:read") {
		t.Fatal("administrator lost", err)
	}
	var count int
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM roles").Scan(&count); err != nil || count != 2 {
		t.Fatal("role normalization", count, err)
	}
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM role_permissions WHERE role_id='user'").Scan(&count); err != nil || count != 0 {
		t.Fatal("member grants survived", count, err)
	}
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM system_settings WHERE setting_key='appearance.theme'").Scan(&count); err != nil || count != 0 {
		t.Fatal("global appearance survived", count, err)
	}
	if _, err = identity.Create(ctx, contracts.UserCreate{Username: "customagain", Email: "customagain@example.test", Password: "test-password-strong", Role: "legacy-role"}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("new custom role assignment", err)
	}
	if _, err = r.RoleOptions(ctx, legacy.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("member role options", err)
	}
	options, err := r.RoleOptions(ctx, admin.ID)
	if err != nil || len(options.Items) != 2 {
		t.Fatal("admin role options", err)
	}
	// A residual grant added after migration still cannot authorize a member.
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO role_permissions(role_id,permission_id) VALUES('user','settings:read')"); err != nil {
		t.Fatal(err)
	}
	member, err := r.FindAccount(ctx, legacy.Username)
	if err != nil || platform.Has(member.User, "settings:read") || len(member.User.Permissions) != 0 {
		t.Fatal("residual grant bypass", err)
	}
	if _, err = r.CreateUser(ctx, contracts.UserCreate{Username: "escalate", Email: "escalate@example.test", Role: "super_admin"}, account.PasswordHash, legacy.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("member created administrator", err)
	}
	if _, err = store.Exec(ctx, store.DB, "DELETE FROM role_permissions WHERE role_id='user'"); err != nil {
		t.Fatal(err)
	}
}
