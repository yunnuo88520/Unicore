// Author: yunnuo <ymz@ebox.vip>
// Description: Read-only runtime snapshots for the web and desktop surfaces: build, health, resources, service views, event transitions and storage probes.
package monitor

import (
	"context"
	"database/sql"
	"runtime"
	"sync"
	"time"

	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/contracts"
)

// HTTPStats mirrors the shared metric semantics; the web assembly feeds it
// from the observability registry, the desktop leaves it nil (no HTTP).
type HTTPStats struct {
	ActiveRequests int
	RequestsTotal  int
	ErrorsTotal    int
	AvgDurationMs  int
	P95DurationMs  int
}

// RuntimeStats carries the Go runtime and process view; RSS/CPU stay optional
// because desktop and some OSes cannot provide them.
type RuntimeStats struct {
	Goroutines   int
	HeapAlloc    int
	HeapSys      int
	GcCycles     int
	PauseTotalMs int
	RssBytes     int
	CpuTimeMs    int
}

// StdlibRuntime builds the runtime view from the standard library alone; it
// keeps the desktop snapshot equivalent without a Prometheus registry. RSS
// and CPU stay zero (not applicable) here.
func StdlibRuntime() RuntimeStats {
	var memstats runtime.MemStats
	runtime.ReadMemStats(&memstats)
	return RuntimeStats{
		Goroutines:   runtime.NumGoroutine(),
		HeapAlloc:    int(memstats.HeapAlloc),
		HeapSys:      int(memstats.Sys),
		GcCycles:     int(memstats.NumGC),
		PauseTotalMs: int(memstats.PauseTotalNs / uint64(time.Millisecond)),
	}
}

// Sources keep the snapshot read-only and dependency-light: every field is a
// lazy accessor so the service never holds more than the caller already holds.
type Options struct {
	Profile contracts.Profile
	// ProfileOf re-reads the installed profile on every snapshot; the server
	// assembly starts before installation, so a static value would keep
	// reporting the pre-install default after the operator picks a form.
	ProfileOf func() contracts.Profile
	StartedAt time.Time
	DB        func() *sql.DB
	HTTP      func() HTTPStats
	Runtime   func() RuntimeStats
	Host      HostSource
	Events    *EventSink
	// Runs reads the recent run records of one scheduled task; the platform
	// assembly closes over the scheduler, local profiles leave it nil.
	Runs func(ctx context.Context, task string) (*contracts.TaskRunList, error)
	// StorageProbe runs the files service lightweight verification for one
	// location; only wired on the platform, only called on explicit request.
	StorageProbe func(ctx context.Context, location string) error
	Storage      func(ctx context.Context) ([]contracts.StorageLocation, error)
	Tasks        func(ctx context.Context) (*contracts.TaskList, error)
}

// Service holds only pull-state: last seen health values for transition
// events, the previous network counters for server-side rates, and the cached
// storage probe results. Nothing here persists.
type Service struct {
	options Options
	alert   *AlertEngine

	mu              sync.Mutex
	lastDatabase    string
	netAt           time.Time
	containerCpuAt  time.Time
	containerCpuUse uint64
	containerCpuOK  bool
	netSent         uint64
	netRecv         uint64
	probes          map[string]contracts.MonitorStorageLocation
}

// SetAlertEngine attaches the process alert engine so the HTTP surface can
// expose the rule management endpoints.
func (s *Service) SetAlertEngine(engine *AlertEngine) { s.alert = engine }

// AlertEngine returns the attached engine, or nil when alerting is absent.
func (s *Service) AlertEngine() *AlertEngine { return s.alert }

func New(options Options) *Service {
	return &Service{options: options, probes: map[string]contracts.MonitorStorageLocation{}}
}

// Events returns up to limit newest buffered events (newest first) plus the
// total ever recorded and the ring capacity.
func (s *Service) Events(limit int) contracts.MonitorEventList {
	if s.options.Events == nil {
		return contracts.MonitorEventList{Items: []contracts.MonitorEvent{}, Total: 0}
	}
	items, total := s.options.Events.Recent(limit)
	list := make([]contracts.MonitorEvent, 0, len(items))
	for _, item := range items {
		entry := contracts.MonitorEvent{ID: int(item.ID), Type: item.Type, Severity: item.Severity, Message: item.Message, At: int(item.At)}
		if item.Detail != "" {
			detail := item.Detail
			entry.Detail = &detail
		}
		list = append(list, entry)
	}
	capacity := s.options.Events.Capacity()
	return contracts.MonitorEventList{Items: list, Total: int(total), Capacity: &capacity}
}

// ProbeStorage runs the lightweight files verification for one location on an
// explicit request, caches the result into later snapshots and records a
// failure event. Concurrent requests for the same location serialize on a
// per-location lock so one click cannot fan out into parallel probes.
func (s *Service) ProbeStorage(ctx context.Context, locationID string) contracts.MonitorStorageLocation {
	view := s.locationView(locationID, "unknown", 0, "")
	if s.options.StorageProbe == nil {
		return view
	}
	s.mu.Lock()
	if s.probes[locationID].Status == "probing" {
		cached := s.probes[locationID]
		s.mu.Unlock()
		return cached
	}
	s.probes[locationID] = s.locationView(locationID, "probing", 0, "")
	s.mu.Unlock()
	s.runProbe(ctx, locationID)
	s.mu.Lock()
	cached := s.probes[locationID]
	s.mu.Unlock()
	return cached
}

func (s *Service) runProbe(ctx context.Context, locationID string) {
	started := time.Now()
	err := s.options.StorageProbe(ctx, locationID)
	latency := int(time.Since(started).Milliseconds())
	view := contracts.MonitorStorageLocation{}
	if err != nil {
		view = s.locationView(locationID, "unavailable", latency, err.Error())
		s.appendEvent(EventStorage, SeverityWarning, "对象存储探活失败：", locationID+" "+err.Error())
	} else {
		view = s.locationView(locationID, "healthy", latency, "")
	}
	s.mu.Lock()
	s.probes[locationID] = view
	s.mu.Unlock()
}

// locationView enriches one cached probe result with the location facts.
func (s *Service) locationView(locationID, status string, latencyMs int, message string) contracts.MonitorStorageLocation {
	checkedAt := int(time.Now().Unix())
	view := contracts.MonitorStorageLocation{ID: locationID, Provider: "", Active: false, Configured: false, Status: status, CheckedAt: &checkedAt}
	if s.options.Storage != nil {
		if locations, err := s.options.Storage(context.Background()); err == nil {
			for _, location := range locations {
				if location.ID == locationID {
					view.Provider, view.Active, view.Configured = location.Provider, location.Active, location.Configured
				}
			}
		}
	}
	if latencyMs > 0 {
		view.LatencyMs = &latencyMs
	}
	if message != "" {
		view.Error = &message
	}
	return view
}

// Snapshot aggregates one pull-based view; it performs at most one bounded
// database ping and never writes. Budget: well under 50ms for local stores.
func (s *Service) Snapshot(ctx context.Context) contracts.MonitorSnapshot {
	profile := s.options.Profile
	if s.options.ProfileOf != nil {
		profile = s.options.ProfileOf()
	}
	snapshot := contracts.MonitorSnapshot{
		Profile:       string(profile),
		Version:       buildinfo.Version,
		Commit:        buildinfo.Commit,
		BuildTime:     buildinfo.BuildTime,
		GoVersion:     runtime.Version(),
		StartedAt:     int(s.options.StartedAt.Unix()),
		UptimeSeconds: int(time.Since(s.options.StartedAt).Seconds()),
		Status:        "healthy",
	}
	snapshot.HttpService = s.httpView()
	snapshot.Database = s.databaseView(ctx)
	s.detectDatabaseEvent(snapshot.Database)
	if snapshot.Database.Status == "unavailable" {
		snapshot.Status = "unavailable"
	}
	snapshot.Storage = s.storageView(ctx)
	snapshot.Tasks = s.tasksView(ctx)
	snapshot.Runtime = s.runtimeView()
	snapshot.Host = s.hostView(ctx)
	if snapshot.Status == "healthy" && snapshot.Tasks.Applicable && derefInt(snapshot.Tasks.Failing) > 0 {
		snapshot.Status = "degraded"
	}
	return snapshot
}

func (s *Service) appendEvent(eventType, severity, message, detail string) {
	if s.options.Events == nil {
		return
	}
	s.options.Events.Append(eventType, severity, message, detail)
}

// detectDatabaseEvent records health transitions between pulls; the first
// pull only primes the baseline.
func (s *Service) detectDatabaseEvent(view contracts.MonitorDatabase) {
	s.mu.Lock()
	previous := s.lastDatabase
	s.lastDatabase = view.Status
	s.mu.Unlock()
	if previous == "" || previous == view.Status {
		return
	}
	if view.Status == "unavailable" {
		s.appendEvent(EventDatabase, SeverityError, "数据库连接失败", "探活无法完成，服务健康已切换为不可用。")
		return
	}
	s.appendEvent(EventDatabase, SeverityInfo, "数据库连接恢复", "探活恢复正常。")
}

func (s *Service) runtimeView() contracts.MonitorRuntimeStats {
	view := contracts.MonitorRuntimeStats{}
	if s.options.Runtime == nil {
		return view
	}
	stats := s.options.Runtime()
	view = contracts.MonitorRuntimeStats{Goroutines: stats.Goroutines, HeapAllocBytes: stats.HeapAlloc, HeapSysBytes: stats.HeapSys, GcCycles: stats.GcCycles}
	if stats.PauseTotalMs > 0 {
		pause := stats.PauseTotalMs
		view.PauseTotalMs = &pause
	}
	if stats.RssBytes > 0 {
		rss, cpu := stats.RssBytes, stats.CpuTimeMs
		view.RssBytes = &rss
		if cpu > 0 {
			view.CpuTimeMs = &cpu
		}
	}
	return view
}

// hostView maps the sampled host hardware into the contract; a nil source or
// failed sampling stays truthful with available=false instead of zeros.
func (s *Service) hostView(ctx context.Context) contracts.MonitorHostStats {
	view := contracts.MonitorHostStats{Available: false}
	if s.options.Host == nil {
		return view
	}
	stats := s.options.Host(ctx)
	if stats.SampledAt == 0 {
		return view
	}
	// 64-bit platform assumption matches every supported deployment target;
	// byte counters and timestamps fit int comfortably.
	memTotal, memUsed, memAvailable := int(stats.MemTotalBytes), int(stats.MemUsedBytes), int(stats.MemAvailableBytes)
	swapTotal, swapUsed := int(stats.SwapTotalBytes), int(stats.SwapUsedBytes)
	netSent, netRecv := int(stats.NetSentBytes), int(stats.NetRecvBytes)
	sampledAt := int(stats.SampledAt)
	view = contracts.MonitorHostStats{Available: true, Hostname: &stats.Hostname, Os: &stats.Os, Platform: &stats.Platform,
		PlatformVersion: &stats.PlatformVersion, KernelVersion: &stats.KernelVersion, KernelArch: &stats.KernelArch,
		HostUptimeSeconds: &stats.HostUptimeSeconds, CpuModel: &stats.CpuModel,
		CpuCoresLogical: &stats.CpuCoresLogical, CpuCoresPhysical: &stats.CpuCoresPhysical,
		CpuPercent: &stats.CpuPercent, CpuPerCore: &stats.CpuPerCore,
		MemTotalBytes: &memTotal, MemUsedBytes: &memUsed, MemAvailableBytes: &memAvailable,
		MemUsedPercent: &stats.MemUsedPercent, SwapTotalBytes: &swapTotal, SwapUsedBytes: &swapUsed,
		NetSentBytes: &netSent, NetRecvBytes: &netRecv, SampledAt: &sampledAt}
	if stats.HasLoad {
		load1, load5, load15 := stats.Load1, stats.Load5, stats.Load15
		view.Load1, view.Load5, view.Load15 = &load1, &load5, &load15
	}
	disks := make([]contracts.MonitorDiskUsage, 0, len(stats.Disks))
	for _, item := range stats.Disks {
		disks = append(disks, contracts.MonitorDiskUsage{Path: item.Path, IsDataDir: &item.IsDataDir, TotalBytes: int(item.TotalBytes),
			UsedBytes: int(item.UsedBytes), FreeBytes: int(item.FreeBytes), UsedPercent: item.UsedPercent})
	}
	view.Disks = &disks
	// Server-side rates over the pull gap; the first pull answers without
	// rates and the client keeps its own delta fallback for that case.
	if sentPerSec, recvPerSec, ok := s.netRates(stats); ok {
		view.NetSentPerSec, view.NetRecvPerSec = &sentPerSec, &recvPerSec
	}
	if stats.Container.Detected {
		container := contracts.MonitorContainerView{Detected: true}
		if stats.Container.MemoryLimitSet {
			limit, usage := int(stats.Container.MemoryLimitBytes), int(stats.Container.MemoryUsageBytes)
			container.MemoryLimitBytes, container.MemoryUsageBytes = &limit, &usage
		}
		if stats.Container.CpuQuotaSet {
			quota := stats.Container.CpuQuotaCores
			container.CpuQuotaCores = &quota
		}
		// Container CPU% from the usage counter delta against the effective
		// capacity; the first pull or a counter reset answers without a value
		// instead of a misleading zero.
		if percent, ok := s.containerCpuPercent(stats); ok {
			container.CpuPercent = &percent
		}
		view.Container = &container
	}
	if len(stats.Sensors) > 0 {
		sensors := make([]contracts.MonitorSensor, 0, len(stats.Sensors))
		for _, item := range stats.Sensors {
			sensors = append(sensors, contracts.MonitorSensor{Label: item.Label, Celsius: item.Celsius})
		}
		view.Sensors = &sensors
	}
	return view
}

// containerCpuPercent derives container CPU utilization from the cgroup usage
// counter delta over the pull gap against the effective capacity; missing
// usage, a first pull, or a counter reset skip the value.
func (s *Service) containerCpuPercent(stats HostStats) (float64, bool) {
	if !stats.Container.CpuUsageSet {
		return 0, false
	}
	capacity, ok := stats.Container.EffectiveCapacity()
	if !ok || capacity <= 0 {
		return 0, false
	}
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	defer func() {
		s.containerCpuAt, s.containerCpuUse, s.containerCpuOK = now, stats.Container.CpuUsageMicros, true
	}()
	if !s.containerCpuOK || stats.Container.CpuUsageMicros < s.containerCpuUse {
		return 0, false
	}
	seconds := now.Sub(s.containerCpuAt).Seconds()
	if seconds < 0.5 {
		return 0, false
	}
	deltaSeconds := float64(stats.Container.CpuUsageMicros-s.containerCpuUse) / 1e6
	return deltaSeconds / capacity / seconds * 100, true
}

// netRates derives per-second transfer rates from the cumulative counters of
// consecutive pulls; a counter reset (reboot) restarts the baseline.
func (s *Service) netRates(stats HostStats) (float64, float64, bool) {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	defer func() { s.netAt, s.netSent, s.netRecv = now, stats.NetSentBytes, stats.NetRecvBytes }()
	if s.netAt.IsZero() || stats.NetSentBytes < s.netSent || stats.NetRecvBytes < s.netRecv {
		return 0, 0, false
	}
	seconds := now.Sub(s.netAt).Seconds()
	if seconds < 0.5 {
		return 0, 0, false
	}
	return float64(stats.NetSentBytes-s.netSent) / seconds, float64(stats.NetRecvBytes-s.netRecv) / seconds, true
}

func (s *Service) httpView() contracts.MonitorHttpService {
	view := contracts.MonitorHttpService{Applicable: false}
	if s.options.HTTP == nil {
		return view
	}
	stats := s.options.HTTP()
	active, total, errors := stats.ActiveRequests, stats.RequestsTotal, stats.ErrorsTotal
	avg, p95 := stats.AvgDurationMs, stats.P95DurationMs
	view = contracts.MonitorHttpService{Applicable: true, ActiveRequests: &active, RequestsTotal: &total,
		ErrorsTotal: &errors, AvgDurationMs: &avg, P95DurationMs: &p95}
	return view
}

func (s *Service) databaseView(ctx context.Context) contracts.MonitorDatabase {
	view := contracts.MonitorDatabase{Status: "unavailable", LatencyMs: 0}
	db := func() *sql.DB {
		if s.options.DB == nil {
			return nil
		}
		return s.options.DB()
	}()
	if db == nil {
		return view
	}
	pingCtx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	started := time.Now()
	if err := db.PingContext(pingCtx); err != nil {
		return view
	}
	latency := int(time.Since(started).Milliseconds())
	stats := db.Stats()
	open, inUse, idle, wait := stats.OpenConnections, stats.InUse, stats.Idle, int(stats.WaitCount)
	view = contracts.MonitorDatabase{Status: "healthy", LatencyMs: latency,
		OpenConnections: &open, InUseConnections: &inUse, IdleConnections: &idle, WaitTotal: &wait}
	if stats.MaxOpenConnections > 0 {
		maxOpen := stats.MaxOpenConnections
		view.MaxOpenConnections = &maxOpen
	}
	if stats.WaitDuration > 0 {
		waitMs := int(stats.WaitDuration / time.Millisecond)
		view.WaitDurationMs = &waitMs
	}
	return view
}

func (s *Service) storageView(ctx context.Context) contracts.MonitorStorageService {
	view := contracts.MonitorStorageService{Applicable: false}
	if s.options.Storage == nil {
		return view
	}
	locations, err := s.options.Storage(ctx)
	if err != nil || len(locations) == 0 {
		return view
	}
	count := len(locations)
	view = contracts.MonitorStorageService{Applicable: true, Locations: &count}
	for _, location := range locations {
		if location.Active {
			name, provider := location.ID, location.Provider
			view.ActiveLocation = &name
			view.Provider = &provider
			break
		}
	}
	// Cached probe results join the location facts; unprobed locations stay
	// "unknown" until an explicit probe request.
	probe := make([]contracts.MonitorStorageLocation, 0, len(locations))
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, location := range locations {
		cached, ok := s.probes[location.ID]
		if !ok {
			cached = contracts.MonitorStorageLocation{ID: location.ID, Provider: location.Provider, Active: location.Active, Configured: location.Configured, Status: "unknown"}
		}
		probe = append(probe, cached)
	}
	view.Probe = &probe
	return view
}

func (s *Service) tasksView(ctx context.Context) contracts.MonitorTasksSummary {
	view := contracts.MonitorTasksSummary{Applicable: false}
	if s.options.Tasks == nil {
		return view
	}
	list, err := s.options.Tasks(ctx)
	if err != nil || list == nil {
		return view
	}
	total, enabled, failing := len(list.Items), 0, 0
	recent := make([]contracts.MonitorTaskHealth, 0, len(list.Items))
	for _, item := range list.Items {
		if item.Enabled {
			enabled++
		}
		if item.LastStatus == "error" {
			failing++
		}
		health := contracts.MonitorTaskHealth{Name: item.Name, Enabled: item.Enabled}
		if item.LastStatus != "" {
			status := item.LastStatus
			health.LastStatus = &status
		}
		if item.LastError != "" {
			message := item.LastError
			health.LastError = &message
		}
		if item.LastRunAt != 0 {
			lastRun := item.LastRunAt
			health.LastRunAt = &lastRun
			if item.NextRunAt != 0 {
				nextRun := item.NextRunAt
				health.NextRunAt = &nextRun
			}
		}
		// Failing tasks carry their last runs so the console shows what
		// actually happened without leaving the monitor.
		if item.LastStatus == "error" && s.options.Runs != nil {
			if runs, err := s.options.Runs(ctx, item.Name); err == nil && runs != nil && len(runs.Items) > 0 {
				items := make([]contracts.MonitorTaskRun, 0, 3)
				for _, run := range runs.Items {
					if len(items) >= 3 {
						break
					}
					entry := contracts.MonitorTaskRun{StartedAt: run.StartedAt, DurationMs: run.DurationMs, Status: run.Status}
					if run.Error != "" {
						message := run.Error
						entry.Error = &message
					}
					items = append(items, entry)
				}
				health.Runs = &items
			}
		}
		recent = append(recent, health)
	}
	view = contracts.MonitorTasksSummary{Applicable: true, Total: &total, Enabled: &enabled, Failing: &failing, Recent: &recent}
	return view
}

func derefInt(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}
