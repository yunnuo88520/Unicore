// Author: yunnuo <ymz@ebox.vip>
// Description: Verify actual platform@2 to @3 on empty owned fixtures using runner-generated ledgers.
package main

import (
	"encoding/json"
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
			check(n.Migrations[len(n.Migrations)-1].Version == 3, "expected current platform@3")
			n.Migrations = n.Migrations[:len(n.Migrations)-1]
			check(n.Migrations[len(n.Migrations)-1].Version == 2, "expected previous platform@2")
		}
	}
	opts := runner.Options{Dialect: s.Dialect, Profile: profile}
	must(runner.ApplyDescriptor(ctx, s.DB, previous, opts))
	must(runner.VerifyDescriptor(ctx, s.DB, previous, opts))
	exec(s, "INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES('old-role','old-preserved-role','user','self')")
	exec(s, "INSERT INTO unicore_example_notes(scope_key,id,title,body,status,attachment_ids,version,created_at,updated_at) VALUES('local','old-note','preserved title','preserved body','open','[]',7,11,22)")
	exec(s, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES('verify.synthetic.keep','old-setting')")
	before := summary(s)["row_counts"].(map[string]int64)
	oldLedger := query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")
	must(runner.Apply(ctx, s.DB, opts))
	must(runner.Verify(ctx, s.DB, opts))
	check(count(s, "SELECT COUNT(*) FROM unicore_roles WHERE id='old-role' AND name='old-preserved-role' AND realm='user' AND data_scope='self' AND version=1") == 1, "platform@3 lost old role or default version")
	check(count(s, "SELECT COUNT(*) FROM unicore_example_notes WHERE id='old-note' AND body='preserved body' AND version=7 AND created_at=11 AND updated_at=22") == 1, "platform@3 lost old note")
	check(count(s, "SELECT COUNT(*) FROM unicore_system_settings WHERE setting_key='verify.synthetic.keep' AND setting_value='old-setting'") == 1, "platform@3 lost setting")
	after := summary(s)["row_counts"].(map[string]int64)
	check(after["schema_migrations"] == before["schema_migrations"]+1, "expected exactly one ledger append")
	delete(before, "schema_migrations")
	delete(after, "schema_migrations")
	check(reflect.DeepEqual(before, after), "platform@3 changed existing table counts")
	prefix := query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations WHERE NOT (namespace='platform' AND version=3) ORDER BY namespace,version")
	check(reflect.DeepEqual(oldLedger, prefix), "platform@3 rewrote old ledger")
	stable := query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")
	must(runner.Apply(ctx, s.DB, opts))
	must(runner.Verify(ctx, s.DB, opts))
	check(reflect.DeepEqual(stable, query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")), "restart rewrote ledger")
	exec(s, "INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES('new-role','new-default-role','user','self')")
	check(count(s, "SELECT COUNT(*) FROM unicore_roles WHERE id='new-role' AND version=1") == 1, "new role default version")
	return map[string]any{"passed": true, "dialect": s.Dialect, "profile": profile, "source_platform_version": 2, "target_platform_version": 3, "ledger_generated_only_by_runner": true, "old_ledger_preserved": true, "old_role_preserved_version_default_1": true, "new_role_default_version_1": true, "old_note_version_and_content_preserved": true, "old_setting_preserved": true, "restart_idempotent": true, "ledger": stable}
}
