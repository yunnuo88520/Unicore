// Author: yunnuo <ymz@ebox.vip>
// Description: Prometheus counters/histograms remain consistent and unknown methods stay bounded.
package observability

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMetrics(t *testing.T) {
	metrics := New()
	done := metrics.Begin()
	w := httptest.NewRecorder()
	metrics.Handler(nil).ServeHTTP(w, httptest.NewRequest("GET", "/metrics", nil))
	if !strings.Contains(w.Body.String(), "unicore_http_active_requests 1") {
		t.Fatal(w.Body.String())
	}
	done("UNTRUSTED", "", 404, 20*time.Millisecond)
	done = metrics.Begin()
	done("GET", "/api/v1/admin/users/{id}", 200, time.Second)
	w = httptest.NewRecorder()
	metrics.Handler(nil).ServeHTTP(w, httptest.NewRequest("GET", "/metrics", nil))
	text := w.Body.String()
	for _, expected := range []string{"unicore_http_active_requests 0", `method="OTHER",route="unmatched",status="404"`, `unicore_http_duration_seconds_bucket{method="OTHER",route="unmatched",status="404",le="0.025"} 1`, `le="+Inf"} 1`} {
		if !strings.Contains(text, expected) {
			t.Errorf("missing %s: %s", expected, text)
		}
	}
	if strings.Contains(text, "UNTRUSTED") {
		t.Fatal("unbounded method label")
	}
}
