// Author: yunnuo <ymz@ebox.vip>
// Description: Exercise replay and future append-only upgrades on owned fixtures for every supported dialect/profile.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/migrations"
	"github.com/yunnuo/unicore/migrations/catalogdata"
	"github.com/yunnuo/unicore/migrations/runner"
)

func upgradeFixture(s *sqlstore.Store, profile string) map[string]any {
	original := catalogdata.Catalog
	raw, e := json.Marshal(original)
	must(e)
	var next catalogdata.Descriptor
	must(json.Unmarshal(raw, &next))
	sources := map[string][]byte{}
	selected := map[string]bool{}
	for _, id := range original.Profiles[profile].Namespaces {
		selected[id] = true
	}
	for i := range next.Namespaces {
		n := &next.Namespaces[i]
		if !selected[n.Id] {
			continue
		}
		body, e := migrations.Baselines.ReadFile(n.Migrations[0].Files[s.Dialect].Path)
		must(e)
		path := fmt.Sprintf("fixture/%s/%s/0002_replay.sql", n.Id, s.Dialect)
		digest := sha256.Sum256(body)
		n.Migrations = append(n.Migrations, catalogdata.Migration{Version: 2, Files: map[string]catalogdata.SQLFile{s.Dialect: {Path: path, Checksum: hex.EncodeToString(digest[:])}}})
		sources[path] = body
	}
	opts := runner.Options{Dialect: s.Dialect, Profile: profile, Source: func(path string) ([]byte, error) {
		if body, ok := sources[path]; ok {
			return body, nil
		}
		return migrations.Baselines.ReadFile(path)
	}}
	before := summary(s)["row_counts"].(map[string]int64)
	must(runner.ApplyDescriptor(ctx, s.DB, next, opts))
	after := summary(s)["row_counts"].(map[string]int64)
	// Only new successful ledger entries may change during baseline replay.
	delete(before, "schema_migrations")
	delete(after, "schema_migrations")
	check(reflect.DeepEqual(before, after), "baseline replay changed application data")
	exec(s, "INSERT INTO unicore_example_notes(scope_key,id,title,body,status,attachment_ids,version,created_at,updated_at) VALUES('local','upgrade-fixture','kept','existing body','open','[]',1,1,1)")
	for i := range next.Namespaces {
		n := &next.Namespaces[i]
		if n.Id != "module.notes" {
			continue
		}
		body := []byte("ALTER TABLE unicore_example_notes ADD COLUMN tutorial_tag VARCHAR(64) NOT NULL DEFAULT '';\n")
		digest := sha256.Sum256(body)
		path := "fixture/notes/0003_tag.sql"
		sources[path] = body
		n.Migrations = append(n.Migrations, catalogdata.Migration{Version: 3, Files: map[string]catalogdata.SQLFile{s.Dialect: {Path: path, Checksum: hex.EncodeToString(digest[:])}}})
	}
	must(runner.ApplyDescriptor(ctx, s.DB, next, opts))
	check(count(s, "SELECT COUNT(*) FROM unicore_example_notes WHERE id='upgrade-fixture' AND body='existing body' AND tutorial_tag='' AND version=1") == 1, "appended migration lost data")
	must(runner.ApplyDescriptor(ctx, s.DB, next, opts))
	must(runner.VerifyDescriptor(ctx, s.DB, next, opts))
	check(errors.Is(runner.VerifyDescriptor(ctx, s.DB, original, opts), runner.ErrUnknownApplied), "old Catalog accepted a future database")
	return map[string]any{"baseline_replay_preserves_rows": true, "appended_column_preserves_rows": true, "restart_idempotent": true, "old_catalog_refuses_future": true, "fixture_only": true}
}
