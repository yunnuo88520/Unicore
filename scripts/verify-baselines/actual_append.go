// Author: yunnuo <ymz@ebox.vip>
// Description: Verify actual platform@1 to @2 on empty owned fixtures using runner-generated ledgers.
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
	// Racy deliveries recorded before platform@2: two copies of one sourced message plus
	// two independent system messages (empty source) that must stay outside the dedupe key.
	exec(s, "INSERT INTO unicore_inbox_messages(id,recipient_id,type,source_id,title,body,actions,created_at,read_at) VALUES('old-inbox-a','old-recipient','system','old-source','older title','older body','',10,0)")
	exec(s, "INSERT INTO unicore_inbox_messages(id,recipient_id,type,source_id,title,body,actions,created_at,read_at) VALUES('old-inbox-b','old-recipient','system','old-source','newer title','newer body','',20,0)")
	exec(s, "INSERT INTO unicore_inbox_messages(id,recipient_id,type,source_id,title,body,actions,created_at,read_at) VALUES('old-inbox-c','old-recipient','system','','standalone one','body one','',15,0)")
	exec(s, "INSERT INTO unicore_inbox_messages(id,recipient_id,type,source_id,title,body,actions,created_at,read_at) VALUES('old-inbox-d','old-recipient','system','','standalone two','body two','',16,0)")
	before := summary(s)["row_counts"].(map[string]int64)
	oldLedger := query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")
	must(runner.Apply(ctx, s.DB, opts))
	must(runner.Verify(ctx, s.DB, opts))
	check(count(s, "SELECT COUNT(*) FROM unicore_roles WHERE id='old-role' AND name='old-preserved-role' AND realm='user' AND data_scope='self' AND version=1") == 1, "platform@2 lost old role or default version")
	check(count(s, "SELECT COUNT(*) FROM unicore_example_notes WHERE id='old-note' AND body='preserved body' AND version=7 AND created_at=11 AND updated_at=22") == 1, "platform@2 lost old note")
	check(count(s, "SELECT COUNT(*) FROM unicore_system_settings WHERE setting_key='verify.synthetic.keep' AND setting_value='old-setting'") == 1, "platform@2 lost setting")
	check(count(s, "SELECT COUNT(*) FROM unicore_inbox_messages WHERE recipient_id='old-recipient' AND type='system' AND source_id='old-source'") == 1, "platform@2 did not dedupe inbox copies")
	check(count(s, "SELECT COUNT(*) FROM unicore_inbox_messages WHERE id='old-inbox-a' AND title='older title' AND body='older body' AND created_at=10 AND read_at=0") == 1, "platform@2 did not keep the oldest inbox copy")
	check(count(s, "SELECT COUNT(*) FROM unicore_inbox_messages WHERE source_id=''") == 2, "platform@2 touched independent system messages")
	after := summary(s)["row_counts"].(map[string]int64)
	check(after["schema_migrations"] == before["schema_migrations"]+1, "expected exactly one ledger append")
	check(after["unicore_inbox_messages"] == before["unicore_inbox_messages"]-1, "platform@2 changed inbox rows beyond one dedupe")
	delete(before, "schema_migrations")
	delete(after, "schema_migrations")
	delete(before, "unicore_inbox_messages")
	delete(after, "unicore_inbox_messages")
	check(reflect.DeepEqual(before, after), "platform@2 changed existing table counts")
	prefix := query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations WHERE NOT (namespace='platform' AND version=2) ORDER BY namespace,version")
	check(reflect.DeepEqual(oldLedger, prefix), "platform@2 rewrote old ledger")
	stable := query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")
	must(runner.Apply(ctx, s.DB, opts))
	must(runner.Verify(ctx, s.DB, opts))
	check(reflect.DeepEqual(stable, query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")), "restart rewrote ledger")
	exec(s, "INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES('new-role','new-default-role','user','self')")
	check(count(s, "SELECT COUNT(*) FROM unicore_roles WHERE id='new-role' AND version=1") == 1, "new role default version")
	return map[string]any{"passed": true, "dialect": s.Dialect, "profile": profile, "source_platform_version": 1, "target_platform_version": 2, "ledger_generated_only_by_runner": true, "old_ledger_preserved": true, "old_role_preserved_version_default_1": true, "new_role_default_version_1": true, "old_note_version_and_content_preserved": true, "old_setting_preserved": true, "inbox_duplicates_deduped_keep_oldest": true, "inbox_system_messages_untouched": true, "restart_idempotent": true, "ledger": stable}
}
