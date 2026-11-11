// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded HTTP/DB metrics and standard Prometheus Go/process collectors for a separate loopback listener.
package observability

import (
	"database/sql"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	dto "github.com/prometheus/client_model/go"
)

type Metrics struct {
	registry *prometheus.Registry
	active   prometheus.Gauge
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
}

// HTTPStats is the in-process HTTP service view for the runtime monitor; it
// reads the same registry the loopback /metrics endpoint exposes, so both
// surfaces share one metric semantics.
type HTTPStats struct {
	ActiveRequests float64
	RequestsTotal  float64
	ErrorsTotal    float64
	AvgDurationMs  float64
	P95DurationMs  float64
}

// RuntimeStats mirrors the Go collector families plus the process collector
// when the target OS provides it; zero RSS/CPU simply means unavailable.
type RuntimeStats struct {
	Goroutines   float64
	HeapAlloc    float64
	HeapSys      float64
	GcCycles     float64
	PauseTotalMs float64
	RssBytes     float64
	CpuSeconds   float64
}

// SnapshotHTTP aggregates the bounded HTTP counters and duration histogram.
// It never fails: a broken gather simply reports zeroed traffic.
func (m *Metrics) SnapshotHTTP() HTTPStats {
	stats := HTTPStats{}
	if m == nil {
		return stats
	}
	families, err := m.registry.Gather()
	if err != nil {
		return stats
	}
	for _, family := range families {
		switch family.GetName() {
		case "unicore_http_active_requests":
			for _, metric := range family.GetMetric() {
				stats.ActiveRequests += metric.GetGauge().GetValue()
			}
		case "unicore_http_requests_total":
			for _, metric := range family.GetMetric() {
				value := metric.GetCounter().GetValue()
				stats.RequestsTotal += value
				for _, label := range metric.GetLabel() {
					if label.GetName() == "status" && strings.HasPrefix(label.GetValue(), "5") {
						stats.ErrorsTotal += value
					}
				}
			}
		case "unicore_http_duration_seconds":
			for _, metric := range family.GetMetric() {
				histogram := metric.GetHistogram()
				stats.AvgDurationMs += histogram.GetSampleSum() / math.Max(float64(histogram.GetSampleCount()), 1) * 1000
				stats.P95DurationMs += quantileSeconds(histogram, 0.95) * 1000
			}
		}
	}
	return stats
}

// SnapshotRuntime reads the standard Go collector and process collector
// families from the same registry; unknown families are skipped so the view
// degrades gracefully on OSes without process metrics.
func (m *Metrics) SnapshotRuntime() RuntimeStats {
	stats := RuntimeStats{}
	if m == nil {
		return stats
	}
	families, err := m.registry.Gather()
	if err != nil {
		return stats
	}
	for _, family := range families {
		switch family.GetName() {
		case "go_goroutines":
			for _, metric := range family.GetMetric() {
				stats.Goroutines += metric.GetGauge().GetValue()
			}
		case "go_memstats_alloc_bytes":
			for _, metric := range family.GetMetric() {
				stats.HeapAlloc += metric.GetGauge().GetValue()
			}
		case "go_memstats_sys_bytes":
			for _, metric := range family.GetMetric() {
				stats.HeapSys += metric.GetGauge().GetValue()
			}
		case "go_gc_duration_seconds":
			for _, metric := range family.GetMetric() {
				summary := metric.GetSummary()
				// SampleSum is the lifetime pause total in seconds; the
				// quantiles only expose per-window maxima.
				stats.GcCycles += float64(summary.GetSampleCount())
				stats.PauseTotalMs += summary.GetSampleSum() * 1000
			}
		case "process_resident_memory_bytes":
			for _, metric := range family.GetMetric() {
				stats.RssBytes += metric.GetGauge().GetValue()
			}
		case "process_cpu_seconds_total":
			for _, metric := range family.GetMetric() {
				stats.CpuSeconds += metric.GetCounter().GetValue()
			}
		}
	}
	return stats
}

// quantileSeconds estimates the requested quantile from the cumulative
// histogram buckets with the interpolation prometheus/client_golang uses.
// quantileSeconds estimates the requested quantile from the cumulative
// histogram buckets with the interpolation prometheus itself uses: inside the
// bucket that reaches the rank, between the previous cumulative count and
// this bucket's cumulative count (never the raw rank minus the cumulative
// count, which goes negative whenever the rank falls inside a bucket).
func quantileSeconds(histogram *dto.Histogram, q float64) float64 {
	buckets := histogram.GetBucket()
	if len(buckets) == 0 {
		return 0
	}
	total := float64(histogram.GetSampleCount())
	if total == 0 {
		return 0
	}
	rank := q * total
	var previousCount, previousUpper float64
	for _, bucket := range buckets {
		upper := bucket.GetUpperBound()
		count := float64(bucket.GetCumulativeCount())
		if count >= rank {
			if math.IsInf(upper, 1) {
				// The rank falls into the open-ended bucket; the estimate
				// cannot exceed the last finite edge.
				return previousUpper
			}
			if count == previousCount {
				return previousUpper
			}
			return previousUpper + (upper-previousUpper)*(rank-previousCount)/(count-previousCount)
		}
		previousCount = count
		if !math.IsInf(upper, 1) {
			previousUpper = upper
		}
	}
	return previousUpper
}

func New() *Metrics {
	registry := prometheus.NewRegistry()
	m := &Metrics{registry: registry,
		active:   prometheus.NewGauge(prometheus.GaugeOpts{Name: "unicore_http_active_requests", Help: "HTTP requests currently in progress."}),
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{Name: "unicore_http_requests_total", Help: "Completed HTTP requests."}, []string{"method", "route", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "unicore_http_duration_seconds", Help: "HTTP request duration in seconds.", // Buckets reach into the sub-millisecond range: local API answers in well
			// under 5ms, and a coarse first bucket turns a 0.1ms average into a ~5ms
			// P95 estimate (the interpolated quantile cannot resolve below the first
			// cumulative bucket edge).
			Buckets: []float64{0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.025, 0.1, 0.5, 1, 5}}, []string{"method", "route", "status"}),
	}
	registry.MustRegister(m.active, m.requests, m.duration, collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	return m
}

func (m *Metrics) Begin() func(string, string, int, time.Duration) {
	m.active.Inc()
	var once sync.Once
	return func(method, route string, status int, duration time.Duration) {
		once.Do(func() {
			m.active.Dec()
			switch method {
			case "GET", "POST", "PATCH", "DELETE", "PUT", "HEAD", "OPTIONS":
			default:
				method = "OTHER"
			}
			if route == "" {
				route = "unmatched"
			}
			labels := prometheus.Labels{"method": method, "route": route, "status": statusLabel(status)}
			m.requests.With(labels).Inc()
			m.duration.With(labels).Observe(duration.Seconds())
		})
	}
}

func statusLabel(status int) string {
	if status < 100 || status > 599 {
		return "unknown"
	}
	return strconv.Itoa(status)
}

func (m *Metrics) Handler(database func() *sql.DB) http.Handler {
	// Each handler has its own registry, avoiding global registrations and making
	// multiple independently configured server instances safe in tests.
	registry := prometheus.NewRegistry()
	registry.MustRegister(m.registry)
	for _, metric := range []struct {
		name, help string
		value      func(sql.DBStats) float64
		counter    bool
	}{
		{"unicore_db_open_connections", "Open database connections.", func(s sql.DBStats) float64 { return float64(s.OpenConnections) }, false},
		{"unicore_db_in_use_connections", "Database connections in use.", func(s sql.DBStats) float64 { return float64(s.InUse) }, false},
		{"unicore_db_idle_connections", "Idle database connections.", func(s sql.DBStats) float64 { return float64(s.Idle) }, false},
		{"unicore_db_wait_total", "Database connection waits.", func(s sql.DBStats) float64 { return float64(s.WaitCount) }, true},
		{"unicore_db_wait_seconds_total", "Database connection wait duration.", func(s sql.DBStats) float64 { return s.WaitDuration.Seconds() }, true},
	} {
		metric := metric
		value := func() float64 {
			if database != nil {
				if db := database(); db != nil {
					return metric.value(db.Stats())
				}
			}
			return 0
		}
		if metric.counter {
			registry.MustRegister(prometheus.NewCounterFunc(prometheus.CounterOpts{Name: metric.name, Help: metric.help}, value))
		} else {
			registry.MustRegister(prometheus.NewGaugeFunc(prometheus.GaugeOpts{Name: metric.name, Help: metric.help}, value))
		}
	}
	handler := promhttp.HandlerFor(registry, promhttp.HandlerOpts{})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		handler.ServeHTTP(w, r)
	})
}
