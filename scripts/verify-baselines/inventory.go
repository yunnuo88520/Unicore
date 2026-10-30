// Author: yunnuo <ymz@ebox.vip>
// Description: Read actual database catalogs for isolated baseline verification, never application startup.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"os"
	"strings"
)

var ctx context.Context

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func check(ok bool, format string, args ...any) {
	if !ok {
		panic(fmt.Sprintf(format, args...))
	}
}
func query(s *sqlstore.Store, q string, args ...any) []map[string]any {
	rows, err := s.Rows(ctx, s.DB, q, args...)
	must(err)
	defer rows.Close()
	cols, err := rows.Columns()
	must(err)
	out := []map[string]any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		must(rows.Scan(ptrs...))
		item := map[string]any{}
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				v = string(b)
			}
			item[cols[i]] = v
		}
		out = append(out, item)
	}
	must(rows.Err())
	return out
}
func exec(s *sqlstore.Store, q string, args ...any) {
	_, err := s.Exec(ctx, s.DB, q, args...)
	must(err)
}
func count(s *sqlstore.Store, q string, args ...any) int64 {
	var n int64
	must(s.Row(ctx, s.DB, q, args...).Scan(&n))
	return n
}
func write(name string, v any) {
	data, err := json.MarshalIndent(v, "", "  ")
	must(err)
	must(os.WriteFile(name, append(data, '\n'), 0600))
}
func tables(s *sqlstore.Store) []string {
	q := "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
	if s.Dialect == "postgres" {
		q = "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
	}
	if s.Dialect == "mysql" {
		q = "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
	}
	names := []string{}
	for _, r := range query(s, q) {
		names = append(names, r["name"].(string))
	}
	return names
}
func inventory(s *sqlstore.Store) map[string]any {
	result := map[string]any{"tables": map[string]any{}}
	all := result["tables"].(map[string]any)
	if s.Dialect == "sqlite" {
		result["server"] = query(s, "SELECT sqlite_version() AS version")
		result["connection"] = map[string]any{"foreign_keys": query(s, "PRAGMA foreign_keys"), "journal_mode": query(s, "PRAGMA journal_mode"), "busy_timeout": query(s, "PRAGMA busy_timeout")}
		result["other_objects"] = query(s, "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('view','trigger') ORDER BY type,name")
	}
	if s.Dialect == "postgres" {
		result["server"] = query(s, "SELECT version(),current_database(),current_schema(),current_setting('server_encoding') AS encoding,current_setting('lc_collate') AS collation")
		result["other_objects"] = query(s, "SELECT table_name FROM information_schema.views WHERE table_schema='public' ORDER BY table_name")
		result["triggers"] = query(s, "SELECT event_object_table,trigger_name,action_statement FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY event_object_table,trigger_name")
	}
	if s.Dialect == "mysql" {
		result["server"] = query(s, "SELECT VERSION() AS version,DATABASE() AS database_name,@@sql_mode AS sql_mode,@@character_set_database AS charset,@@collation_database AS collation")
		result["other_objects"] = query(s, "SELECT TABLE_NAME AS name,TABLE_TYPE AS type FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE<>'BASE TABLE' ORDER BY TABLE_NAME")
		result["triggers"] = query(s, "SELECT TRIGGER_NAME,EVENT_OBJECT_TABLE,ACTION_STATEMENT FROM information_schema.triggers WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME")
	}
	for _, name := range tables(s) {
		t := map[string]any{}
		if s.Dialect == "sqlite" {
			t["ddl"] = query(s, "SELECT sql FROM sqlite_schema WHERE type='table' AND name=?", name)
			t["columns"] = query(s, "PRAGMA table_xinfo('"+name+"')")
			idx := query(s, "PRAGMA index_list('"+name+"')")
			for _, i := range idx {
				i["columns"] = query(s, "PRAGMA index_xinfo('"+i["name"].(string)+"')")
				i["ddl"] = query(s, "SELECT sql FROM sqlite_schema WHERE type='index' AND name=?", i["name"])
			}
			t["indexes"] = idx
			t["foreign_keys"] = query(s, "PRAGMA foreign_key_list('"+name+"')")
		}
		if s.Dialect == "postgres" {
			t["columns"] = query(s, `SELECT a.attnum AS ordinal,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_expression,a.attidentity AS identity,a.attgenerated AS generated,co.collname AS collation FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation WHERE n.nspname='public' AND c.relname=? AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, name)
			t["constraints"] = query(s, `SELECT co.conname AS name,co.contype AS type,pg_get_constraintdef(co.oid) AS definition,co.confupdtype AS update_action,co.confdeltype AS delete_action,co.condeferrable AS deferrable,co.condeferred AS initially_deferred FROM pg_constraint co JOIN pg_class t ON t.oid=co.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=? ORDER BY co.contype,co.conname`, name)
			t["indexes"] = query(s, "SELECT indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname='public' AND tablename=? ORDER BY indexname", name)
		}
		if s.Dialect == "mysql" {
			t["ddl"] = query(s, "SHOW CREATE TABLE `"+name+"`")
			t["columns"] = query(s, `SELECT ORDINAL_POSITION AS ordinal,COLUMN_NAME AS name,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS default_expression,COLUMN_KEY AS column_key,EXTRA AS extra,CHARACTER_SET_NAME AS charset,COLLATION_NAME AS collation FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, name)
			t["indexes"] = query(s, `SELECT INDEX_NAME AS name,NON_UNIQUE AS non_unique,SEQ_IN_INDEX AS ordinal,COLUMN_NAME AS column_name,COLLATION AS ordering,SUB_PART AS prefix_length,INDEX_TYPE AS type,EXPRESSION AS expression FROM information_schema.statistics WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME,SEQ_IN_INDEX`, name)
			t["constraints"] = query(s, `SELECT CONSTRAINT_NAME AS name,CONSTRAINT_TYPE AS type FROM information_schema.table_constraints WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY CONSTRAINT_NAME`, name)
			t["foreign_keys"] = query(s, `SELECT k.CONSTRAINT_NAME AS name,k.COLUMN_NAME AS column_name,k.REFERENCED_TABLE_NAME AS referenced_table,k.REFERENCED_COLUMN_NAME AS referenced_column,r.UPDATE_RULE AS update_rule,r.DELETE_RULE AS delete_rule FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME=? ORDER BY k.CONSTRAINT_NAME,k.ORDINAL_POSITION`, name)
			t["table_options"] = query(s, "SELECT ENGINE,ROW_FORMAT,TABLE_COLLATION,CREATE_OPTIONS FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", name)
		}
		all[name] = t
	}
	return result
}

func probe(s *sqlstore.Store, q string, args ...any) map[string]any {
	tx, e := s.DB.BeginTx(ctx, nil)
	must(e)
	_, e = s.Exec(ctx, tx, q, args...)
	out := map[string]any{"accepted": e == nil}
	if e != nil {
		out["error"] = e.Error()
	}
	must(tx.Rollback())
	return out
}
func probes(s *sqlstore.Store, p bool) map[string]any {
	out := map[string]any{}
	out["null_text_primary_key"] = probe(s, "INSERT INTO audit_logs(id,actor_id,action,created_at) VALUES(NULL,'probe','probe',1)")
	out["varchar_64_accepts_65_chars"] = probe(s, "INSERT INTO audit_logs(id,actor_id,action,created_at) VALUES('length-probe',?,'probe',1)", strings.Repeat("a", 65))
	out["notes_default_deleted_at"] = func() any {
		tx, e := s.DB.BeginTx(ctx, nil)
		must(e)
		_, e = s.Exec(ctx, tx, "INSERT INTO example_notes(scope_key,id,title,body,status,attachment_ids,version,created_at,updated_at) VALUES('probe','probe','probe','','active','[]',1,1,1)")
		must(e)
		var n int
		must(s.Row(ctx, tx, "SELECT deleted_at FROM example_notes WHERE scope_key='probe' AND id='probe'").Scan(&n))
		must(tx.Rollback())
		check(n == 0, "deleted_at default")
		return n
	}()
	if p {
		out["dangling_session_fk"] = probe(s, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('probe','missing-user',1)")
		tx, e := s.DB.BeginTx(ctx, nil)
		must(e)
		_, e = s.Exec(ctx, tx, "INSERT INTO users(id,username,email,password_hash,status,created_at,updated_at,last_login_at) VALUES('case-a','CaseProbe','case-a@example.test','probe','active',1,1,0)")
		must(e)
		_, e = s.Exec(ctx, tx, "INSERT INTO users(id,username,email,password_hash,status,created_at,updated_at,last_login_at) VALUES('case-b','caseprobe','case-b@example.test','probe','active',1,1,0)")
		collision := map[string]any{"accepted": e == nil}
		if e != nil {
			collision["error"] = e.Error()
		}
		out["case_variant_usernames"] = collision
		must(tx.Rollback())
		tx, e = s.DB.BeginTx(ctx, nil)
		must(e)
		_, e = s.Exec(ctx, tx, "INSERT INTO users(id,username,email,password_hash,status,created_at,updated_at,last_login_at) VALUES('email-a','email_a','Case@Example.Test','probe','active',1,1,0)")
		must(e)
		_, e = s.Exec(ctx, tx, "INSERT INTO users(id,username,email,password_hash,status,created_at,updated_at,last_login_at) VALUES('email-b','email_b','case@example.test','probe','active',1,1,0)")
		collision = map[string]any{"accepted": e == nil}
		if e != nil {
			collision["error"] = e.Error()
		}
		out["case_variant_emails"] = collision
		must(tx.Rollback())
	}
	return out
}
