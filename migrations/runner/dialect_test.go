// Author: yunnuo <ymz@ebox.vip>
// Description: Env-gated live-database migration verification for the three dialects; each run owns an isolated schema.
package runner

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/mcp"
)

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
