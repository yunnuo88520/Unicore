// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded HTTP/DB metrics for a separate loopback listener; no raw URLs or identity labels.
package observability

import (
	"database/sql"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

type key struct {
	method, route string
	status        int
}
type sample struct {
	count   uint64
	sum     float64
	buckets [7]uint64
}

var bounds = [7]float64{0.005, 0.025, 0.1, 0.5, 1, 5, 1e100}

type Metrics struct {
	active   atomic.Int64
	mu       sync.Mutex
	requests map[key]sample
}

func New() *Metrics { return &Metrics{requests: map[key]sample{}} }
func (metrics *Metrics) Begin() func(string, string, int, time.Duration) {
	metrics.active.Add(1)
	return func(method, route string, status int, duration time.Duration) {
		metrics.active.Add(-1)
		switch method {
		case "GET", "POST", "PATCH", "DELETE", "PUT", "HEAD", "OPTIONS":
		default:
			method = "OTHER"
		}
		if route == "" {
			route = "unmatched"
		}
		metrics.mu.Lock()
		defer metrics.mu.Unlock()
		id := key{method, route, status}
		value := metrics.requests[id]
		value.count++
		value.sum += duration.Seconds()
		for index, bound := range bounds {
			if duration.Seconds() <= bound {
				value.buckets[index]++
			}
		}
		metrics.requests[id] = value
	}
}

func (metrics *Metrics) Handler(database func() *sql.DB) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprintln(w, "# TYPE unicore_http_active_requests gauge")
		fmt.Fprintf(w, "unicore_http_active_requests %d\n", metrics.active.Load())
		fmt.Fprintln(w, "# TYPE unicore_http_requests_total counter\n# TYPE unicore_http_duration_seconds histogram")
		metrics.mu.Lock()
		snapshot := make(map[key]sample, len(metrics.requests))
		for id, value := range metrics.requests {
			snapshot[id] = value
		}
		metrics.mu.Unlock()
		ids := make([]key, 0, len(snapshot))
		for id := range snapshot {
			ids = append(ids, id)
		}
		sort.Slice(ids, func(i, j int) bool { return fmt.Sprint(ids[i]) < fmt.Sprint(ids[j]) })
		for _, id := range ids {
			value := snapshot[id]
			labels := fmt.Sprintf("method=%q,route=%q,status=%q", id.method, id.route, strconv.Itoa(id.status))
			fmt.Fprintf(w, "unicore_http_requests_total{%s} %d\nunicore_http_duration_seconds_count{%s} %d\nunicore_http_duration_seconds_sum{%s} %g\n", labels, value.count, labels, value.count, labels, value.sum)
			for index, bound := range bounds {
				limit := strconv.FormatFloat(bound, 'g', -1, 64)
				if index == len(bounds)-1 {
					limit = "+Inf"
				}
				fmt.Fprintf(w, "unicore_http_duration_seconds_bucket{%s,le=%q} %d\n", labels, limit, value.buckets[index])
			}
		}
		if database != nil {
			if db := database(); db != nil {
				stats := db.Stats()
				fmt.Fprintf(w, "# TYPE unicore_db_open_connections gauge\nunicore_db_open_connections %d\n# TYPE unicore_db_in_use_connections gauge\nunicore_db_in_use_connections %d\n# TYPE unicore_db_idle_connections gauge\nunicore_db_idle_connections %d\n# TYPE unicore_db_wait_total counter\nunicore_db_wait_total %d\n# TYPE unicore_db_wait_seconds_total counter\nunicore_db_wait_seconds_total %g\n", stats.OpenConnections, stats.InUse, stats.Idle, stats.WaitCount, stats.WaitDuration.Seconds())
			}
		}
	})
}
