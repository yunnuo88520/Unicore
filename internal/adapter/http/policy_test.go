// Author: yunnuo <ymz@ebox.vip>
// Description: The contract policy middleware refuses undeclared routes and enforces declared permissions even when a handler forgets require().
package httpadapter

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/runtime"
	apispec "github.com/yunnuo/unicore/packages/contracts"
)

func newPolicyFixture(t *testing.T) (*install.Manager, string, string) {
	t.Helper()
	ctx := context.Background()
	manager, e := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { manager.Close() })
	token, _ := os.ReadFile(manager.TokenPath())
	_, admin, e := manager.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Policy", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if e != nil {
		t.Fatal(e)
	}
	_, adminRaw, e := manager.Identity(true).Issue(ctx, admin, 1)
	if e != nil {
		t.Fatal(e)
	}
	_, _, identity, _ := manager.Services()
	member, e := identity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if e != nil {
		t.Fatal(e)
	}
	_, memberRaw, _ := identity.Issue(ctx, member, 1)
	return manager, adminRaw, memberRaw
}

func TestPolicyRefusesUndeclaredRoutes(t *testing.T) {
	manager, _, _ := newPolicyFixture(t)
	config := Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "development"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	root := chi.NewRouter()
	root.Route("/api/v1", func(api chi.Router) {
		guarded := policyRouter{Router: api, config: config}
		guarded.Get("/undeclared", func(w http.ResponseWriter, r *http.Request) {
			t.Fatal("undeclared route must never serve")
		})
	})
	w := httptest.NewRecorder()
	root.ServeHTTP(w, httptest.NewRequest("GET", "http://localhost/api/v1/undeclared", nil))
	var response contracts.ErrorResponse
	_ = json.Unmarshal(w.Body.Bytes(), &response)
	if w.Code != 500 || response.Code != "ROUTE_POLICY_UNDECLARED" {
		t.Fatalf("want 500 ROUTE_POLICY_UNDECLARED, got %d %s", w.Code, w.Body.String())
	}
}

func TestAPIRoutesMatchContract(t *testing.T) {
	manager, _, _ := newPolicyFixture(t)
	config := Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "development"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	root := chi.NewRouter()
	var api chi.Router
	root.Route("/api/v1", func(sub chi.Router) {
		api = sub
		mountAPI(sub, config)
	})
	registered := map[string]bool{}
	if e := chi.Walk(api, func(method, pattern string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method == "HEAD" {
			// HEAD rides on the GET declaration.
			method = "GET"
		}
		registered[strings.ToLower(method)+" /api/v1"+pattern] = true
		return nil
	}); e != nil {
		t.Fatal(e)
	}
	declared := map[string]bool{}
	for key := range apispec.Operations() {
		declared[key] = true
	}
	for route := range registered {
		if !declared[route] {
			t.Errorf("route registered but not declared in the contract: %s", route)
		}
	}
	for route := range declared {
		if !registered[route] {
			t.Errorf("operation declared in the contract but no route serves it: %s", route)
		}
	}
}

func TestPolicyEnforcesWithoutRequire(t *testing.T) {
	manager, adminRaw, memberRaw := newPolicyFixture(t)
	config := Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "development"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	root := chi.NewRouter()
	root.Route("/api/v1", func(api chi.Router) {
		guarded := policyRouter{Router: api, config: config}
		// A handler that forgot require() entirely: the middleware alone must
		// still refuse anonymous and under-privileged callers.
		guarded.Get("/admin/announcements", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
		})
	})
	request := func(cookie *http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "http://localhost/api/v1/admin/announcements", nil)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		root.ServeHTTP(w, r)
		return w
	}
	if w := request(nil); w.Code != 401 {
		t.Fatalf("anonymous: want 401, got %d %s", w.Code, w.Body.String())
	}
	if w := request(&http.Cookie{Name: sessionCookie, Value: memberRaw}); w.Code != 403 {
		t.Fatalf("member: want 403, got %d %s", w.Code, w.Body.String())
	}
	if w := request(&http.Cookie{Name: administratorSessionCookie, Value: adminRaw}); w.Code != 200 {
		t.Fatalf("super admin: want 200, got %d %s", w.Code, w.Body.String())
	}
}
