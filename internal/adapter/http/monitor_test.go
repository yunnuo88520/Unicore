// Author: yunnuo <ymz@ebox.vip>
// Description: Runtime monitor boundaries: super-only on platform, local-only on standalone, profile self-checks on both.
package httpadapter

import (
	"context"
	"database/sql"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/monitor"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestMonitorEndpointPolicy(t *testing.T) {
	ctx := context.Background()
	// Platform instance: super admin passes, restricted identities and
	// anonymous callers never reach the snapshot.
	platform, e := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if e != nil {
		t.Fatal(e)
	}
	defer platform.Close()
	token, _ := os.ReadFile(platform.TokenPath())
	_, admin, e := platform.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Test", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if e != nil {
		t.Fatal(e)
	}
	_, araw, e := platform.Identity(true).Issue(ctx, admin, 1)
	if e != nil {
		t.Fatal(e)
	}
	member, e := platform.Identity(false).Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if e != nil {
		t.Fatal(e)
	}
	_, uraw, e := platform.Identity(false).Issue(ctx, member, 1)
	if e != nil {
		t.Fatal(e)
	}
	store, _, _, _ := platform.Services()
	appMonitor := monitor.New(monitor.Options{Profile: "web-platform", StartedAt: time.Now(), DB: func() *sql.DB { return store.DB }})
	router := New(Config{Core: bootstrap.Core(), Install: platform, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Monitor: appMonitor})
	request := func(path, cookie, value string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "http://localhost/api/v1"+path, nil)
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: cookie, Value: value})
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	check := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("want %d got %d %s", status, w.Code, w.Body.String())
		}
	}
	check(request("/admin/monitor", "", ""), 401)
	check(request("/admin/monitor", sessionCookie, uraw), 403)
	check(request("/admin/monitor", sessionCookie, araw), 200)
	// The standalone local view never serves the platform profile.
	check(request("/monitor", sessionCookie, araw), 404)
	check(request("/monitor", "", ""), 404)

	// Standalone instance: the local view is anonymous by design (loopback and
	// same-origin guards stay upstream), defers to the wizard before install,
	// and the platform surface is 404.
	standalone, e := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if e != nil {
		t.Fatal(e)
	}
	defer standalone.Close()
	token, _ = os.ReadFile(standalone.TokenPath())
	buildRouter := func(service *monitor.Service) http.Handler {
		return New(Config{Core: bootstrap.Core(), Install: standalone, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Monitor: service})
	}
	localRequest := func(handler http.Handler, path string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "http://localhost/api/v1"+path, nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	check(localRequest(buildRouter(monitor.New(monitor.Options{Profile: "web-standalone", StartedAt: time.Now()})), "/monitor"), 409)
	check(localRequest(buildRouter(monitor.New(monitor.Options{Profile: "web-standalone", StartedAt: time.Now()})), "/admin/monitor"), 409)
	if _, _, e = standalone.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-standalone", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Test", BaseUrl: "http://localhost"}); e != nil {
		t.Fatal(e)
	}
	localStore, _, _, _ := standalone.Services()
	installed := buildRouter(monitor.New(monitor.Options{Profile: "web-standalone", StartedAt: time.Now(), DB: func() *sql.DB { return localStore.DB }}))
	check(localRequest(installed, "/monitor"), 200)
	check(localRequest(installed, "/admin/monitor"), 404)
}
