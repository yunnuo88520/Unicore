// Author: yunnuo <ymz@ebox.vip>
// Description: Real fixed-prefix migration, data preservation, collision rejection and post-DDL recovery.
package sqlstore_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/migrations"
)

func TestFixedFrameworkPrefix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "postgres", "mysql"} {
		for _, profile := range []string{"core", "platform"} {
			t.Run(dialect+"/"+profile, func(t *testing.T) {
				dsn := ""
				if dialect != "sqlite" {
					dsn = os.Getenv("UNICORE_PREFIX_TEST_" + strings.ToUpper(dialect) + "_" + strings.ToUpper(profile) + "_DSN")
					if dsn == "" {
						t.Skip("dedicated prefix migration database not configured")
					}
				}
				ctx := context.Background()
				store, err := webdb.Open(ctx, dialect, dsn, filepath.Join(t.TempDir(), "prefix.db"))
				if err != nil {
					t.Fatal(err)
				}
				defer store.Close()
				if count, err := store.TableCount(ctx); err != nil || count != 0 {
					t.Fatal("requires an empty dedicated database", count, err)
				}
				platform := profile == "platform"
				if err = store.Migrate(ctx, platform); err != nil {
					t.Fatal(err)
				}
				exec := func(query string) {
					t.Helper()
					if _, err := store.DB.ExecContext(ctx, query); err != nil {
						t.Fatal(query, err)
					}
				}
				exec("INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,'web-standalone','preserved-instance',1)")
				exec("INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES('site.name','Preserved site')")
				exec("CREATE TABLE licenhub_orders(id INTEGER PRIMARY KEY)")
				exec("INSERT INTO licenhub_orders(id) VALUES(37)")
				// Build the authentic pre-prefix layout without changing historical SQL
				// bytes/checksums. This round trip must preserve data and foreign keys.
				body, err := migrations.Files.ReadFile(dialect + "/0013_prefix_" + profile + ".sql")
				if err != nil {
					t.Fatal(err)
				}
				for _, line := range strings.Split(string(body), "\n") {
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "--") || line == "" {
						continue
					}
					var old string
					if dialect == "mysql" {
						line = strings.TrimPrefix(line, "RENAME TABLE ")
						old = strings.Fields(line)[0]
					} else {
						old = strings.Fields(line)[2]
					}
					exec("ALTER TABLE unicore_" + old + " RENAME TO " + old)
				}
				exec("DELETE FROM schema_migrations WHERE version=13")
				if err = store.Migrate(ctx, platform); err != nil {
					t.Fatal("legacy prefix upgrade", err)
				}
				for range 2 {
					if err = store.Migrate(ctx, platform); err != nil {
						t.Fatal("repeated migration", err)
					}
				}
				_, instance, err := store.Installation(ctx)
				if err != nil || instance != "preserved-instance" {
					t.Fatal("installation identity changed", err)
				}
				settings, err := store.ReadSettings(ctx)
				if err != nil || settings["site.name"] != "Preserved site" {
					t.Fatal("settings changed", err)
				}
				var id int
				if err := store.DB.QueryRowContext(ctx, "SELECT id FROM licenhub_orders").Scan(&id); err != nil || id != 37 {
					t.Fatal("application-owned table changed", err)
				}
				count, err := store.TableCount(ctx)
				want := 7 // Six framework tables and the independent product table.
				if platform {
					want = 31
				}
				if err != nil || count != want {
					t.Fatal("unexpected schema", count, want, err)
				}
				// A MySQL rename can commit before its ledger insertion. Repeating
				// requires the complete expected target set and preserves all rows.
				exec("DELETE FROM unicore_schema_migrations WHERE version=13")
				if err := store.Migrate(ctx, platform); err != nil {
					t.Fatal("post-DDL prefix recovery", err)
				}
				exec("UPDATE unicore_schema_migrations SET checksum='invalid' WHERE version=13")
				if err := store.Migrate(ctx, platform); err == nil {
					t.Fatal("prefix checksum mismatch ignored")
				}
			})
		}
	}
}

func TestPrefixCollisionNeverDropsExistingData(t *testing.T) {
	ctx := context.Background()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "collision.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if _, err := store.DB.ExecContext(ctx, "CREATE TABLE unicore_system_settings(id INTEGER PRIMARY KEY)"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.DB.ExecContext(ctx, "INSERT INTO unicore_system_settings(id) VALUES(71)"); err != nil {
		t.Fatal(err)
	}
	if err := store.Migrate(ctx, false); err == nil {
		t.Fatal("colliding target was overwritten")
	}
	var id int
	if err := store.DB.QueryRowContext(ctx, "SELECT id FROM unicore_system_settings").Scan(&id); err != nil || id != 71 {
		t.Fatal("colliding data changed", err)
	}
	var ledger int
	if err := store.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations WHERE version=13").Scan(&ledger); err != nil || ledger != 0 {
		t.Fatal("failed prefix migration was recorded", err)
	}
}
