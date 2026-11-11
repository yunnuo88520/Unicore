// Author: yunnuo <ymz@ebox.vip>
// Description: Read-only host hardware sampling (CPU, memory, disks, load, network) via gopsutil; every call is pull-based with no background collection.
package monitor

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

// HostStats is one sampled host view; every field stays optional because
// operating systems and containers expose different subsets.
type HostStats struct {
	Hostname          string
	Os                string
	Platform          string
	PlatformVersion   string
	KernelVersion     string
	KernelArch        string
	HostUptimeSeconds int
	CpuModel          string
	CpuCoresLogical   int
	CpuCoresPhysical  int
	CpuPercent        float64
	CpuPerCore        []float64
	HasLoad           bool
	Load1             float64
	Load5             float64
	Load15            float64
	MemTotalBytes     uint64
	MemUsedBytes      uint64
	MemAvailableBytes uint64
	MemUsedPercent    float64
	SwapTotalBytes    uint64
	SwapUsedBytes     uint64
	NetSentBytes      uint64
	NetRecvBytes      uint64
	Disks             []HostDisk
	Container         ContainerStats
	Sensors           []SensorReading
	SampledAt         int64
}

// HostDisk is one mounted volume usage row; IsDataDir marks the volume that
// backs the instance data directory.
type HostDisk struct {
	Path        string
	IsDataDir   bool
	TotalBytes  uint64
	UsedBytes   uint64
	FreeBytes   uint64
	UsedPercent float64
}

// HostSource samples one host view per call; implementations stay read-only.
type HostSource func(ctx context.Context) HostStats

// DefaultHost samples with gopsutil syscalls. CPU percentages come from the
// deltas between pulls (the library caches the previous counters, the first
// pull reports the boot-to-now average), so no sampler goroutine and no
// blocking sleep ever run. The data directory contributes the disk row.
func DefaultHost(dataDir func() string) HostSource {
	return func(ctx context.Context) HostStats {
		stats := HostStats{SampledAt: time.Now().Unix()}
		if info, err := host.InfoWithContext(ctx); err == nil {
			stats.Hostname, stats.Os, stats.Platform = info.Hostname, info.OS, info.Platform
			stats.PlatformVersion, stats.KernelVersion, stats.KernelArch = info.PlatformVersion, info.KernelVersion, info.KernelArch
			stats.HostUptimeSeconds = int(info.Uptime)
		}
		if models, err := cpu.InfoWithContext(ctx); err == nil && len(models) > 0 {
			stats.CpuModel = models[0].ModelName
		}
		if physical, err := cpu.CountsWithContext(ctx, false); err == nil {
			stats.CpuCoresPhysical = physical
		}
		if logical, err := cpu.CountsWithContext(ctx, true); err == nil {
			stats.CpuCoresLogical = logical
		}
		if perCore, err := cpu.PercentWithContext(ctx, 0, true); err == nil && len(perCore) > 0 {
			stats.CpuPerCore = perCore
			total := 0.0
			for _, value := range perCore {
				total += value
			}
			stats.CpuPercent = total / float64(len(perCore))
		}
		if average, err := load.AvgWithContext(ctx); err == nil {
			stats.HasLoad = true
			stats.Load1, stats.Load5, stats.Load15 = average.Load1, average.Load5, average.Load15
		}
		if virtual, err := mem.VirtualMemoryWithContext(ctx); err == nil {
			stats.MemTotalBytes, stats.MemUsedBytes, stats.MemAvailableBytes = virtual.Total, virtual.Used, virtual.Available
			stats.MemUsedPercent = virtual.UsedPercent
		}
		if swap, err := mem.SwapMemoryWithContext(ctx); err == nil {
			stats.SwapTotalBytes, stats.SwapUsedBytes = swap.Total, swap.Used
		}
		stats.Disks = dataDirDisks(dataDir)
		if counters, err := net.IOCountersWithContext(ctx, false); err == nil && len(counters) > 0 {
			stats.NetSentBytes, stats.NetRecvBytes = counters[0].BytesSent, counters[0].BytesRecv
		}
		if runtime.GOOS == "linux" {
			stats.Container = readContainer("/")
		}
		stats.Sensors = SampleSensors(ctx)
		return stats
	}
}

// SensorReading is one best-effort hardware temperature; unavailable sensors
// simply never appear.
type SensorReading struct {
	Label   string
	Celsius float64
}

// ContainerStats is the cgroup resource view: zero everywhere except Linux
// containers, where kernel /proc readings must be read against the limits.
type ContainerStats struct {
	Detected         bool
	MemoryLimitSet   bool
	MemoryLimitBytes uint64
	MemoryUsageBytes uint64
	CpuQuotaSet      bool
	CpuQuotaCores    float64
	CpuUsageSet      bool
	CpuUsageMicros   uint64
	CpusetSet        bool
	CpusetCpus       int
}

// EffectiveCapacity reports the container CPU capacity in cores: the tighter
// of the quota and the cpuset, when either exists.
func (c ContainerStats) EffectiveCapacity() (float64, bool) {
	candidates := []float64{}
	if c.CpuQuotaSet && c.CpuQuotaCores > 0 {
		candidates = append(candidates, c.CpuQuotaCores)
	}
	if c.CpusetSet && c.CpusetCpus > 0 {
		candidates = append(candidates, float64(c.CpusetCpus))
	}
	if len(candidates) == 0 {
		return 0, false
	}
	best := candidates[0]
	for _, value := range candidates[1:] {
		if value < best {
			best = value
		}
	}
	return best, true
}

// readContainer parses cgroup v2 (preferred) or v1 limits under linuxRoot;
// every failure degrades to a non-detected view. linuxRoot exists for tests.
func readContainer(linuxRoot string) ContainerStats {
	stats := ContainerStats{}
	if !fileExists(linuxRoot + "/sys/fs/cgroup") {
		return stats
	}
	stats.Detected = fileExists(linuxRoot+"/.dockerenv") || fileExists(linuxRoot+"/run/.containerenv") || procOneContainerized(linuxRoot)
	if value, ok := readTrimmed(linuxRoot + "/sys/fs/cgroup/memory.max"); ok && value != "max" {
		if limit, err := strconv.ParseUint(value, 10, 64); err == nil && limit > 0 {
			stats.MemoryLimitSet, stats.MemoryLimitBytes = true, limit
		}
	} else if value, ok := readTrimmed(linuxRoot + "/sys/fs/cgroup/memory/memory.limit_in_bytes"); ok {
		if limit, err := strconv.ParseUint(value, 10, 64); err == nil && limit > 0 && limit < 1<<60 {
			stats.MemoryLimitSet, stats.MemoryLimitBytes = true, limit
		}
	}
	if value, ok := readTrimmed(linuxRoot + "/sys/fs/cgroup/memory.current"); ok {
		if usage, err := strconv.ParseUint(value, 10, 64); err == nil {
			stats.MemoryUsageBytes = usage
		}
	} else if value, ok := readTrimmed(linuxRoot + "/sys/fs/cgroup/memory/memory.usage_in_bytes"); ok {
		if usage, err := strconv.ParseUint(value, 10, 64); err == nil {
			stats.MemoryUsageBytes = usage
		}
	}
	quota, period, ok := readCpuMax(linuxRoot)
	if ok && quota != "max" && period > 0 {
		if q, err := strconv.ParseFloat(quota, 64); err == nil && q > 0 {
			stats.CpuQuotaSet, stats.CpuQuotaCores = true, q/float64(period)
		}
	} else if !ok {
		if q, errQ := strconv.ParseFloat(readOr(linuxRoot+"/sys/fs/cgroup/cpu/cpu.cfs_quota_us", "-1"), 64); errQ == nil && q > 0 {
			if p, errP := strconv.ParseFloat(readOr(linuxRoot+"/sys/fs/cgroup/cpu/cpu.cfs_period_us", "100000"), 64); errP == nil && p > 0 {
				stats.CpuQuotaSet, stats.CpuQuotaCores = true, q/p
			}
		}
	}
	// CPU usage: v2 cpu.stat usage_usec, v1 cpuacct.usage (nanoseconds → µs).
	if value, present := readTrimmed(linuxRoot + "/sys/fs/cgroup/cpu.stat"); present {
		fields := strings.Fields(value)
		for i := 0; i+1 < len(fields); i++ {
			if fields[i] == "usage_usec" {
				if usage, err := strconv.ParseUint(fields[i+1], 10, 64); err == nil {
					stats.CpuUsageSet, stats.CpuUsageMicros = true, usage
				}
			}
		}
	} else if value, present := readTrimmed(linuxRoot + "/sys/fs/cgroup/cpuacct/cpuacct.usage"); present {
		if usage, err := strconv.ParseUint(value, 10, 64); err == nil {
			stats.CpuUsageSet, stats.CpuUsageMicros = true, usage/1000
		}
	}
	// cpuset effective CPUs: v2 top-level, v1 controller directory.
	if value, present := readTrimmed(linuxRoot + "/sys/fs/cgroup/cpuset.cpus.effective"); present {
		if count, err := parseCpusetCount(value); err == nil {
			stats.CpusetSet, stats.CpusetCpus = true, count
		}
	} else if value, present := readTrimmed(linuxRoot + "/sys/fs/cgroup/cpuset/cpuset.effective_cpus"); present {
		if count, err := parseCpusetCount(value); err == nil {
			stats.CpusetSet, stats.CpusetCpus = true, count
		}
	}
	return stats
}

// parseCpusetCount counts CPUs in a cpuset mask like "0-3,8" or "0-7".
func parseCpusetCount(mask string) (int, error) {
	total := 0
	for _, part := range strings.Split(mask, ",") {
		if part == "" {
			continue
		}
		if rangeParts := strings.SplitN(part, "-", 2); len(rangeParts) == 2 {
			low, errLow := strconv.Atoi(rangeParts[0])
			high, errHigh := strconv.Atoi(rangeParts[1])
			if errLow != nil || errHigh != nil || high < low {
				return 0, fmt.Errorf("invalid cpuset range %q", part)
			}
			total += high - low + 1
			continue
		}
		if _, err := strconv.Atoi(part); err != nil {
			return 0, fmt.Errorf("invalid cpuset entry %q", part)
		}
		total++
	}
	if total == 0 {
		return 0, fmt.Errorf("empty cpuset mask")
	}
	return total, nil
}

func procOneContainerized(linuxRoot string) bool {
	data, err := os.ReadFile(filepath.Join(linuxRoot, "proc", "1", "cgroup"))
	if err != nil {
		return false
	}
	for _, marker := range []string{"docker", "kubepods", "containerd", "lxc"} {
		if bytes.Contains(data, []byte(marker)) {
			return true
		}
	}
	return false
}

func readCpuMax(linuxRoot string) (quota string, period int64, ok bool) {
	value, present := readTrimmed(linuxRoot + "/sys/fs/cgroup/cpu.max")
	if !present {
		return "", 0, false
	}
	fields := strings.Fields(value)
	if len(fields) != 2 {
		return "", 0, false
	}
	period, err := strconv.ParseInt(fields[1], 10, 64)
	return fields[0], period, err == nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func readTrimmed(path string) (string, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	value := strings.TrimSpace(string(data))
	return value, value != ""
}

func readOr(path, fallback string) string {
	if value, ok := readTrimmed(path); ok {
		return value
	}
	return fallback
}

// SampleSensors reads hardware temperatures best-effort from the Linux hwmon
// and thermal_zone sysfs interfaces; platforms without a readable sensor layer
// answer an empty slice. Implausible readings are dropped.
func SampleSensors(ctx context.Context) []SensorReading {
	if runtime.GOOS != "linux" {
		return nil
	}
	entries, err := os.ReadDir("/sys/class/hwmon")
	if err != nil {
		return nil
	}
	out := make([]SensorReading, 0, 8)
	for _, entry := range entries {
		base := "/sys/class/hwmon/" + entry.Name()
		name := readOr(base+"/name", entry.Name())
		for index := 0; index < 8 && len(out) < 8; index++ {
			value, ok := readTrimmed(fmt.Sprintf("%s/temp%d_input", base, index))
			if !ok {
				break
			}
			milli, err := strconv.ParseFloat(value, 64)
			if err != nil || milli <= 0 || milli > 150000 {
				continue
			}
			label := readOr(fmt.Sprintf("%s/temp%d_label", base, index), name)
			out = append(out, SensorReading{Label: label, Celsius: milli / 1000})
		}
		if len(out) >= 8 {
			break
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// dataDirDisks reports the volumes backing the data directory and the root,
// de-duplicated by the mountpoint gopsutil resolves for each queried path and
// by the filesystem device: the macOS root and its Data firmlink (or a bind
// mount) would otherwise present one disk as two rows.
func dataDirDisks(dataDir func() string) []HostDisk {
	type query struct {
		path string
		data bool
	}
	queries := []query{}
	if dir := dataDir(); dir != "" {
		queries = append(queries, query{dir, true})
	}
	queries = append(queries, query{"/", false})
	disks := []HostDisk{}
	seen := map[string]bool{}
	queried := []query{}
	for _, item := range queries {
		usage, err := disk.Usage(item.path)
		if err != nil || usage.Total == 0 || seen[usage.Path] {
			continue
		}
		duplicate := false
		for _, previous := range queried {
			if sameDevice(item.path, previous.path) {
				duplicate = true
				break
			}
		}
		if duplicate {
			continue
		}
		seen[usage.Path] = true
		queried = append(queried, item)
		disks = append(disks, HostDisk{Path: usage.Path, IsDataDir: item.data, TotalBytes: usage.Total, UsedBytes: usage.Used, FreeBytes: usage.Free, UsedPercent: usage.UsedPercent})
	}
	return disks
}
