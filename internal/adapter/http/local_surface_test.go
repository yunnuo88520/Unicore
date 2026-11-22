// Author: yunnuo <ymz@ebox.vip>
// Description: Revised decision D3: standalone local surfaces (settings, monitor, core execution, inbox, events) require a loopback Host and TCP peer.
package httpadapter

import (
	"bytes"
	"context"
	"database/sql"
	"io"
	"log/slog"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/monitor"
	"github.com/yunnuo/unicore/internal/realtime"
)

func TestStandaloneLocalSurfaceLoopback(t *testing.T) {
	ctx := context.Background()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir(), Profile: "web-standalone"})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	token, err := os.ReadFile(manager.TokenPath())
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err = manager.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-standalone", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Local", BaseUrl: "http://localhost"}); err != nil {
		t.Fatal(err)
	}
	store, _, _, _ := manager.Services()
	hub := realtime.New()
	defer hub.Close()
	router := New(Config{Core: bootstrap.Core(), Install: manager, Hub: hub, Monitor: monitor.New(monitor.Options{Profile: "web-standalone", StartedAt: time.Now(), DB: func() *sql.DB { return store.DB }}), Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	for _, tc := range []struct {
		method, path, host, peer, body string
		status                         int
	}{
		{"GET", "/settings", "localhost", "127.0.0.1:1234", "", 200},
		{"GET", "/settings", "localhost", "10.0.0.2:1234", "", 403},
		{"GET", "/settings", "settings.example", "127.0.0.1:1234", "", 403},
		{"PATCH", "/settings", "localhost", "10.0.0.2:1234", "{}", 403},
		{"GET", "/monitor", "localhost", "127.0.0.1:1234", "", 200},
		{"GET", "/monitor", "localhost", "10.0.0.2:1234", "", 403},
		{"GET", "/monitor/events", "localhost", "10.0.0.2:1234", "", 403},
		{"POST", "/core/execute", "localhost", "127.0.0.1:1234", `{"text":"loopback"}`, 200},
		{"POST", "/core/execute", "localhost", "10.0.0.2:1234", `{"text":"loopback"}`, 403},
		{"GET", "/inbox", "localhost", "127.0.0.1:1234", "", 200},
		{"GET", "/inbox", "localhost", "10.0.0.2:1234", "", 403},
		// The SSE stream is only checked on the rejection path: a loopback
		// recorder never disconnects, so the success case belongs to the
		// shared coreAccess coverage above.
		{"GET", "/events", "localhost", "10.0.0.2:1234", "", 403},
	} {
		r := httptest.NewRequest(tc.method, "http://"+tc.host+"/api/v1"+tc.path, bytes.NewReader([]byte(tc.body)))
		r.RemoteAddr = tc.peer
		if tc.body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%s %s host=%s peer=%s: want %d got %d %s", tc.method, tc.path, tc.host, tc.peer, tc.status, w.Code, w.Body.String())
		}
	}
}
