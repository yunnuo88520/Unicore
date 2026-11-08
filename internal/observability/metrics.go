// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded HTTP/DB metrics and standard Prometheus Go/process collectors for a separate loopback listener.
package observability

import (
	"database/sql"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
	registry *prometheus.Registry
	active   prometheus.Gauge
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
}

func New() *Metrics {
	registry := prometheus.NewRegistry()
	m := &Metrics{registry: registry,
		active:   prometheus.NewGauge(prometheus.GaugeOpts{Name: "unicore_http_active_requests", Help: "HTTP requests currently in progress."}),
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{Name: "unicore_http_requests_total", Help: "Completed HTTP requests."}, []string{"method", "route", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "unicore_http_duration_seconds", Help: "HTTP request duration in seconds.", Buckets: []float64{0.005, 0.025, 0.1, 0.5, 1, 5}}, []string{"method", "route", "status"}),
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
