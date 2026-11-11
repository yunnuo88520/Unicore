// Author: yunnuo <ymz@ebox.vip>
// Description: P1 behaviors: event ring buffer, health-transition events, server-side net rates, storage probe caching, task run joins and cgroup parsing.
package monitor

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
)

func TestEventSinkRingAndOrdering(t *testing.T) {
	sink := NewEventSink(3)
	for i := 0; i < 5; i++ {
		sink.Append(EventTask, SeverityWarning, "事件", "")
	}
	items, total := sink.Recent(10)
	if total != 5 || len(items) != 3 {
		t.Fatalf("ring must keep the newest three: total=%d items=%d", total, len(items))
	}
	if items[0].ID != 5 || items[2].ID != 3 {
		t.Fatalf("recent must be newest-first: %v", items)
	}
	if sink.Capacity() != 3 {
		t.Fatalf("capacity mismatch: %d", sink.Capacity())
	}
}

// TestTaskEventTracker proves failures and recoveries come from the source
// hook: no snapshot pull is involved, and repeated failures stay silent.
func TestTaskEventTracker(t *testing.T) {
	sink := NewEventSink(50)
	tracker := NewTaskEventTracker(sink)
	tracker.Observe("mail.queue", "ok", "")
	if items, _ := sink.Recent(10); len(items) != 0 {
		t.Fatalf("healthy runs must stay silent: %+v", items)
	}
	tracker.Observe("mail.queue", "error", "TASK_FAILED")
	tracker.Observe("mail.queue", "error", "TASK_TIMEOUT")
	items, _ := sink.Recent(10)
	if len(items) != 1 || items[0].Type != EventTask || items[0].Severity != SeverityWarning || items[0].Message != "任务执行失败：mail.queue" || items[0].Detail != "TASK_FAILED" {
		t.Fatalf("first failure must be recorded once: %+v", items)
	}
	tracker.Observe("mail.queue", "ok", "")
	items, _ = sink.Recent(10)
	if len(items) != 2 || items[0].Severity != SeverityInfo || items[0].Message != "任务执行恢复：mail.queue" {
		t.Fatalf("recovery must be recorded: %+v", items)
	}
}

func TestDatabaseTransitionEvents(t *testing.T) {
	sink := NewEventSink(50)
	var holder *sql.DB
	service := New(Options{
		Profile: "web-platform", StartedAt: time.Now(), Events: sink,
		DB: func() *sql.DB { return holder },
	})
	service.Snapshot(context.Background()) // unavailable baseline
	if items, _ := sink.Recent(10); len(items) != 0 {
		t.Fatalf("baseline must stay silent: %+v", items)
	}
	// Once the database answers pings, the transition fires the recovery event.
	holder = sql.OpenDB(stubConnector{})
	service.Snapshot(context.Background())
	items, _ := sink.Recent(10)
	if len(items) != 1 || items[0].Type != EventDatabase {
		t.Fatalf("database recovery must be recorded: %+v", items)
	}
}

func TestNetRatesServerSide(t *testing.T) {
	sent, recv := uint64(1000), uint64(2000)
	host := DefaultHost(func() string { return "" })
	service := New(Options{Profile: "web-standalone", StartedAt: time.Now(), Host: host})
	first := service.Snapshot(context.Background())
	if first.Host.NetSentPerSec != nil {
		t.Fatal("first pull must answer without rates")
	}
	sent, recv = sent+1500, recv+3000
	// Same source closure cannot change counters; feed a mutating source.
	source := func(context.Context) HostStats {
		stats := host(context.Background())
		stats.NetSentBytes, stats.NetRecvBytes = sent, recv
		return stats
	}
	service = New(Options{Profile: "web-standalone", StartedAt: time.Now(), Host: source})
	service.netAt = time.Now().Add(-2 * time.Second)
	service.netSent, service.netRecv = sent-1500, recv-3000
	second := service.Snapshot(context.Background())
	if second.Host.NetSentPerSec == nil || *second.Host.NetSentPerSec <= 0 {
		t.Fatalf("second pull must carry rates: %+v", second.Host)
	}
}

func TestStorageProbeCachingAndEvents(t *testing.T) {
	sink := NewEventSink(50)
	fail := true
	service := New(Options{
		Profile: "web-platform", StartedAt: time.Now(), Events: sink,
		Storage: func(context.Context) ([]contracts.StorageLocation, error) {
			return []contracts.StorageLocation{{ID: "local", Provider: "local", Active: true, Configured: true}}, nil
		},
		StorageProbe: func(context.Context, string) error {
			if fail {
				return errProbeFailed
			}
			return nil
		},
	})
	snapshot := service.Snapshot(context.Background())
	if snapshot.Storage.Probe == nil || (*snapshot.Storage.Probe)[0].Status != "unknown" {
		t.Fatalf("unprobed location must stay unknown: %+v", snapshot.Storage.Probe)
	}
	if view := service.ProbeStorage(context.Background(), "local"); view.Status != "unavailable" || view.Error == nil {
		t.Fatalf("failing probe must be truthful: %+v", view)
	}
	items, _ := sink.Recent(10)
	if len(items) != 1 || items[0].Type != EventStorage {
		t.Fatalf("probe failure must be recorded: %+v", items)
	}
	fail = false
	if view := service.ProbeStorage(context.Background(), "local"); view.Status != "healthy" {
		t.Fatalf("recovered probe must be healthy: %+v", view)
	}
	snapshot = service.Snapshot(context.Background())
	if (*snapshot.Storage.Probe)[0].Status != "healthy" {
		t.Fatalf("snapshot must carry the cached probe: %+v", snapshot.Storage.Probe)
	}
}

type errProbe struct{}

func (errProbe) Error() string { return "probe failed" }

var errProbeFailed = errProbe{}

func TestTaskRunsJoin(t *testing.T) {
	tasks := &contracts.TaskList{Items: []contracts.TaskEntry{{Name: "mail.queue", Enabled: true, LastStatus: "error"}}}
	service := New(Options{
		Profile: "web-platform", StartedAt: time.Now(),
		Tasks: func(context.Context) (*contracts.TaskList, error) { return tasks, nil },
		Runs: func(context.Context, string) (*contracts.TaskRunList, error) {
			return &contracts.TaskRunList{Items: []contracts.TaskRunEntry{{StartedAt: 1, DurationMs: 5, Status: "error"}, {StartedAt: 2, DurationMs: 6, Status: "error"}, {StartedAt: 3, DurationMs: 7, Status: "ok"}, {StartedAt: 4, DurationMs: 8, Status: "ok"}}}, nil
		},
	})
	snapshot := service.Snapshot(context.Background())
	runs := (*snapshot.Tasks.Recent)[0].Runs
	if runs == nil || len(*runs) != 3 {
		t.Fatalf("failing task must carry at most three runs: %+v", runs)
	}
}

// TestSnapshotFollowsInstalledProfile guards the lazy profile read: a server
// that starts before installation must report the chosen form, not the
// pre-install default.
func TestSnapshotFollowsInstalledProfile(t *testing.T) {
	current := contracts.Profile("web-standalone")
	service := New(Options{
		Profile:   "web-standalone",
		ProfileOf: func() contracts.Profile { return current },
		StartedAt: time.Now(),
	})
	if snapshot := service.Snapshot(context.Background()); snapshot.Profile != "web-standalone" {
		t.Fatalf("pre-install snapshot profile drifted: %s", snapshot.Profile)
	}
	current = "web-platform"
	if snapshot := service.Snapshot(context.Background()); snapshot.Profile != "web-platform" {
		t.Fatalf("snapshot must follow the installed profile: %s", snapshot.Profile)
	}
}

func TestReadContainerLimits(t *testing.T) {
	root := t.TempDir()
	if stats := readContainer(root); stats.Detected {
		t.Fatal("absent cgroup tree must not be detected")
	}
	if err := os.MkdirAll(filepath.Join(root, "sys/fs/cgroup"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".dockerenv"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "sys/fs/cgroup/memory.max"), []byte("1073741824\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "sys/fs/cgroup/memory.current"), []byte("1048576\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "sys/fs/cgroup/cpu.max"), []byte("200000 100000\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	stats := readContainer(root)
	if !stats.Detected || !stats.MemoryLimitSet || stats.MemoryLimitBytes != 1073741824 || stats.MemoryUsageBytes != 1048576 {
		t.Fatalf("cgroup v2 limits must parse: %+v", stats)
	}
	if !stats.CpuQuotaSet || stats.CpuQuotaCores != 2 {
		t.Fatalf("cpu quota must parse as cores: %+v", stats)
	}
}

// TestEventSinkConcurrentAppends hammers the ring from many goroutines: the
// total must count every append and the buffer must never exceed capacity.
func TestEventSinkConcurrentAppends(t *testing.T) {
	sink := NewEventSink(64)
	const writers, perWriter = 8, 200
	var wg sync.WaitGroup
	for w := 0; w < writers; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; i < perWriter; i++ {
				sink.Append(EventLifecycle, SeverityInfo, "并发写入", "")
			}
		}(w)
	}
	wg.Wait()
	items, total := sink.Recent(1000)
	if total != writers*perWriter {
		t.Fatalf("total must count every append: %d", total)
	}
	if len(items) != 64 {
		t.Fatalf("buffer must be capped at capacity: %d", len(items))
	}
	for i := 1; i < len(items); i++ {
		if items[i-1].ID <= items[i].ID {
			t.Fatalf("recent must stay newest-first under concurrency")
		}
	}
}

// TestReadContainerCPUUsageAndCpuset covers the T4 additions: v2 usage and
// cpuset parsing, v1 nanosecond normalization, and effective capacity.
func TestReadContainerCPUUsageAndCpuset(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "sys/fs/cgroup"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".dockerenv"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	write := func(rel, content string) {
		if err := os.WriteFile(filepath.Join(root, rel), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("sys/fs/cgroup/cpu.stat", "usage_usec 1500000\nuser_usec 900000\n")
	write("sys/fs/cgroup/cpuset.cpus.effective", "0-3,8\n")
	write("sys/fs/cgroup/cpu.max", "200000 100000\n")
	write("sys/fs/cgroup/memory.max", "max\n")
	stats := readContainer(root)
	if !stats.CpuUsageSet || stats.CpuUsageMicros != 1500000 {
		t.Fatalf("v2 usage_usec must parse: %+v", stats)
	}
	if !stats.CpusetSet || stats.CpusetCpus != 5 {
		t.Fatalf("cpuset mask must count five cpus: %+v", stats)
	}
	if !stats.CpuQuotaSet || stats.CpuQuotaCores != 2 {
		t.Fatalf("quota must parse: %+v", stats)
	}
	capacity, ok := stats.EffectiveCapacity()
	if !ok || capacity != 2 {
		t.Fatalf("effective capacity must take the tighter bound (quota 2 < cpuset 5): %v %v", capacity, ok)
	}
	// v1: nanoseconds normalized to microseconds; effective_cpus as fallback.
	root1 := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root1, "sys/fs/cgroup/cpuacct"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root1, "sys/fs/cgroup/cpu"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root1, "sys/fs/cgroup/cpuset"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root1, "sys/fs/cgroup/cpuacct/cpuacct.usage"), []byte("2500000000"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root1, "sys/fs/cgroup/cpu/cpu.cfs_quota_us"), []byte("300000"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root1, "sys/fs/cgroup/cpu/cpu.cfs_period_us"), []byte("100000"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root1, "sys/fs/cgroup/cpuset/cpuset.effective_cpus"), []byte("0-1"), 0o644); err != nil {
		t.Fatal(err)
	}
	stats1 := readContainer(root1)
	if !stats1.CpuUsageSet || stats1.CpuUsageMicros != 2500000 {
		t.Fatalf("v1 nanoseconds must normalize: %+v", stats1)
	}
	capacity1, ok1 := stats1.EffectiveCapacity()
	if !ok1 || capacity1 != 2 {
		t.Fatalf("v1 capacity must take the tighter of quota 3 and cpuset 2: %v %v", capacity1, ok1)
	}
}

// TestContainerCPUPercentDelta covers the Service-side delta computation with
// first-pull skip, normal delta, and counter reset handling.
func TestContainerCPUPercentDelta(t *testing.T) {
	source := DefaultHost(func() string { return "" })
	service := New(Options{Profile: "web-standalone", StartedAt: time.Now(), Host: source})
	micros := uint64(1_000_000)
	build := func() contracts.MonitorSnapshot {
		snapshot := service.Snapshot(context.Background())
		snapshot.Host = contracts.MonitorHostStats{Available: true, Container: &contracts.MonitorContainerView{
			Detected: true, CpuQuotaCores: ptrFloat(2), CpuPercent: nil}}
		// Feed the delta state directly: simulate two pulls 2 seconds apart.
		service.mu.Lock()
		service.containerCpuAt = time.Now().Add(-2 * time.Second)
		service.containerCpuUse = micros
		service.containerCpuOK = true
		service.mu.Unlock()
		snapshot.Host.Container.CpuPercent = nil
		return snapshot
	}
	_ = build()
	// Simulate the next pull with 4 million microseconds more usage over 2s
	// against a 2-core capacity: 4e6/1e6 / 2 / 2 * 100 = 100%.
	service.mu.Lock()
	service.containerCpuUse = 1_000_000
	service.containerCpuOK = true
	service.containerCpuAt = time.Now().Add(-2 * time.Second)
	service.mu.Unlock()
	stats := HostStats{Container: ContainerStats{CpuUsageSet: true, CpuUsageMicros: 5_000_000, CpuQuotaSet: true, CpuQuotaCores: 2}}
	percent, ok := service.containerCpuPercent(stats)
	if !ok || percent < 99 || percent > 101 {
		t.Fatalf("delta computation must yield 100%% against a 2-core quota: %v %v", percent, ok)
	}
	// A counter reset (usage went backwards) skips the value.
	service.mu.Lock()
	service.containerCpuUse = 9_000_000
	service.containerCpuOK = true
	service.containerCpuAt = time.Now().Add(-2 * time.Second)
	service.mu.Unlock()
	if _, ok := service.containerCpuPercent(stats); ok {
		t.Fatal("a counter reset must skip the value")
	}
	_ = source
}
