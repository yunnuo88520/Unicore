// Author: yunnuo <ymz@ebox.vip>
// Description: Env-gated live-database migration verification for the three dialects; each run owns an isolated schema.
package runner

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/migrations/catalogdata"
)

func TestLiveCompoundMigration(t *testing.T) {
	for driver, env := range dialectCases() {
		dsn := os.Getenv(env)
		if dsn == "" {
			t.Logf("%s skipped: %s not set", driver, env)
			continue
		}
		t.Run(driver, func(t *testing.T) {
			ctx := context.Background()
			store, err := webdb.Open(ctx, driver, dsn, filepath.Join(t.TempDir(), "unused.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			suffix := fmt.Sprintf("%d", time.Now().UnixNano())
			table, ledger, trigger, function := "i103_e_"+suffix, "i103_l_"+suffix, "i103_t_"+suffix, "i103_f_"+suffix
			t.Cleanup(func() {
				store.DB.ExecContext(ctx, "DROP TABLE IF EXISTS "+table)
				store.DB.ExecContext(ctx, "DROP TABLE IF EXISTS "+ledger)
				if driver == "postgres" {
					store.DB.ExecContext(ctx, "DROP FUNCTION IF EXISTS "+function+"()")
				}
			})
			if _, err := store.DB.ExecContext(ctx, "CREATE TABLE "+ledger+" (namespace VARCHAR(128), version INTEGER, checksum VARCHAR(64), applied_at BIGINT)"); err != nil {
				t.Fatal(err)
			}
			var blocks []string
			blocks = append(blocks, "CREATE TABLE "+table+" (id INTEGER PRIMARY KEY)")
			if driver == "postgres" {
				blocks = append(blocks, "CREATE FUNCTION "+function+"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'immutable; event'; END; $$ LANGUAGE plpgsql", "CREATE TRIGGER "+trigger+" BEFORE UPDATE ON "+table+" FOR EACH ROW EXECUTE FUNCTION "+function+"()")
			} else {
				blocks = append(blocks, "CREATE TRIGGER "+trigger+" BEFORE UPDATE ON "+table+" FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'immutable; event'; END")
			}
			blocks = append(blocks, "INSERT INTO "+table+"(id) VALUES (1)")
			body := []byte("-- unicore:statements explicit\n" + strings.Join(blocks, "\n-- unicore:statement-break\n"))
			migration := plannedMigration{namespace: "module.events", version: 1, file: catalogdata.SQLFile{Checksum: checksum(body)}, noTx: driver == "mysql"}
			if err := runMigration(ctx, store.DB, driver, ledger, migration, body, fixedStamp); err != nil {
				t.Fatal(err)
			}
			if _, err := store.DB.ExecContext(ctx, "UPDATE "+table+" SET id=2"); err == nil {
				t.Fatal("trigger did not reject update")
			}
			var count int
			if err := store.DB.QueryRowContext(ctx, "SELECT count(*) FROM "+ledger).Scan(&count); err != nil || count != 1 {
				t.Fatalf("ledger count=%d: %v", count, err)
			}
		})
	}
}

// dialectCases maps a driver to its DSN environment variable. Set the
// variable to a disposable database and the test applies the full catalog
// for web-platform, re-runs it (replay idempotency) and exercises the MCP
// governance tables. Unset variables skip silently.
func dialectCases() map[string]string {
	return map[string]string{
		"postgres": "UNICORE_TEST_POSTGRES_DSN",
		"mysql":    "UNICORE_TEST_MYSQL_DSN",
	}
}

func TestLiveDialectMigrations(t *testing.T) {
	for driver, env := range dialectCases() {
		dsn := os.Getenv(env)
		if dsn == "" {
			t.Logf("%s skipped: %s not set", driver, env)
			continue
		}
		t.Run(driver, func(t *testing.T) {
			ctx := context.Background()
			store, err := webdb.Open(ctx, driver, dsn, filepath.Join(t.TempDir(), "unused.db"))
			if err != nil {
				t.Fatalf("open failed: %v", err)
			}
			defer store.Close()
			if err = Apply(ctx, store.DB, Options{Dialect: driver, Profile: "web-platform"}); err != nil {
				t.Fatalf("apply failed: %v", err)
			}
			// Replay must be a no-op: baseline DDL and seed rows are idempotent.
			if err = Apply(ctx, store.DB, Options{Dialect: driver, Profile: "web-platform"}); err != nil {
				t.Fatalf("replay failed: %v", err)
			}
			repository := &platformsql.Repository{Store: store}
			revision, err := repository.MCPControlRevision(ctx)
			if err != nil || revision != 0 {
				t.Fatalf("control revision = %d, %v; want 0", revision, err)
			}
			changed, err := repository.UpdateMCPConfig(ctx, 0, map[string]string{"mcp.enabled": "true"}, "verify")
			if err != nil {
				t.Fatalf("config CAS failed: %v", err)
			}
			policy, err := repository.UpdateMCPPolicy(ctx, mcp.Policy{Kind: mcp.KindTool, Name: "notes.search", Enabled: true, AcceptedFingerprint: "verify-fp", AcceptedVersion: "1.0"}, "verify-fp", "verify")
			if err != nil {
				t.Fatalf("policy CAS failed: %v", err)
			}
			if policy.Version != 1 {
				t.Fatalf("policy version = %d, want 1", policy.Version)
			}
			if _, err = repository.UpdateMCPConfig(ctx, changed-1, map[string]string{"mcp.enabled": "false"}, "verify"); err == nil {
				t.Fatal("stale CAS revision unexpectedly accepted")
			}
			start := mcp.CallStart{RequestID: "verify-" + driver, ActorID: "u", Kind: mcp.KindTool, Name: "notes.search", StartedAt: 1}
			if err = repository.BeginMCPCall(ctx, start); err != nil {
				t.Fatalf("begin failed: %v", err)
			}
			if err = repository.FinishMCPCall(ctx, start.RequestID, mcp.CallFinish{Status: "succeeded", FinishedAt: 2, DurationMs: 1}); err != nil {
				t.Fatalf("finish failed: %v", err)
			}
		})
	}
}
