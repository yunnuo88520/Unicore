// Author: yunnuo <ymz@ebox.vip>
// Description: R1.0b empty-fixture SQL/Seed verification only, not a migration executor or startup path.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"

	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/adapter/storage/announcementsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/filesql"
	"github.com/yunnuo/unicore/internal/adapter/storage/notessql"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/internal/usecase"
	"github.com/yunnuo/unicore/migrations/catalogdata"
)

type config struct{ Temp, Output, PG, MySQL, Commit, Root string }

const fixturePassword = "R10b-Synthetic-Only-Password!"

func summary(s *sqlstore.Store) map[string]any {
	counts := map[string]int64{}
	for _, t := range tables(s) {
		counts[t] = count(s, "SELECT COUNT(*) FROM "+t)
	}
	result := map[string]any{"row_counts": counts, "ledger": query(s, "SELECT namespace,version,checksum,applied_at FROM schema_migrations ORDER BY namespace,version")}
	if _, ok := counts["roles"]; ok {
		result["roles"] = query(s, "SELECT id,name FROM roles ORDER BY id")
		result["permissions"] = query(s, "SELECT id FROM permissions ORDER BY id")
		result["role_permissions"] = query(s, "SELECT role_id,permission_id FROM role_permissions ORDER BY role_id,permission_id")
		result["storage_locations"] = query(s, "SELECT * FROM storage_locations ORDER BY id")
	}
	return result
}

// This intentionally supports version-1 empty test fixtures only. It has no resume,
// upgrade, validation-bypass, lock or recovery path, and is never imported by a product.
func createEmptyFixture(s *sqlstore.Store, profile, root string) {
	check(len(tables(s)) == 0, "verification target must be completely empty")
	catalog := catalogdata.Catalog
	exec(s, catalog.Ledger.Ddl[s.Dialect])
	for _, id := range catalog.Profiles[profile].Order {
		for _, ns := range catalog.Namespaces {
			if ns.Id != id {
				continue
			}
			check(len(ns.Migrations) == 1 && ns.Migrations[0].Version == 1, "R1.0b fixture accepts initial versions only")
			file := ns.Migrations[0].Files[s.Dialect]
			raw, e := os.ReadFile(filepath.Join(root, "migrations", file.Path))
			must(e)
			check(len(raw) == file.Bytes && fmt.Sprintf("%x", sha256.Sum256(raw)) == file.Checksum, "fixture source checksum drift")
			lines := []string{}
			for _, line := range strings.Split(string(raw), "\n") {
				if !strings.HasPrefix(strings.TrimSpace(line), "--") {
					lines = append(lines, line)
				}
			}
			// These nine reviewed initial SQL files contain no semicolons in literals or routines.
			for _, statement := range strings.Split(strings.Join(lines, "\n"), ";") {
				if strings.TrimSpace(statement) != "" {
					exec(s, statement)
				}
			}
			exec(s, "INSERT INTO schema_migrations(namespace,version,checksum,applied_at) VALUES(?,?,?,?)", id, 1, file.Checksum, time.Now().Unix())
		}
	}
	var anchor string
	must(s.Row(ctx, s.DB, "SELECT checksum FROM schema_migrations WHERE namespace=? AND version=?", catalog.GenerationAnchor.Namespace, catalog.GenerationAnchor.Version).Scan(&anchor))
	check(anchor == catalog.GenerationAnchor.Checksums[s.Dialect], "persisted generation anchor")
}

func seedFixture(s *sqlstore.Store, profile string) (map[string]any, string) {
	tx, e := s.DB.BeginTx(ctx, nil)
	must(e)
	defer tx.Rollback()
	_, e = s.Exec(ctx, tx, "INSERT INTO install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,?)", profile, "r10b-synthetic-instance", time.Now().Unix())
	must(e)
	defaults := settings.Defaults(contracts.Profile(profile))
	keys := []string{}
	for key, value := range defaults {
		_, e = s.Exec(ctx, tx, "INSERT INTO system_settings(setting_key,setting_value) VALUES(?,?)", key, value)
		must(e)
		keys = append(keys, key)
	}
	sort.Strings(keys)
	admin := ""
	if profile == "web-platform" {
		hash, e := platform.HashPassword(fixturePassword)
		must(e)
		r := platformsql.Repository{Store: s, Administrators: true}
		u, e := r.Seed(ctx, tx, contracts.UserCreate{Username: "r10b-admin", Email: "r10b@example.test", Role: "super_admin"}, hash)
		must(e)
		admin = u.ID
		must(s.Audit(ctx, tx, "bootstrap", "install.completed"))
	}
	must(tx.Commit())
	result := map[string]any{"settings": keys, "setting_count": len(defaults), "method": "test install transaction using actual settings.Defaults and platformsql.Repository.Seed; no HTTP installer or bootstrap/local.Open"}
	before := summary(s)
	duplicate := probe(s, "INSERT INTO install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,1)", profile, "duplicate")
	check(!duplicate["accepted"].(bool), "duplicate install marker accepted")
	result["duplicate_marker_rejected"] = true
	if profile == "web-platform" {
		tx, e := s.DB.BeginTx(ctx, nil)
		must(e)
		r := platformsql.Repository{Store: s, Administrators: true}
		_, e = r.Seed(ctx, tx, contracts.UserCreate{Username: "r10b-admin", Email: "r10b@example.test", Role: "super_admin"}, "synthetic-never-used")
		check(errors.Is(e, platform.ErrConflict), "repeated Seed must reject duplicate account")
		must(tx.Rollback())
		result["duplicate_seed"] = "actual Seed returns ErrConflict; rollback preserves roles/grants/accounts/audit counts; Seed is install-only, not a successful repeatable installer"
	}
	check(reflect.DeepEqual(before, summary(s)), "duplicate initialization changed data")
	return result, admin
}

func columnNameType(s *sqlstore.Store, c map[string]any) (string, string) {
	return c["name"].(string), c["type"].(string)
}
func primaryColumns(s *sqlstore.Store, table map[string]any) []string {
	result := []string{}
	if s.Dialect == "sqlite" {
		for _, c := range table["columns"].([]map[string]any) {
			if fmt.Sprint(c["pk"]) != "0" {
				result = append(result, c["name"].(string))
			}
		}
	} else if s.Dialect == "postgres" {
		for _, c := range table["constraints"].([]map[string]any) {
			if c["type"] == "p" {
				d := c["definition"].(string)
				for _, name := range strings.Split(strings.TrimSuffix(strings.TrimPrefix(d, "PRIMARY KEY ("), ")"), ", ") {
					result = append(result, strings.Trim(name, "\""))
				}
			}
		}
	} else {
		for _, i := range table["indexes"].([]map[string]any) {
			if i["name"] == "PRIMARY" {
				result = append(result, i["column_name"].(string))
			}
		}
	}
	return result
}
func nullKeyChecks(s *sqlstore.Store, schema map[string]any) map[string]any {
	results := map[string]any{}
	for name, item := range schema["tables"].(map[string]any) {
		table := item.(map[string]any)
		pk := primaryColumns(s, table)
		for _, target := range pk {
			columns := []string{}
			args := []any{}
			marks := []string{}
			targetType := ""
			for _, c := range table["columns"].([]map[string]any) {
				column, typ := columnNameType(s, c)
				columns = append(columns, column)
				marks = append(marks, "?")
				var value any = "r10b-probe"
				if strings.Contains(strings.ToLower(typ), "int") {
					value = 1
				}
				if column == target {
					value = nil
					targetType = typ
				}
				args = append(args, value)
			}
			if len(pk) == 1 && strings.Contains(strings.ToLower(targetType), "int") {
				continue
			}
			q := "INSERT INTO " + name + "(" + strings.Join(columns, ",") + ") VALUES(" + strings.Join(marks, ",") + ")"
			p := probe(s, q, args...)
			check(!p["accepted"].(bool), "NULL key accepted: %s.%s", name, target)
			message := strings.ToLower(fmt.Sprint(p["error"]))
			check(strings.Contains(message, "null") && strings.Contains(message, target), "must reject specifically the NULL key: %s", message)
			results[name+"."+target] = p
		}
	}
	return results
}
func installSemantics(s *sqlstore.Store) map[string]any {
	result := map[string]any{}
	current := probe(s, "INSERT INTO install_state(id,profile,instance_id,installed_at) VALUES(2,'desktop','probe',1)")
	check(current["accepted"].(bool), "existing singleton behavior unexpectedly changed")
	result["current_allows_second_id"] = true
	if s.Dialect == "sqlite" {
		for _, q := range []string{"INSERT INTO install_state(profile,instance_id,installed_at) VALUES('desktop','rowid',1)", "INSERT INTO install_state(id,profile,instance_id,installed_at) VALUES(NULL,'desktop','rowid',1)"} {
			tx, e := s.DB.BeginTx(ctx, nil)
			must(e)
			_, e = s.Exec(ctx, tx, q)
			must(e)
			var id int
			must(s.Row(ctx, tx, "SELECT id FROM install_state WHERE instance_id='rowid'").Scan(&id))
			check(id == 2, "rowid allocation")
			must(tx.Rollback())
		}
		result["omitted_and_null_integer_pk_allocate_rowid"] = true
	}
	conn, e := s.DB.Conn(ctx)
	must(e)
	defer conn.Close()
	_, e = conn.ExecContext(ctx, "CREATE TEMPORARY TABLE r10b_install_proposal(id INTEGER PRIMARY KEY NOT NULL CHECK(id=1), profile VARCHAR(32) NOT NULL, instance_id VARCHAR(64) NOT NULL, installed_at BIGINT NOT NULL)")
	must(e)
	_, e = conn.ExecContext(ctx, "INSERT INTO r10b_install_proposal VALUES(1,'desktop','probe',1)")
	must(e)
	for _, id := range []int{0, 2} {
		_, e = conn.ExecContext(ctx, fmt.Sprintf("INSERT INTO r10b_install_proposal VALUES(%d,'desktop','probe',1)", id))
		check(e != nil && strings.Contains(strings.ToLower(e.Error()), "check"), "proposed singleton CHECK must reject id=%d", id)
	}
	_, e = conn.ExecContext(ctx, "INSERT INTO r10b_install_proposal VALUES(1,'desktop','duplicate',1)")
	check(e != nil, "proposed singleton duplicate")
	result["proposed_check_id_one"] = "PASS explicit id=1 accepted; id=0/2 and duplicate id=1 rejected; TEMPORARY table only, not baseline"
	length := "length"
	if s.Dialect == "mysql" {
		length = "CHAR_LENGTH"
	}
	_, e = conn.ExecContext(ctx, "CREATE TEMPORARY TABLE r10b_length_proposal(id INTEGER PRIMARY KEY, value TEXT NOT NULL CHECK("+length+"(value)<=64))")
	must(e)
	_, e = conn.ExecContext(ctx, s.Bind("INSERT INTO r10b_length_proposal VALUES(1,?)"), strings.Repeat("测", 64))
	must(e)
	_, e = conn.ExecContext(ctx, s.Bind("INSERT INTO r10b_length_proposal VALUES(2,?)"), strings.Repeat("测", 65))
	check(e != nil && strings.Contains(strings.ToLower(e.Error()), "check"), "proposed Unicode length CHECK")
	result["proposed_explicit_length_check"] = "PASS 64 Unicode characters accepted, 65 rejected by explicit TEXT CHECK; TEMPORARY table only, no baseline length policy change"
	return result
}

func business(s *sqlstore.Store, profile, temp, admin string) map[string]any {
	result := map[string]any{}
	scope := "local"
	if profile == "web-platform" {
		scope = "user:" + admin
	}
	notes := usecase.Notes{Repo: &notessql.Repository{Store: s}}
	input := contracts.NoteInput{Title: strings.Repeat("测", 120), Body: "baseline fixture", Status: "open", AttachmentIds: []string{}}
	n, e := notes.Create(ctx, scope, input)
	must(e)
	queryInput := contracts.NoteQuery{Page: 1, Sort: "updated_at", Direction: "desc"}
	list, e := notes.List(ctx, scope, queryInput)
	must(e)
	check(list.Total == 1, "notes create/read")
	other, e := notes.List(ctx, "different-scope", queryInput)
	must(e)
	check(other.Total == 0, "notes scope isolation")
	_, e = notes.Create(ctx, scope, contracts.NoteInput{Title: strings.Repeat("测", 121), Status: "open"})
	check(errors.Is(e, domain.ErrNoteInvalid), "Go title length validation")
	u := contracts.NoteUpdate{Title: "updated", Body: "updated", Status: "done", Version: n.Version, AttachmentIds: []string{}}
	updated, e := notes.Update(ctx, scope, n.ID, u)
	must(e)
	check(updated.Version == 2, "notes version")
	_, e = notes.Update(ctx, scope, n.ID, u)
	check(errors.Is(e, usecase.ErrNoteConflict), "stale version rejected")
	must(notes.Delete(ctx, scope, n.ID, updated.Version))
	list, e = notes.List(ctx, scope, queryInput)
	must(e)
	check(list.Total == 0, "notes soft delete")
	check(count(s, "SELECT COUNT(*) FROM example_notes WHERE id=? AND deleted_at>0 AND version=3", n.ID) == 1, "notes persisted lifecycle")
	result["notes"] = "PASS create/list/update/conflict/scope/soft-delete/audit; 120-rune title accepted, 121 rejected by Go"
	if profile != "web-platform" {
		return result
	}
	r := platformsql.Repository{Store: s}
	identity := platform.New(&r)
	user, e := identity.Create(ctx, contracts.UserCreate{Username: " MiXeD_User ", Email: " MiXeD@Example.Test ", Password: fixturePassword, Role: "user"}, admin)
	must(e)
	check(user.Username == "mixed_user" && user.Email == "mixed@example.test", "create normalization")
	for _, login := range []string{" MIXED_USER ", " MIXED@EXAMPLE.TEST "} {
		session, token, err := identity.Login(ctx, contracts.LoginInput{Username: login, Password: fixturePassword}, "127.0.0.1", false, 1)
		must(err)
		check(session.User.ID == user.ID, "normalized login")
		must(r.DeleteSession(ctx, platform.Hash(token)))
	}
	_, e = identity.Create(ctx, contracts.UserCreate{Username: "MIXED_USER", Email: "other@example.test", Password: fixturePassword, Role: "user"}, admin)
	check(errors.Is(e, platform.ErrConflict), "normalized duplicate username")
	_, e = identity.Create(ctx, contracts.UserCreate{Username: "other_user", Email: "MIXED@EXAMPLE.TEST", Password: fixturePassword, Role: "user"}, admin)
	check(errors.Is(e, platform.ErrConflict), "normalized duplicate email")
	result["identity"] = "PASS actual Service.Create/Login lower+trim, mixed-case username/email login, duplicate canonical values rejected; raw SQL collation remains dialect-specific"
	fsrepo := &filesql.Repository{Store: s}
	fileService := files.Service{Repo: fsrepo, Factory: func(location files.Location, _ files.Credentials) (blob.Store, error) {
		return bloblocal.New(filepath.Join(temp, "blobs", location.ID)), nil
	}}
	legacy := bloblocal.New(filepath.Join(temp, "blobs", "legacy-brand"))
	payload := []byte("synthetic legacy brand bytes")
	_, e = legacy.Put(ctx, "legacy-probe.png", bytes.NewReader(payload), int64(len(payload)), "image/png")
	must(e)
	for i := 0; i < 2; i++ {
		reader, _, e := fileService.BrandStore().Open(ctx, "legacy-probe.png")
		must(e)
		actual, e := io.ReadAll(reader)
		must(e)
		must(reader.Close())
		check(bytes.Equal(payload, actual), "legacy brand fallback bytes")
	}
	check(count(s, "SELECT COUNT(*) FROM file_metadata WHERE id='legacy-probe.png' AND location_id='legacy-brand' AND purpose='branding'") == 1, "fallback metadata not duplicated")
	stored := files.UploadSession{FileID: "legacy-probe.png", UploadID: "synthetic", Fingerprint: strings.Repeat("f", 64), PartSize: 5242880}
	must(fsrepo.SaveSession(ctx, stored, true))
	fetched, e := fsrepo.Session(ctx, stored.FileID)
	must(e)
	check(reflect.DeepEqual(stored, fetched), "upload session roundtrip")
	result["files"] = "PASS actual legacy-brand fallback twice, one metadata row, local blob bytes and upload-session persistence; no cloud network"
	announcements := usecase.Announcements{Repo: &announcementsql.Repository{Store: s}, Render: func(content, format string) (string, error) { return "<p>fixture</p>", nil }}
	a, e := announcements.Create(ctx, contracts.AnnouncementInput{Content: "synthetic", Format: "markdown", Type: "info", Status: "published", PublishAt: 1}, admin)
	must(e)
	feed, e := announcements.Feed(ctx, 1, 20)
	must(e)
	check(feed.Total == 1, "announcement published feed")
	_, e = announcements.Create(ctx, contracts.AnnouncementInput{Content: "forbidden", Format: "markdown", Type: "info", Status: "published", PublishAt: 1}, user.ID)
	check(errors.Is(e, platform.ErrForbidden), "announcement user cannot write")
	must(announcements.Delete(ctx, contracts.AnnouncementDelete{Items: []contracts.AnnouncementSelection{{ID: a.ID, Version: a.Version}}}, admin))
	feed, e = announcements.Feed(ctx, 1, 20)
	must(e)
	check(feed.Total == 0, "announcement delete")
	result["announcements"] = "PASS authorized create/feed/soft-delete, ordinary-user mutation rejected, audit foreign keys"
	return result
}

func main() {
	for _, v := range os.Environ() {
		check(!strings.HasPrefix(v, "APP_") && !strings.HasPrefix(v, "UNICORE_"), "inherited application environment forbidden")
	}
	var cancel context.CancelFunc
	ctx, cancel = context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	check(len(os.Args) == 2, "supply explicit private runner configuration")
	var c config
	raw, e := os.ReadFile(os.Args[1])
	must(e)
	must(json.Unmarshal(raw, &c))
	check(filepath.IsAbs(c.Temp) && strings.HasPrefix(filepath.Base(c.Temp), "unicore-r10b-"), "unexpected temp root")
	pg, e := url.Parse(c.PG)
	must(e)
	check(pg.Hostname() == "127.0.0.1" && pg.Path == "/postgres", "PG must be isolated loopback control target")
	my, e := mysqldriver.ParseDSN(c.MySQL)
	must(e)
	check(strings.HasPrefix(my.Addr, "127.0.0.1:") && my.DBName == "mysql", "MySQL must be isolated loopback control target")
	must(os.MkdirAll(c.Output, 0700))
	open := func(driver, name, path string) *sqlstore.Store {
		dsn := ""
		if driver == "postgres" {
			dsn = strings.Replace(c.PG, "/postgres?", "/"+name+"?", 1)
		}
		if driver == "mysql" {
			dsn = strings.Replace(c.MySQL, "/mysql?", "/"+name+"?", 1)
		}
		s, e := webdb.Open(ctx, driver, dsn, path)
		must(e)
		s.DB.SetMaxOpenConns(1)
		return s
	}
	for _, driver := range []string{"postgres", "mysql"} {
		control := open(driver, map[string]string{"postgres": "postgres", "mysql": "mysql"}[driver], "")
		for _, name := range []string{"r10b_platform", "r10b_standalone"} {
			exec(control, "CREATE DATABASE "+name)
		}
		must(control.Close())
	}
	combinations := []map[string]any{}
	for _, driver := range []string{"sqlite", "postgres", "mysql"} {
		profiles := []string{"web-platform", "web-standalone"}
		if driver == "sqlite" {
			profiles = append(profiles, "desktop")
		}
		for _, profile := range profiles {
			id := driver + "-" + profile
			name := "r10b_standalone"
			if profile == "web-platform" {
				name = "r10b_platform"
			}
			dir := filepath.Join(c.Temp, id)
			s := open(driver, name, filepath.Join(dir, "unicore.db"))
			createEmptyFixture(s, profile, c.Root)
			schema := inventory(s)
			sqlOnly := summary(s)
			seed, admin := seedFixture(s, profile)
			afterSeed := summary(s)
			nulls := nullKeyChecks(s, schema)
			behavior := probes(s, profile == "web-platform")
			check(!behavior["null_text_primary_key"].(map[string]any)["accepted"].(bool), "NULL text key")
			check(reflect.DeepEqual(afterSeed, summary(s)), "constraint probes leaked data")
			install := installSemantics(s)
			businessResult := business(s, profile, dir, admin)
			expected := 5
			if profile == "web-platform" {
				expected = 29
			}
			check(len(tables(s)) == expected, "table count changed")
			write(filepath.Join(c.Output, id+".json"), map[string]any{"author": "yunnuo <ymz@ebox.vip>", "generated_evidence": true, "source_commit": c.Commit, "combination": id, "passed": true, "scope": "new SQL empty-fixture/real Seed/business validation, not R1.0c startup protection", "schema": schema, "sql_only_data": sqlOnly, "go_seed": seed, "post_seed_data": afterSeed, "all_text_and_composite_pk_null_checks": nulls, "behavior_probes": behavior, "install_state_semantics": install, "business": businessResult})
			combinations = append(combinations, map[string]any{"combination": id, "passed": true, "tables": expected, "null_key_probes": len(nulls)})
			must(s.Close())
			fmt.Println("PASS", id, expected, "tables; all text/composite NULL keys, real Seed and business behavior")
		}
	}
	write(filepath.Join(c.Output, "execution-summary.json"), map[string]any{"author": "yunnuo <ymz@ebox.vip>", "generated_evidence": true, "source_commit": c.Commit, "combinations": combinations, "cli_database_created": false, "new_executor_implemented": false})
}
