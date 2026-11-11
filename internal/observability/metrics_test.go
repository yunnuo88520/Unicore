// Author: yunnuo <ymz@ebox.vip>
// Description: Parse standard Prometheus exposition and verify bounded request accounting and runtime collectors.
package observability

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/common/expfmt"
	"github.com/prometheus/common/model"
)

func TestMetrics(t *testing.T) {
	metrics := New()
	done := metrics.Begin()
	w := httptest.NewRecorder()
	handler := metrics.Handler(nil)
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/metrics", nil))
	if !strings.Contains(w.Body.String(), "unicore_http_active_requests 1") {
		t.Fatal(w.Body.String())
	}
	done("UNTRUSTED", "", 404, 20*time.Millisecond)
	done("GET", "ignored", 200, time.Hour) // Completion callbacks are idempotent.
	metrics.Begin()("GET", "/api/v1/admin/users/{id}", 200, time.Second)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/metrics", nil))
	text := w.Body.String()
	if strings.Contains(text, "UNTRUSTED") || strings.Contains(text, "ignored") {
		t.Fatal("unbounded or duplicate labels")
	}
	parser := expfmt.NewTextParser(model.LegacyValidation)
	families, err := parser.TextToMetricFamilies(strings.NewReader(text))
	if err != nil {
		t.Fatal("invalid Prometheus exposition", err)
	}
	for _, name := range []string{"go_goroutines", "go_gc_duration_seconds", "go_memstats_alloc_bytes", "go_info", "process_start_time_seconds", "unicore_db_wait_total", "unicore_http_requests_total"} {
		if families[name] == nil {
			t.Errorf("missing collector %s", name)
		}
	}
	if got := families["unicore_http_active_requests"].Metric[0].Gauge.GetValue(); got != 0 {
		t.Fatal(got)
	}
	var other bool
	for _, metric := range families["unicore_http_duration_seconds"].Metric {
		for _, label := range metric.Label {
			if label.GetName() == "method" && label.GetValue() == "OTHER" {
				other = true
				if metric.Histogram.GetSampleCount() != 1 {
					t.Fatal(metric)
				}
				var bucket bool
				for _, b := range metric.Histogram.Bucket {
					if b.GetUpperBound() == 0.025 && b.GetCumulativeCount() == 1 {
						bucket = true
					}
				}
				if !bucket {
					t.Fatal("duration buckets", metric)
				}
			}
		}
	}
	if !other {
		t.Fatal("missing bounded method metric")
	}
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("POST", "/metrics", nil))
	if w.Code != 405 || w.Header().Get("Allow") != "GET" {
		t.Fatal(w.Code, w.Header())
	}
}

// TestSnapshotHTTPP95StaysNearAverage guards the histogram fidelity: forty
// ~0.1ms answers must not read as a ~5ms P95 (the old first-bucket edge).
func TestSnapshotHTTPP95StaysNearAverage(t *testing.T) {
	m := New()
	for i := 0; i < 40; i++ {
		done := m.Begin()
		done("GET", "/api/v1/health/live", 200, 100*time.Microsecond)
	}
	stats := m.SnapshotHTTP()
	if stats.RequestsTotal != 40 || stats.ErrorsTotal != 0 {
		t.Fatalf("request counters drifted: %+v", stats)
	}
	if stats.AvgDurationMs <= 0 || stats.AvgDurationMs > 1 {
		t.Fatalf("average should sit near 0.1ms, got %v", stats.AvgDurationMs)
	}
	if stats.P95DurationMs <= 0 || stats.P95DurationMs > 2 {
		t.Fatalf("P95 must resolve inside the fine buckets, got %v (avg %v)", stats.P95DurationMs, stats.AvgDurationMs)
	}
	if stats.P95DurationMs > stats.AvgDurationMs*30 {
		t.Fatalf("P95 inflation against average looks like bucket distortion: p95=%v avg=%v", stats.P95DurationMs, stats.AvgDurationMs)
	}
}
