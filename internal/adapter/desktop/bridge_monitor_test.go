//go:build desktop

// Author: yunnuo <ymz@ebox.vip>
// Description: Bridge runtime verification: a real local SQLite assembly answers MonitorSnapshot through the same method the Wails IPC exposes.
package desktop

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
	"github.com/yunnuo/unicore/internal/monitor"
)

func TestBridgeMonitorSnapshotRuntime(t *testing.T) {
	ctx := context.Background()
	directory := filepath.Join(t.TempDir(), "data")
	store, service, err := local.Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	// Unwired bridge degrades instead of inventing data.
	unwired := NewLocal(bootstrap.Core(), service, store)
	if response := unwired.MonitorSnapshot(); response.Code != "NOT_AVAILABLE" {
		t.Fatalf("unwired bridge must report NOT_AVAILABLE, got %s", response.Code)
	}
	// The desktop composition root wires the monitor the same way; the snapshot
	// then carries real SQLite health, stdlib runtime views and no HTTP metrics.
	wired := NewLocal(bootstrap.Core(), service, store)
	wired.SetMonitor(monitor.New(monitor.Options{
		Profile:   "desktop",
		StartedAt: time.Now().Add(-5 * time.Second),
		DB:        func() *sql.DB { return store.DB },
		Runtime:   monitor.StdlibRuntime,
		Host:      monitor.DefaultHost(func() string { return directory }),
	}))
	response := wired.MonitorSnapshot()
	if response.Code != "OK" {
		t.Fatalf("wired bridge failed: %s %s", response.Code, response.Message)
	}
	data := response.Data
	if data.Profile != "desktop" || data.Status != "healthy" || data.Database.Status != "healthy" {
		t.Fatalf("desktop snapshot unhealthy: %+v", data)
	}
	if data.UptimeSeconds < 4 {
		t.Fatalf("uptime should reflect the composition start: %d", data.UptimeSeconds)
	}
	if data.HttpService.Applicable {
		t.Fatal("desktop must not fabricate HTTP service metrics")
	}
	if data.Runtime.Goroutines <= 0 {
		t.Fatalf("stdlib runtime view missing: %+v", data.Runtime)
	}
	if data.Storage.Applicable || data.Tasks.Applicable {
		t.Fatalf("desktop has no storage/task services: %+v %+v", data.Storage, data.Tasks)
	}
	// Host hardware sampling is wired on desktop too (same carrier semantics).
	if !data.Host.Available || data.Host.CpuCoresLogical == nil || *data.Host.CpuCoresLogical <= 0 {
		t.Fatalf("desktop host view must be available: %+v", data.Host)
	}
	if data.Host.Disks == nil || len(*data.Host.Disks) == 0 {
		t.Fatal("desktop host view must carry disk rows")
	}
}
