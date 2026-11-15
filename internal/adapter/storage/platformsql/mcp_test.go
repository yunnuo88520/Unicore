// Author: yunnuo <ymz@ebox.vip>
// Description: MCP governance storage tests: CAS control anchor, policy lifecycle and content-free call records.
package platformsql

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/migrations/runner"
)

func newMCPTestRepository(t *testing.T) (*Repository, context.Context) {
	t.Helper()
	ctx := context.Background()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "mcp.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: "sqlite", Profile: "web-platform"}); err != nil {
		t.Fatal(err)
	}
	return &Repository{Store: store}, ctx
}

func TestMCPControlRevisionCAS(t *testing.T) {
	r, ctx := newMCPTestRepository(t)
	revision, err := r.MCPControlRevision(ctx)
	if err != nil || revision != 0 {
		t.Fatalf("initial revision = %d, %v; want 0", revision, err)
	}
	next, err := r.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.enabled": "true"}, "admin1")
	if err != nil {
		t.Fatalf("config update failed: %v", err)
	}
	if next != revision+1 {
		t.Fatalf("revision advanced to %d, want %d", next, revision+1)
	}
	// A stale expected revision loses the race instead of overwriting.
	if _, err = r.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.enabled": "false"}, "admin2"); err != ErrMCPConflict {
		t.Fatalf("stale revision error = %v, want ErrMCPConflict", err)
	}
	live, err := r.MCPControlRevision(ctx)
	if err != nil || live != next {
		t.Fatalf("live revision = %d, %v; want %d", live, err, next)
	}
}

func TestMCPPolicyLifecycle(t *testing.T) {
	r, ctx := newMCPTestRepository(t)
	// An unregistered capability reads as the zero policy.
	policy, err := r.MCPPolicy(ctx, mcp.KindTool, "notes.search")
	if err != nil || policy.Enabled || policy.Version != 0 {
		t.Fatalf("missing policy = %+v, %v; want zero value", policy, err)
	}
	// First acceptance registers the row at version 1.
	next, err := r.UpdateMCPPolicy(ctx, mcp.Policy{Kind: mcp.KindTool, Name: "notes.search", Enabled: true, AcceptedFingerprint: "fp1", AcceptedVersion: "1.0"}, "fp1", "admin1")
	if err != nil {
		t.Fatalf("policy registration failed: %v", err)
	}
	if next.Version != 1 || !next.Enabled {
		t.Fatalf("registered policy = %+v, want enabled version 1", next)
	}
	// A wrong fingerprint cannot ride an unrelated update.
	if _, err = r.UpdateMCPPolicy(ctx, mcp.Policy{Kind: mcp.KindTool, Name: "notes.search", Enabled: true, AcceptedFingerprint: "fp2", AcceptedVersion: "2.0"}, "fp2", "admin1"); err != ErrMCPConflict {
		t.Fatalf("fingerprint mismatch error = %v, want ErrMCPConflict", err)
	}
	// A stale version loses the CAS race.
	if _, err = r.UpdateMCPPolicy(ctx, mcp.Policy{Kind: mcp.KindTool, Name: "notes.search", Enabled: false, AcceptedFingerprint: "fp1", AcceptedVersion: "1.0", Version: 0}, "fp1", "admin1"); err != ErrMCPConflict {
		t.Fatalf("stale version error = %v, want ErrMCPConflict", err)
	}
	// Disabling with the current version succeeds.
	updated, err := r.UpdateMCPPolicy(ctx, mcp.Policy{Kind: mcp.KindTool, Name: "notes.search", Enabled: false, AcceptedFingerprint: "fp1", AcceptedVersion: "1.0", Version: next.Version}, "fp1", "admin2")
	if err != nil {
		t.Fatalf("policy disable failed: %v", err)
	}
	if updated.Version != 2 || updated.Enabled {
		t.Fatalf("updated policy = %+v, want disabled version 2", updated)
	}
	list, err := r.MCPPolicies(ctx)
	if err != nil || len(list) != 1 || list[0].Name != "notes.search" {
		t.Fatalf("policy list = %+v, %v; want exactly notes.search", list, err)
	}
}

func TestMCPCallRecordsAndSweep(t *testing.T) {
	r, ctx := newMCPTestRepository(t)
	now := time.Now().Unix()
	start := mcp.CallStart{RequestID: "req1", ActorID: "u1", CredentialID: "c1", RoleID: "member", AuthMethod: "pat", Kind: mcp.KindTool, Name: "notes.search", CapabilityVersion: "1.0", PolicyRevision: 3, ProtocolVersion: "2026-07-28", ClientName: "client", ClientVersion: "1", StartedAt: now}
	if err := r.BeginMCPCall(ctx, start); err != nil {
		t.Fatalf("begin failed: %v", err)
	}
	// Duplicate request ids are rejected by the unique index.
	if err := r.BeginMCPCall(ctx, start); err == nil {
		t.Fatal("duplicate request id unexpectedly accepted")
	}
	if err := r.FinishMCPCall(ctx, "req1", mcp.CallFinish{Status: "succeeded", ErrorCode: "", DurationMs: 12, FinishedAt: now + 1}); err != nil {
		t.Fatalf("finish failed: %v", err)
	}
	records, total, err := r.ListMCPCalls(ctx, MCPCallFilter{ActorID: "u1"})
	if err != nil || total != 1 || len(records) != 1 {
		t.Fatalf("list = %d records, %v; want exactly one", total, err)
	}
	if records[0].Start.Name != "notes.search" || records[0].Finish.Status != "succeeded" || records[0].Finish.DurationMs != 12 {
		t.Fatalf("record round-trip mismatch: %+v", records[0])
	}
	if records[0].ActorName == "" {
		t.Fatalf("actor name projection empty: %+v", records[0])
	}
	if _, total, err = r.ListMCPCalls(ctx, MCPCallFilter{ActorID: "other"}); err != nil || total != 0 {
		t.Fatalf("foreign actor filter returned %d records, %v", total, err)
	}
	single, err := r.GetMCPCall(ctx, "req1")
	if err != nil || single.Start.RequestID != "req1" {
		t.Fatalf("get by request id failed: %+v, %v", single, err)
	}
	// A finished record past the retention window is swept; unfinished ones survive.
	if _, err = r.SweepMCPCalls(ctx, 30, now+40*86400); err != nil {
		t.Fatalf("sweep failed: %v", err)
	}
	if _, total, _ = r.ListMCPCalls(ctx, MCPCallFilter{}); total != 0 {
		t.Fatalf("finished record survived the retention sweep: %d", total)
	}
	if err = r.BeginMCPCall(ctx, mcp.CallStart{RequestID: "req2", ActorID: "u1", Kind: mcp.KindTool, Name: "notes.search", StartedAt: now}); err != nil {
		t.Fatalf("second begin failed: %v", err)
	}
	if _, err = r.SweepMCPCalls(ctx, 30, now+40*86400); err != nil {
		t.Fatalf("second sweep failed: %v", err)
	}
	if _, total, _ = r.ListMCPCalls(ctx, MCPCallFilter{}); total != 1 {
		t.Fatalf("unfinished record was swept: %d", total)
	}
}
