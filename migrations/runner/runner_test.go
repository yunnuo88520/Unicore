// Author: yunnuo <ymz@ebox.vip>
// Description: Baseline application, idempotence, ledger tampering and profile scoping, verified on isolated SQLite databases.
package runner

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/yunnuo/unicore/migrations/catalogdata"
)

const fixedStamp = 1700000000

func openSQLite(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "baseline.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func testOptions(profile string) Options {
	return Options{Dialect: "sqlite", Profile: profile, Now: func() time.Time { return time.Unix(fixedStamp, 0) }}
}

func ledgerRows(t *testing.T, db *sql.DB) map[string]string {
	t.Helper()
	rows, err := db.Query("SELECT namespace, version, checksum, applied_at FROM schema_migrations ORDER BY namespace, version")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	result := map[string]string{}
	for rows.Next() {
		var namespace, checksumValue string
		var version, stamp int64
		if err := rows.Scan(&namespace, &version, &checksumValue, &stamp); err != nil {
			t.Fatal(err)
		}
		result[fmt.Sprintf("%s@%d", namespace, version)] = fmt.Sprintf("%s@%d", checksumValue, stamp)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return result
}

func tableExists(t *testing.T, db *sql.DB, name string) bool {
	t.Helper()
	var count int
	if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", name).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count == 1
}

func TestApplyCreatesBaselineAndIsIdempotent(t *testing.T) {
	ctx := context.Background()
	db := openSQLite(t)
	if err := Apply(ctx, db, testOptions("web-platform")); err != nil {
		t.Fatal(err)
	}
	rows := ledgerRows(t, db)
	if len(rows) != 10 {
		t.Fatalf("want 10 ledger rows, got %v", rows)
	}
	for _, expected := range []struct {
		namespace string
		version   int
	}{
		{"core", 1}, {"module.notes", 1}, {"platform", 1}, {"platform", 2}, {"platform", 3}, {"platform", 4}, {"platform", 5}, {"platform", 6}, {"platform", 7}, {"platform", 8},
	} {
		entry, ok := rows[fmt.Sprintf("%s@%d", expected.namespace, expected.version)]
		if !ok {
			t.Fatalf("missing %s@%d in %v", expected.namespace, expected.version, rows)
		}
		file, ok := lookupFile(catalogdata.Catalog, expected.namespace, expected.version, "sqlite")
		if !ok || entry != file.Checksum+"@"+fmt.Sprint(fixedStamp) {
			t.Fatalf("bad ledger entry for %s@%d: %q (want %s@%d)", expected.namespace, expected.version, entry, file.Checksum, fixedStamp)
		}
	}
	for _, table := range []string{"unicore_install_state", "unicore_system_settings", "unicore_audit_logs", "unicore_users", "unicore_example_notes", "unicore_announcement_recipients", "unicore_personal_accounts", "unicore_dict_types", "unicore_menus", "unicore_account_avatars", "unicore_inbox_messages", "unicore_scheduled_jobs", "unicore_administrator_roles", "unicore_departments", "unicore_role_departments", "unicore_posts", "unicore_user_posts"} {
		if !tableExists(t, db, table) {
			t.Fatalf("table %s missing after baseline", table)
		}
	}
	if err := Verify(ctx, db, testOptions("web-platform")); err != nil {
		t.Fatalf("verify after apply: %v", err)
	}
	// A second run changes nothing: idempotent, checksums still verified.
	if err := Apply(ctx, db, testOptions("web-platform")); err != nil {
		t.Fatal(err)
	}
	if again := ledgerRows(t, db); fmt.Sprint(again) != fmt.Sprint(rows) {
		t.Fatalf("re-apply mutated the ledger: %v -> %v", rows, again)
	}
}

func TestApplyRespectsProfileScope(t *testing.T) {
	ctx := context.Background()
	db := openSQLite(t)
	if err := Apply(ctx, db, testOptions("desktop")); err != nil {
		t.Fatal(err)
	}
	rows := ledgerRows(t, db)
	if len(rows) != 2 {
		t.Fatalf("desktop applies core and module.notes only, got %v", rows)
	}
	if _, ok := rows["platform@1"]; ok {
		t.Fatal("desktop must not apply the platform namespace")
	}
	if !tableExists(t, db, "unicore_example_notes") || tableExists(t, db, "unicore_users") {
		t.Fatal("desktop table scope wrong")
	}
}

func TestVerifyRefusesEmptyDatabase(t *testing.T) {
	err := Verify(context.Background(), openSQLite(t), testOptions("web-platform"))
	if !errors.Is(err, ErrLedgerShape) {
		t.Fatalf("want ErrLedgerShape, got %v", err)
	}
}

func TestVerifyDetectsTamperedChecksum(t *testing.T) {
	ctx := context.Background()
	db := openSQLite(t)
	if err := Apply(ctx, db, testOptions("web-platform")); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("UPDATE schema_migrations SET checksum='deadbeef' WHERE namespace='core' AND version=1"); err != nil {
		t.Fatal(err)
	}
	err := Verify(ctx, db, testOptions("web-platform"))
	if !errors.Is(err, ErrChecksumMismatch) {
		t.Fatalf("want ErrChecksumMismatch, got %v", err)
	}
	if err = Apply(ctx, db, testOptions("web-platform")); !errors.Is(err, ErrChecksumMismatch) {
		t.Fatalf("apply must refuse tampered ledgers, got %v", err)
	}
}

func TestVerifyDetectsUnknownAppliedRow(t *testing.T) {
	ctx := context.Background()
	db := openSQLite(t)
	if err := Apply(ctx, db, testOptions("web-platform")); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO schema_migrations(namespace, version, checksum, applied_at) VALUES('mystery', 9, 'ff', 1)"); err != nil {
		t.Fatal(err)
	}
	err := Verify(ctx, db, testOptions("web-platform"))
	if !errors.Is(err, ErrUnknownApplied) {
		t.Fatalf("want ErrUnknownApplied, got %v", err)
	}
}

func TestApplyRefusesLegacyLedger(t *testing.T) {
	ctx := context.Background()
	db := openSQLite(t)
	if _, err := db.Exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum VARCHAR(64) NOT NULL)"); err != nil {
		t.Fatal(err)
	}
	err := Apply(ctx, db, testOptions("web-platform"))
	if !errors.Is(err, ErrLegacyLedger) {
		t.Fatalf("want ErrLegacyLedger, got %v", err)
	}
}

func TestApplyRefusesMissingAnchor(t *testing.T) {
	ctx := context.Background()
	db := openSQLite(t)
	file, _ := lookupFile(catalogdata.Catalog, "platform", 1, "sqlite")
	if _, err := db.Exec(catalogdata.Catalog.Ledger.Ddl["sqlite"]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO schema_migrations(namespace, version, checksum, applied_at) VALUES('platform', 1, ?, 1)", file.Checksum); err != nil {
		t.Fatal(err)
	}
	err := Apply(ctx, db, testOptions("web-platform"))
	if !errors.Is(err, ErrAnchorMismatch) {
		t.Fatalf("want ErrAnchorMismatch, got %v", err)
	}
}

func TestPlanRejectsUnknownProfileAndDialect(t *testing.T) {
	ctx := context.Background()
	db := openSQLite(t)
	if err := Apply(ctx, db, Options{Dialect: "sqlite", Profile: "unknown"}); err == nil {
		t.Fatal("unknown profile must fail")
	}
	if err := Apply(ctx, db, Options{Dialect: "oracle", Profile: "web-platform"}); err == nil {
		t.Fatal("unsupported dialect must fail")
	}
}

func TestNoTxConventionRunsOutsideTransaction(t *testing.T) {
	ctx := context.Background()
	db := openSQLite(t)
	body := []byte("CREATE TABLE plain_a (id INTEGER);\nCREATE TABLE plain_b (id INTEGER);\n")
	descriptor := catalogdata.Descriptor{
		SchemaGeneration: "test-1",
		Ledger: catalogdata.Ledger{
			Table: "schema_migrations",
			Columns: []catalogdata.LedgerColumn{
				{Name: "namespace"}, {Name: "version"}, {Name: "checksum"}, {Name: "applied_at"},
			},
			Ddl: map[string]string{"sqlite": catalogdata.Catalog.Ledger.Ddl["sqlite"]},
		},
		GenerationAnchor: catalogdata.GenerationAnchor{Namespace: "t", Version: 1, Checksums: map[string]string{"sqlite": checksum(body)}},
		Namespaces: []catalogdata.Namespace{{
			Id: "t",
			Migrations: []catalogdata.Migration{{Version: 1, Files: map[string]catalogdata.SQLFile{
				"sqlite": {Path: "t/sqlite/0001_sync.notx.sql", Checksum: checksum(body)},
			}}},
		}},
		Profiles: map[string]catalogdata.Profile{"test": {Dialects: []string{"sqlite"}, Namespaces: []string{"t"}, Order: []string{"t"}}},
	}
	opts := Options{Dialect: "sqlite", Profile: "test", Now: func() time.Time { return time.Unix(fixedStamp, 0) }, Source: func(path string) ([]byte, error) {
		if path != "t/sqlite/0001_sync.notx.sql" {
			return nil, os.ErrNotExist
		}
		return body, nil
	}}
	if err := ApplyDescriptor(ctx, db, descriptor, opts); err != nil {
		t.Fatal(err)
	}
	if !tableExists(t, db, "plain_a") || !tableExists(t, db, "plain_b") {
		t.Fatal("noTx migration did not run")
	}
	if rows := ledgerRows(t, db); len(rows) != 1 {
		t.Fatalf("want one ledger row, got %v", rows)
	}
}

func TestApplyUpgradesAppendedVersion(t *testing.T) {
	ctx := context.Background()
	db := openSQLite(t)
	v1 := []byte("CREATE TABLE widget (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\nINSERT INTO widget (id, name) VALUES (1, 'kept');\n")
	v2 := []byte("ALTER TABLE widget ADD COLUMN note TEXT NOT NULL DEFAULT '';\nCREATE TABLE widget_log (id INTEGER PRIMARY KEY, widget_id INTEGER NOT NULL);\n")
	build := func(withSecond bool) catalogdata.Descriptor {
		migrations := []catalogdata.Migration{{Version: 1, Files: map[string]catalogdata.SQLFile{
			"sqlite": {Path: "t/sqlite/0001_initial.sql", Checksum: checksum(v1)},
		}}}
		if withSecond {
			migrations = append(migrations, catalogdata.Migration{Version: 2, Files: map[string]catalogdata.SQLFile{
				"sqlite": {Path: "t/sqlite/0002_log.sql", Checksum: checksum(v2)},
			}})
		}
		return catalogdata.Descriptor{
			SchemaGeneration: "test-1",
			Ledger: catalogdata.Ledger{
				Table: "schema_migrations",
				Columns: []catalogdata.LedgerColumn{
					{Name: "namespace"}, {Name: "version"}, {Name: "checksum"}, {Name: "applied_at"},
				},
				Ddl: map[string]string{"sqlite": catalogdata.Catalog.Ledger.Ddl["sqlite"]},
			},
			GenerationAnchor: catalogdata.GenerationAnchor{Namespace: "t", Version: 1, Checksums: map[string]string{"sqlite": checksum(v1)}},
			Namespaces:       []catalogdata.Namespace{{Id: "t", Migrations: migrations}},
			Profiles:         map[string]catalogdata.Profile{"test": {Dialects: []string{"sqlite"}, Namespaces: []string{"t"}, Order: []string{"t"}}},
		}
	}
	opts := Options{Dialect: "sqlite", Profile: "test", Now: func() time.Time { return time.Unix(fixedStamp, 0) }, Source: func(path string) ([]byte, error) {
		switch path {
		case "t/sqlite/0001_initial.sql":
			return v1, nil
		case "t/sqlite/0002_log.sql":
			return v2, nil
		}
		return nil, os.ErrNotExist
	}}
	if err := ApplyDescriptor(ctx, db, build(false), opts); err != nil {
		t.Fatal(err)
	}
	var name string
	if err := db.QueryRow("SELECT name FROM widget WHERE id=1").Scan(&name); err != nil || name != "kept" {
		t.Fatalf("seed row missing before upgrade: %q %v", name, err)
	}
	// The appended version upgrades in place and preserves rows.
	if err := ApplyDescriptor(ctx, db, build(true), opts); err != nil {
		t.Fatal(err)
	}
	var note string
	if err := db.QueryRow("SELECT note FROM widget WHERE id=1").Scan(&note); err != nil || note != "" {
		t.Fatalf("upgraded column missing: %q %v", note, err)
	}
	if !tableExists(t, db, "widget_log") {
		t.Fatal("appended table missing")
	}
	if rows := ledgerRows(t, db); len(rows) != 2 {
		t.Fatalf("want two ledger rows after upgrade, got %v", rows)
	}
	if err := VerifyDescriptor(ctx, db, build(true), opts); err != nil {
		t.Fatalf("verify after upgrade: %v", err)
	}
	// Re-applying the upgraded catalog changes nothing.
	if err := ApplyDescriptor(ctx, db, build(true), opts); err != nil {
		t.Fatal(err)
	}
	if rows := ledgerRows(t, db); len(rows) != 2 {
		t.Fatalf("re-apply mutated the ledger: %v", rows)
	}
}
