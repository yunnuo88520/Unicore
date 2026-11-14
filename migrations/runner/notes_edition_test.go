// Author: yunnuo <ymz@ebox.vip>
// Description: Fresh-edition plans and an enabled/disabled/enabled SQLite process cycle preserve data and ledger checks.
package runner

import (
	"context"
	"database/sql"
	"errors"
	"github.com/yunnuo/unicore/internal/edition"
	"github.com/yunnuo/unicore/migrations/catalogdata"
	"os"
	"path/filepath"
	"testing"
)

func TestNotesEditionMigration(t *testing.T) {
	for _, profile := range []string{"web-platform", "web-standalone", "desktop"} {
		t.Run(profile, func(t *testing.T) {
			db := openSQLite(t)
			opts := testOptions(profile)
			if err := Apply(context.Background(), db, opts); err != nil {
				t.Fatal(err)
			}
			if tableExists(t, db, "unicore_example_notes") != edition.Notes {
				t.Fatal("wrong notes table presence")
			}
			if !tableExists(t, db, "unicore_system_settings") {
				t.Fatal("core settings were trimmed")
			}
			if tableExists(t, db, "unicore_users") != (profile == "web-platform") {
				t.Fatal("platform assembly changed")
			}
			if err := Verify(context.Background(), db, opts); err != nil {
				t.Fatal(err)
			}
		})
	}
	// Assert planning on all declared dialects, without pretending this executes external databases.
	for profile, config := range catalogdata.Catalog.Profiles {
		for _, dialect := range config.Dialects {
			schema, err := plan(catalogdata.Catalog, Options{Profile: profile, Dialect: dialect})
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, migration := range schema.order {
				if migration.namespace == "module.notes" {
					found = true
				}
			}
			if found != edition.Notes {
				t.Fatalf("%s/%s: notes=%v", profile, dialect, found)
			}
		}
	}
}

func TestNotesEditionMigrationCycle(t *testing.T) {
	directory := os.Getenv("UNICORE_NOTES_TEST_DIR")
	if directory == "" {
		t.Skip("run pnpm test:notes for the cross-build persistence cycle")
	}
	for _, profile := range []string{"web-platform", "web-standalone", "desktop"} {
		t.Run(profile, func(t *testing.T) {
			db, err := sql.Open("sqlite", filepath.Join(directory, profile+".db"))
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			opts := testOptions(profile)
			ctx := context.Background()
			if err = Apply(ctx, db, opts); err != nil {
				t.Fatal(err)
			}
			if os.Getenv("UNICORE_NOTES_TEST_STAGE") == "fresh" {
				if tableExists(t, db, "unicore_example_notes") {
					t.Fatal("omitted fresh database created notes")
				}
				return
			}
			if edition.Notes && os.Getenv("UNICORE_NOTES_TEST_STAGE") == "seed" {
				_, err = db.Exec("INSERT INTO unicore_example_notes(scope_key,id,title,body,status,attachment_ids,version,created_at,updated_at) VALUES('local','retained','retained title','retained body','open','[]',1,1,1)")
				if err != nil {
					t.Fatal(err)
				}
			}
			before := ledgerRows(t, db)
			if err = Apply(ctx, db, opts); err != nil {
				t.Fatal(err)
			}
			var title string
			if err = db.QueryRow("SELECT title FROM unicore_example_notes WHERE id='retained'").Scan(&title); err != nil || title != "retained title" {
				t.Fatal(title, err)
			}
			if after := ledgerRows(t, db); after["module.notes@1"] != before["module.notes@1"] || after["module.notes@1"] == "" {
				t.Fatal("notes ledger changed")
			}
			if err = Verify(ctx, db, opts); err != nil {
				t.Fatal(err)
			}
			// Even disabled editions reject tampered history before executing migrations.
			checksum := catalogdata.Catalog.Namespaces[0].Migrations[0].Files["sqlite"].Checksum
			for _, ns := range catalogdata.Catalog.Namespaces {
				if ns.Id == "module.notes" {
					checksum = ns.Migrations[0].Files["sqlite"].Checksum
				}
			}
			if _, err = db.Exec("UPDATE schema_migrations SET checksum='tampered' WHERE namespace='module.notes'"); err != nil {
				t.Fatal(err)
			}
			if err = Apply(ctx, db, opts); !errors.Is(err, ErrChecksumMismatch) {
				t.Fatalf("tampered omitted namespace: %v", err)
			}
			if _, err = db.Exec("UPDATE schema_migrations SET checksum=? WHERE namespace='module.notes'", checksum); err != nil {
				t.Fatal(err)
			}
		})
	}
}
