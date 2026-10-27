// Author: yunnuo <ymz@ebox.vip>
// Description: Upgrade an authentic pre-fixed-role schema and retry the administrator split on every dialect.
package platformsql

import (
	"context"
	"crypto/sha256"
	"fmt"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/migrations"
	"strings"
	"testing"
)

func exerciseLegacyUpgrade(t *testing.T, ctx context.Context, s *sqlstore.Store) {
	t.Helper()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := s.Exec(ctx, s.DB, q, args...); err != nil {
			t.Fatal(q, err)
		}
	}
	exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum VARCHAR(64) NOT NULL)")
	files := []string{"0001_framework.sql", "0002_platform.sql", "0003_platform_mail.sql", "0004_email_challenges.sql", "0005_role_management.sql", "0006_oidc.sql"}
	for i, file := range files {
		body, err := migrations.Files.ReadFile(s.Dialect + "/" + file)
		if err != nil {
			t.Fatal(err)
		}
		lines := []string{}
		for _, line := range strings.Split(string(body), "\n") {
			if !strings.HasPrefix(strings.TrimSpace(line), "--") {
				lines = append(lines, line)
			}
		}
		for _, q := range strings.Split(strings.Join(lines, "\n"), ";") {
			if strings.TrimSpace(q) != "" {
				exec(q)
			}
		}
		exec("INSERT INTO schema_migrations(version,checksum) VALUES(?,?)", i+1, fmt.Sprintf("%x", sha256.Sum256(body)))
	}
	hash, err := platform.HashPassword("legacy-password-strong")
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"old-admin", "old-member"} {
		exec("INSERT INTO users(id,username,email,password_hash,status,created_at,updated_at,last_login_at) VALUES(?,?,?,?,'active',1,1,1)", id, id, id+"@example.test", hash)
	}
	for _, role := range []string{"super_admin", "user", "legacy"} {
		exec("INSERT INTO roles(id,name) VALUES(?,?)", role, role)
	}
	exec("INSERT INTO permissions(id) VALUES('settings:read')")
	exec("INSERT INTO role_permissions(role_id,permission_id) VALUES('user','settings:read')")
	exec("INSERT INTO user_roles(user_id,role_id) VALUES('old-admin','super_admin')")
	exec("INSERT INTO user_roles(user_id,role_id) VALUES('old-admin','user')")
	exec("INSERT INTO user_roles(user_id,role_id) VALUES('old-member','legacy')")
	exec("INSERT INTO external_identities(identity_hash,user_id,issuer,subject,created_at) VALUES('legacy-link','old-admin','https://idp.example.test','old-sub',1)")
	exec("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('old-session','old-admin',4102444800)")
	exec("INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES('old-token','old-member','reset',4102444800)")
	exec("INSERT INTO email_challenges(id,user_id,purpose,code_digest,expires_at,created_at,attempts) VALUES('old-challenge','old-admin','login','digest',4102444800,1,0)")
	exec("INSERT INTO oidc_flows(state_hash,browser_hash,sealed_payload,expires_at) VALUES('old-flow','browser','sealed',4102444800)")
	exec("INSERT INTO system_settings(setting_key,setting_value) VALUES('appearance.theme','dark')")
	for _, state := range []string{"pending", "sending", "sent"} {
		exec("INSERT INTO mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?, 'old-token','sealed',?,1,1,1,4102444800,'lease',4102444800,'')", "legacy-"+state, state)
	}
	if err = s.Migrate(ctx, true); err != nil {
		t.Fatal("upgrade", err)
	}
	// Retry after all copy DML persisted but version recording was interrupted.
	exec("DELETE FROM schema_migrations WHERE version=8")
	exec("DROP TABLE administrator_oidc_flows")
	for range 2 {
		if err = s.Migrate(ctx, true); err != nil {
			t.Fatal("partial/repeated split", err)
		}
	}
	admin, err := (&Repository{Store: s, Administrators: true}).FindAccount(ctx, "old-admin")
	if err != nil || !platform.IsSuper(admin.User) || !platform.VerifyPassword(admin.PasswordHash, "legacy-password-strong") {
		t.Fatal("admin not preserved", err)
	}
	member, err := (&Repository{Store: s}).FindAccount(ctx, "old-member")
	if err != nil || len(member.User.Permissions) != 0 {
		t.Fatal("member unsafe", err)
	}
	count := func(q string, want int) {
		t.Helper()
		var n int
		if err = s.Row(ctx, s.DB, q).Scan(&n); err != nil || n != want {
			t.Fatal(q, n, want, err)
		}
	}
	count("SELECT COUNT(*) FROM administrator_external_identities WHERE user_id='old-admin'", 1)
	count("SELECT COUNT(*) FROM users WHERE id='old-admin'", 0)
	count("SELECT COUNT(*) FROM roles", 2)
	count("SELECT COUNT(*) FROM role_permissions WHERE role_id='user'", 0)
	count("SELECT COUNT(*) FROM system_settings WHERE setting_key='appearance.theme'", 0)
	for _, table := range []string{"sessions", "account_tokens", "email_challenges", "oidc_flows", "administrator_sessions", "administrator_account_tokens", "administrator_email_challenges", "administrator_oidc_flows"} {
		count("SELECT COUNT(*) FROM "+table, 0)
	}
	count("SELECT COUNT(*) FROM mail_jobs WHERE state='cancelled' AND payload='' AND lease_id='' AND lease_until=0", 2)
	count("SELECT COUNT(*) FROM mail_jobs WHERE state='sent'", 1)
	// Leave the migrated schema empty for the normal lifecycle tests.
	for _, table := range []string{"mail_jobs", "administrator_external_identities", "administrator_roles", "administrators", "user_roles", "users", "role_permissions", "roles", "permissions", "system_settings"} {
		exec("DELETE FROM " + table)
	}
}
