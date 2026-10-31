// Author: yunnuo <ymz@ebox.vip>
// Description: Actual Chi routes match OpenAPI, offline docs are gated and logs never include submitted secrets.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/observability"
	apispec "github.com/yunnuo/unicore/packages/contracts"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestActualRoutesMatchContract(t *testing.T) {
	manager, err := install.Open(context.Background(), install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	all := apispec.Operations()
	for _, full := range []bool{false, true} {
		cfg := Config{Core: bootstrap.Core(), Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
		if full {
			cfg.Install = manager
		}
		router := New(cfg)
		found := map[string]bool{}
		err := chi.Walk(router.(chi.Routes), func(method, path string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
			if !strings.HasPrefix(path, "/api/") {
				return nil
			}
			key := strings.ToLower(method) + " " + path
			if _, ok := all[key]; !ok {
				t.Errorf("undocumented handler: %s", key)
			}
			found[key] = true
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
		for key, op := range all {
			if (full || op.ID == "bootstrap" || op.ID == "liveness" || op.ID == "readiness" || op.ID == "execute") && !found[key] {
				t.Errorf("contract without handler: %s", key)
			}
		}
		if !full && len(found) != 6 {
			t.Errorf("minimal composition has %d routes", len(found))
		}
	}
}
func TestOfflineContractDocs(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		router := New(Config{Core: bootstrap.Core(), APIDocs: enabled, Assets: fstest.MapFS{"index.html": {Data: []byte("SPA")}}})
		for _, path := range []string{"/openapi.json", "/docs/api"} {
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
			if !enabled {
				if w.Code != 404 || strings.Contains(w.Body.String(), "SPA") {
					t.Fatal("disabled docs reached SPA")
				}
				continue
			}
			if w.Code != 200 {
				t.Fatal(w.Code)
			}
			if path == "/openapi.json" {
				var spec apispec.Document
				if err := json.Unmarshal(w.Body.Bytes(), &spec); err != nil || len(spec.Paths) == 0 {
					t.Fatal("invalid source contract")
				}
			} else if !strings.Contains(w.Body.String(), "API 文档") || strings.Contains(w.Body.String(), "<script") {
				t.Fatal("offline docs missing or needs scripts")
			}
		}
	}
}

type panicCore struct{}

func (panicCore) Execute(context.Context, contracts.ExecuteInput) (contracts.ExecuteOutput, error) {
	panic("do-not-log-private-input")
}
func TestSafeLogsAndMetrics(t *testing.T) {
	var logs bytes.Buffer
	metrics := observability.New()
	router := New(Config{Core: panicCore{}, Metrics: metrics, Logger: slog.New(slog.NewJSONHandler(&logs, nil))})
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{{"POST", "/api/v1/core/execute?token=private-query", `{"text":"private-body"}`, 500}, {"GET", "/api/v1/unknown-private-path", "", 404}, {"PATCH", "/api/v1/bootstrap", "", 405}} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "private-header")
		router.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("got %d %s", w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	metrics.Handler(nil).ServeHTTP(w, httptest.NewRequest("GET", "/metrics", nil))
	content := logs.String() + w.Body.String()
	for _, secret := range []string{"private-query", "private-body", "private-header", "unknown-private-path", "do-not-log"} {
		if strings.Contains(content, secret) {
			t.Fatalf("leaked %s", secret)
		}
	}
	if !strings.Contains(logs.String(), `"status":500`) || !strings.Contains(content, "/api/v1/core/execute") {
		t.Fatal("missing status or route")
	}
}
