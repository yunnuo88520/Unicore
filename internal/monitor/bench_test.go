// Author: yunnuo <ymz@ebox.vip>
// Description: Snapshot performance baseline: full aggregation vs host sampling vs database view, for the alert-engine budget.
package monitor

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/bootstrap/local"
)

type benchPingConnector struct{}

func (benchPingConnector) Connect(context.Context) (driver.Conn, error) { return benchPingConn{}, nil }
func (benchPingConnector) Driver() driver.Driver                        { return benchPingDrv{} }

type benchPingDrv struct{}

func (benchPingDrv) Open(string) (driver.Conn, error) { return benchPingConn{}, nil }

type benchPingConn struct{}

func (benchPingConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unsupported") }
func (benchPingConn) Close() error                        { return nil }
func (benchPingConn) Begin() (driver.Tx, error)           { return nil, errors.New("unsupported") }
func (benchPingConn) Ping(context.Context) error          { return nil }

// BenchmarkSnapshotLocal measures one full pull against a real local SQLite
// store (database view + host sampling + all service views).
func BenchmarkSnapshotLocal(b *testing.B) {
	ctx := context.Background()
	store, _, err := local.Open(ctx, filepath.Join(b.TempDir(), "data"))
	if err != nil {
		b.Fatal(err)
	}
	defer store.Close()
	service := New(Options{
		Profile:   "web-standalone",
		StartedAt: time.Now(),
		DB:        func() *sql.DB { return store.DB },
		Runtime:   StdlibRuntime,
		Host:      DefaultHost(func() string { return b.TempDir() }),
	})
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = service.Snapshot(ctx)
	}
}

// BenchmarkHostSampling isolates the gopsutil host view cost.
func BenchmarkHostSampling(b *testing.B) {
	source := DefaultHost(func() string { return b.TempDir() })
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = source(ctx)
	}
}

// BenchmarkDatabaseView isolates the bounded ping + stats cost.
func BenchmarkDatabaseView(b *testing.B) {
	service := New(Options{
		Profile:   "web-standalone",
		StartedAt: time.Now(),
		DB:        func() *sql.DB { return sql.OpenDB(benchPingConnector{}) },
	})
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = service.databaseView(ctx)
	}
}
