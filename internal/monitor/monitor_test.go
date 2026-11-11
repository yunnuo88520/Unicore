// Author: yunnuo <ymz@ebox.vip>
// Description: Snapshot aggregation: status derivation, not-applicable views and task health mapping.
package monitor

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
)

// stubConnector answers pings only, enough for the database view without a
// real storage engine in this unit test.
type stubConnector struct{}

func (stubConnector) Connect(context.Context) (driver.Conn, error) { return stubConn{}, nil }
func (stubConnector) Driver() driver.Driver                        { return stubDriver{} }

type stubDriver struct{}

func (stubDriver) Open(string) (driver.Conn, error) { return stubConn{}, nil }

type stubConn struct{}

func (stubConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unsupported") }
func (stubConn) Close() error                        { return nil }
func (stubConn) Begin() (driver.Tx, error)           { return nil, errors.New("unsupported") }
func (stubConn) Ping(context.Context) error          { return nil }

func TestSnapshotAggregation(t *testing.T) {
	locationActive := true
	storage := []contracts.StorageLocation{{ID: "local", Provider: "local", Active: locationActive}}
	failing := "error"
	tasks := &contracts.TaskList{Items: []contracts.TaskEntry{
		{Name: "mail.queue", Enabled: true, LastStatus: "ok", LastRunAt: 100, NextRunAt: 200},
		{Name: "files.cleanup", Enabled: true, LastStatus: failing, LastError: "unavailable", LastRunAt: 300},
	}}
	service := New(Options{
		Profile:   "web-platform",
		StartedAt: time.Now().Add(-90 * time.Second),
		DB:        func() *sql.DB { return sql.OpenDB(stubConnector{}) },
		HTTP: func() HTTPStats {
			return HTTPStats{ActiveRequests: 2, RequestsTotal: 10, ErrorsTotal: 1, AvgDurationMs: 12, P95DurationMs: 40}
		},
		Storage: func(context.Context) ([]contracts.StorageLocation, error) { return storage, nil },
		Tasks:   func(context.Context) (*contracts.TaskList, error) { return tasks, nil },
	})
	snapshot := service.Snapshot(context.Background())
	if snapshot.Status != "degraded" {
		t.Fatalf("want degraded with a failing task, got %s", snapshot.Status)
	}
	if snapshot.UptimeSeconds < 89 {
		t.Fatalf("uptime should reflect startedAt, got %d", snapshot.UptimeSeconds)
	}
	if snapshot.Database.Status != "healthy" {
		t.Fatalf("pinged database must be healthy, got %s", snapshot.Database.Status)
	}
	if !snapshot.HttpService.Applicable || derefInt(snapshot.HttpService.RequestsTotal) != 10 || derefInt(snapshot.HttpService.ErrorsTotal) != 1 {
		t.Fatalf("http view mismatch: %+v", snapshot.HttpService)
	}
	if !snapshot.Storage.Applicable || deref(snapshot.Storage.ActiveLocation) != "local" {
		t.Fatalf("storage view mismatch: %+v", snapshot.Storage)
	}
	if !snapshot.Tasks.Applicable || derefInt(snapshot.Tasks.Failing) != 1 || len(*snapshot.Tasks.Recent) != 2 {
		t.Fatalf("tasks view mismatch: %+v", snapshot.Tasks)
	}
}

func TestSnapshotNotApplicableViews(t *testing.T) {
	service := New(Options{Profile: "desktop", StartedAt: time.Now()})
	snapshot := service.Snapshot(context.Background())
	if snapshot.Status != "unavailable" {
		t.Fatalf("desktop without a db source is unavailable, got %s", snapshot.Status)
	}
	if snapshot.HttpService.Applicable || snapshot.Storage.Applicable || snapshot.Tasks.Applicable {
		t.Fatalf("nil sources must stay not-applicable: %+v", snapshot)
	}
	if snapshot.Profile != "desktop" || snapshot.Version == "" || snapshot.GoVersion == "" {
		t.Fatalf("build facts must always be present: %+v", snapshot)
	}
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func TestStdlibRuntimeView(t *testing.T) {
	stats := StdlibRuntime()
	if stats.Goroutines <= 0 || stats.HeapAlloc <= 0 || stats.HeapSys <= 0 {
		t.Fatalf("stdlib runtime view must carry live values: %+v", stats)
	}
	if stats.RssBytes != 0 || stats.CpuTimeMs != 0 {
		t.Fatalf("stdlib view must leave process metrics not-applicable: %+v", stats)
	}
}

// TestDefaultHostSampling proves the host source answers real kernel values
// (identity, memory, cores, the data-directory volume) instead of zeros.
func TestDefaultHostSampling(t *testing.T) {
	ctx := context.Background()
	source := DefaultHost(func() string { return t.TempDir() })
	stats := source(ctx)
	if stats.SampledAt == 0 {
		t.Fatal("sampled_at must record the sampling moment")
	}
	if stats.Hostname == "" || stats.Os == "" || stats.KernelArch == "" {
		t.Fatalf("host identity must be sampled from the kernel: %+v", stats)
	}
	if stats.HostUptimeSeconds <= 0 {
		t.Fatalf("host uptime must be positive: %+v", stats)
	}
	if stats.CpuCoresLogical <= 0 || stats.MemTotalBytes <= 0 {
		t.Fatalf("cpu and memory must be sampled: %+v", stats)
	}
	if stats.CpuPercent < 0 || stats.CpuPercent > 100 || len(stats.CpuPerCore) != stats.CpuCoresLogical {
		t.Fatalf("cpu percentages must stay bounded and per-core: %+v", stats)
	}
	if len(stats.Disks) == 0 || !stats.Disks[0].IsDataDir || stats.Disks[0].TotalBytes <= 0 {
		t.Fatalf("data-directory disk row must be present: %+v", stats.Disks)
	}
	if stats.MemUsedPercent < 0 || stats.MemUsedPercent > 100 {
		t.Fatalf("memory percent must stay bounded: %+v", stats)
	}
}

// TestHostViewAvailability keeps the contract truthful when no host source is
// wired (a hypothetical minimal assembly) and maps sampled disks in order.
func TestHostViewAvailability(t *testing.T) {
	nilSource := New(Options{Profile: "web-platform", StartedAt: time.Now()})
	if view := nilSource.hostView(context.Background()); view.Available {
		t.Fatal("nil host source must stay unavailable")
	}
	directory := t.TempDir()
	source := DefaultHost(func() string { return directory })
	service := New(Options{Profile: "web-standalone", StartedAt: time.Now(), Host: source})
	snapshot := service.Snapshot(context.Background())
	host := snapshot.Host
	if !host.Available || host.Hostname == nil || *host.Hostname == "" {
		t.Fatalf("wired host view must be available: %+v", host)
	}
	if host.Disks == nil || len(*host.Disks) == 0 || !derefBool((*host.Disks)[0].IsDataDir) {
		t.Fatalf("host view must carry the data-directory disk row: %+v", host.Disks)
	}
	if host.Load1 == nil {
		t.Fatalf("load averages are expected on developer platforms: %+v", host)
	}
}

func derefBool(value *bool) bool { return value != nil && *value }
