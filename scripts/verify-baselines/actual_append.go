// Author: yunnuo <ymz@ebox.vip>
// Description: Verify actual platform@1 to @2 with retained personal-security data on owned fixtures using runner-generated ledgers.
package main

import (
	"encoding/json"
	"errors"
	"reflect"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/migrations/catalogdata"
	"github.com/yunnuo/unicore/migrations/runner"
)

func actualPlatformAppend(s *sqlstore.Store, profile string) map[string]any {
	check(len(tables(s)) == 0, "actual append target must be completely empty")
	raw, e := json.Marshal(catalogdata.Catalog)
	must(e)
	var previous catalogdata.Descriptor
	must(json.Unmarshal(raw, &previous))
	for i := range previous.Namespaces {
		n := &previous.Namespaces[i]
		if n.Id == "platform" {
			check(n.Migrations[len(n.Migrations)-1].Version == 2, "expected current platform@2")
			n.Migrations = n.Migrations[:len(n.Migrations)-1]
			check(n.Migrations[len(n.Migrations)-1].Version == 1, "expected previous platform@1")
		}
	}
	opts := runner.Options{Dialect: s.Dialect, Profile: profile}
	must(runner.ApplyDescriptor(ctx, s.DB, previous, opts))
	must(runner.VerifyDescriptor(ctx, s.DB, previous, opts))
	exec(s, "INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES('old-role','old-preserved-role','user','self')")
	exec(s, "INSERT INTO unicore_example_notes(scope_key,id,title,body,status,attachment_ids,version,created_at,updated_at) VALUES('local','old-note','preserved title','preserved body','open','[]',7,11,22)")
	exec(s, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES('verify.synthetic.keep','old-setting')")
	exec(s, "INSERT INTO unicore_users(id,username,email,password_hash,status,created_at,updated_at,last_login_at) VALUES('old-user','old-user','old-user@example.test','','active',11,22,0)")
	exec(s, "INSERT INTO unicore_personal_accounts(user_id,display_name,totp_secret,recovery_digests,last_step,setup_secret,setup_session,setup_expires,setup_attempts) VALUES('old-user','保留昵称 / Preserved name','','',-1,'','',0,0)")
	exec(s, "INSERT INTO unicore_sessions(token_hash,user_id,expires_at) VALUES('old-session','old-user',2000000000)")
	exec(s, "INSERT INTO unicore_session_details(token_hash,user_id,ip_address,user_agent,created_at,last_seen_at,mfa_verified,mfa_attempts) VALUES('old-session','old-user','192.0.2.1','Preserved device',11,22,1,0)")
	exec(s, "INSERT INTO unicore_email_changes(id,user_id,session_hash,parent_id,original_email,target_email,code_digest,verified,attempts,created_at,expires_at) VALUES('old-proof','old-user','old-session','','old-user@example.test','replacement@example.test','synthetic-proof',0,1,11,2000000000)")
	securityRows := func() map[string]any {
		rows := map[string]any{}
		for _, table := range []string{"unicore_users", "unicore_personal_accounts", "unicore_sessions", "unicore_session_details", "unicore_email_changes"} {
			rows[table] = query(s, "SELECT * FROM "+table+" ORDER BY 1")
		}
		return rows
	}
	oldSecurity := securityRows()
	before := summary(s)["row_counts"].(map[string]int64)
	oldLedger := query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")
	must(runner.Apply(ctx, s.DB, opts))
	must(runner.Verify(ctx, s.DB, opts))
	check(count(s, "SELECT COUNT(*) FROM unicore_roles WHERE id='old-role' AND name='old-preserved-role' AND realm='user' AND data_scope='self' AND version=1") == 1, "platform@2 lost old role or default version")
	check(count(s, "SELECT COUNT(*) FROM unicore_example_notes WHERE id='old-note' AND body='preserved body' AND version=7 AND created_at=11 AND updated_at=22") == 1, "platform@2 lost old note")
	check(count(s, "SELECT COUNT(*) FROM unicore_system_settings WHERE setting_key='verify.synthetic.keep' AND setting_value='old-setting'") == 1, "platform@2 lost setting")
	check(reflect.DeepEqual(oldSecurity, securityRows()), "platform@2 changed existing personal-security values")
	if s.Dialect == "mysql" {
		for table, columns := range map[string][]string{
			"unicore_personal_accounts": {"user_id"},
			"unicore_session_details":   {"token_hash", "user_id"},
			"unicore_email_changes":     {"id", "user_id", "session_hash", "parent_id"},
		} {
			for _, column := range columns {
				check(count(s, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? AND collation_name='utf8mb4_0900_ai_ci'", table, column) == 1, "personal association key collation: %s.%s", table, column)
			}
		}
	}
	after := summary(s)["row_counts"].(map[string]int64)
	check(after["schema_migrations"] == before["schema_migrations"]+1, "expected exactly one ledger append")
	delete(before, "schema_migrations")
	delete(after, "schema_migrations")
	check(reflect.DeepEqual(before, after), "platform@2 changed existing table counts")
	prefix := query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations WHERE NOT (namespace='platform' AND version=2) ORDER BY namespace,version")
	check(reflect.DeepEqual(oldLedger, prefix), "platform@2 rewrote old ledger")
	check(errors.Is(runner.VerifyDescriptor(ctx, s.DB, previous, opts), runner.ErrUnknownApplied), "old catalog accepted the upgraded database")
	stable := query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")
	must(runner.Apply(ctx, s.DB, opts))
	must(runner.Verify(ctx, s.DB, opts))
	check(reflect.DeepEqual(stable, query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")), "restart rewrote ledger")
	check(reflect.DeepEqual(oldSecurity, securityRows()), "restart changed existing personal-security values")
	exec(s, "INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES('new-role','new-default-role','user','self')")
	check(count(s, "SELECT COUNT(*) FROM unicore_roles WHERE id='new-role' AND version=1") == 1, "new role default version")
	return map[string]any{"passed": true, "dialect": s.Dialect, "profile": profile, "source_platform_version": 1, "target_platform_version": 2, "ledger_generated_only_by_runner": true, "old_ledger_preserved": true, "old_role_preserved_version_default_1": true, "new_role_default_version_1": true, "old_note_version_and_content_preserved": true, "old_setting_preserved": true, "personal_security_data_preserved": true, "association_key_collations_verified": s.Dialect == "mysql", "old_catalog_refuses_future": true, "restart_idempotent": true, "ledger": stable}
}
