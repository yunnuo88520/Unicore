// Author: yunnuo <ymz@ebox.vip>
// Description: Exported-source integration fixture compiled only with its temporary v2 OpenAPI operations.
//go:build api_root_fixture

package httpadapter

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	apispec "github.com/yunnuo/unicore/packages/contracts"
)

func TestRegisteredAPIRootContractFixture(t *testing.T) {
	manager, adminRaw, memberRaw := newPolicyFixture(t)
	_, settings, identity, _ := manager.Services()
	admin, err := identity.Session(t.Context(), adminRaw)
	if err != nil {
		t.Fatal(err)
	}
	member, err := identity.Session(t.Context(), memberRaw)
	if err != nil {
		t.Fatal(err)
	}
	ops := []string{"fixtureV2Read", "fixtureV2Write"}
	role, err := identity.Store.CreateRole(t.Context(), contracts.RoleSaveInput{Name: "Version fixture", Permissions: []string{"notes:access", "notes:update"}, OperationIds: &ops}, admin.User.ID)
	if err != nil {
		t.Fatal(err)
	}
	roles := []string{role.ID}
	updated, err := identity.Store.UpdateUser(t.Context(), member.User.ID, contracts.UserUpdate{Status: "active", RoleIds: &roles}, admin.User.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, memberRaw, err = identity.Issue(t.Context(), updated, 1)
	if err != nil {
		t.Fatal(err)
	}
	pat, err := identity.Tokens.CreatePAT(t.Context(), memberRaw, contracts.PersonalTokenInput{Name: "V2 scoped", RoleID: role.ID, ExpiresInDays: 1})
	if err != nil {
		t.Fatal(err)
	}
	config := Config{Core: bootstrap.Core(), Install: manager, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	called := 0
	handler := func(w http.ResponseWriter, r *http.Request) {
		called++
		if strings.HasSuffix(r.URL.Path, "/probe") {
			session, ok := RequestSession(r)
			if !ok || session.User.ID == "" {
				t.Fatal("module did not receive authenticated principal")
			}
		}
		meta, _ := audit.From(r.Context())
		writeJSON(w, 200, map[string]string{"realm": meta.Realm, "target": meta.Target})
	}
	config.APIVersions = []APIVersion{{Root: "/api/v2", Register: func(api chi.Router) {
		api.Group(func(group chi.Router) { group.Get("/probe", handler); group.Post("/probe", handler) })
		child := newPolicyRouter(config)
		child.Get("/probe", handler)
		api.Mount("/admin", child)
		api.Get("/health/live", handler)
		api.Get("/bootstrap", handler)
		api.Get("/standalone", handler)
		api.Post("/auth/login", handler)
		api.Get("/account/tokens", handler)
		api.Get("/undeclared", handler)
	}}}
	root := New(config)
	request := func(method, path, cookie, bearer, origin string, csrf bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://localhost"+path, nil)
		r.RemoteAddr = "192.0.2.73:1234"
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: sessionCookie, Value: cookie})
		}
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if csrf {
			r.Header.Set("X-CSRF-Token", platform.CSRF(cookie))
		}
		w := httptest.NewRecorder()
		root.ServeHTTP(w, r)
		return w
	}
	for _, tc := range []struct {
		name, method, path, cookie, bearer, origin string
		csrf                                       bool
		status                                     int
		code                                       string
	}{
		{"anonymous", "GET", "/api/v2/probe", "", "", "", false, 401, "AUTH_REQUIRED"},
		{"member read", "GET", "/api/v2/probe", memberRaw, "", "", false, 200, "user"},
		{"admin realm", "GET", "/api/v2/admin/probe", adminRaw, "", "", false, 200, "administrator"},
		{"missing permission", "GET", "/api/v2/admin/probe", memberRaw, "", "", false, 403, "PERMISSION_DENIED"},
		{"csrf", "POST", "/api/v2/probe", memberRaw, "", "", false, 403, "CSRF_INVALID"},
		{"authorized write", "POST", "/api/v2/probe", memberRaw, "", "", true, 200, "user"},
		{"origin", "POST", "/api/v2/probe", memberRaw, "", "https://foreign.example", true, 403, "ORIGIN_REJECTED"},
		{"PAT operation", "GET", "/api/v2/probe", "", pat.Token, "", false, 200, "user"},
		{"PAT no operation", "GET", "/api/v2/admin/probe", "", pat.Token, "", false, 403, "PERMISSION_DENIED"},
		{"PAT credential path", "GET", "/api/v2/account/tokens", "", pat.Token, "", false, 403, "PERMISSION_DENIED"},
		{"profile", "GET", "/api/v2/standalone", "", "", "", false, 404, "NOT_FOUND"},
		{"unknown version", "GET", "/api/v3/probe", "", "", "", false, 404, "NOT_FOUND"},
		{"unknown path", "GET", "/api/v2/missing", "", "", "", false, 404, "NOT_FOUND"},
		{"wrong method", "DELETE", "/api/v2/probe", "", "", "", false, 405, "METHOD_NOT_ALLOWED"},
		{"undeclared", "GET", "/api/v2/undeclared", "", "", "", false, 500, "ROUTE_POLICY_UNDECLARED"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := called
			w := request(tc.method, tc.path, tc.cookie, tc.bearer, tc.origin, tc.csrf)
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.code) {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
			if w.Header().Get("X-Request-ID") == "" || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("missing shared response protections")
			}
			if tc.status != 200 && called != before {
				t.Fatal("rejected handler executed")
			}
		})
	}
	if _, err = settings.Patch(t.Context(), contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "maintenance.enabled", Value: "true"}}}, admin.User.ID); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/v1/notes", "/api/v2/probe"} {
		w := request("GET", path, memberRaw, "", "", false)
		if w.Code != 503 || !strings.Contains(w.Body.String(), "MAINTENANCE_MODE") || w.Header().Get("Retry-After") != "60" {
			t.Fatal(path, w.Code, w.Body.String())
		}
	}
	for _, path := range []string{"/api/v1/bootstrap", "/api/v1/health/live", "/api/v2/bootstrap", "/api/v2/health/live", "/api/v2/admin/probe"} {
		w := request("GET", path, adminRaw, "", "", false)
		if w.Code != 200 {
			t.Fatal("recovery exception", path, w.Code, w.Body.String())
		}
	}
	w := request("GET", "/api/v3/probe", "", "", "", false)
	if w.Code != 404 {
		t.Fatal("unknown version intercepted by maintenance", w.Code)
	}
	if _, err = settings.Patch(t.Context(), contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "maintenance.enabled", Value: "false"}}}, admin.User.ID); err != nil {
		t.Fatal(err)
	}
	// Failed v1 login proofs ban the same IP at the newly registered root too.
	for range 5 {
		_, _, _ = identity.Login(t.Context(), contracts.LoginInput{Username: member.User.Username, Password: "wrong"}, "192.0.2.73", false, false, 1)
	}
	w = request("POST", "/api/v2/auth/login", "", "", "", false)
	if w.Code != 429 {
		t.Fatal("new root bypassed login throttle", w.Code, w.Body.String())
	}
	// Compare full routes with the temporary contract, without a v1 prefix graft.
	registered := map[string]bool{}
	if err = chi.Walk(root.(chi.Router), func(method, path string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if strings.HasPrefix(path, "/api/") && path != "/api/v2/undeclared" {
			if method == "HEAD" {
				method = "GET"
			}
			registered[strings.ToLower(method)+" "+path] = true
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for key := range apispec.Operations() {
		if !registered[key] {
			t.Error("contract without route", key)
		}
	}
	for key := range registered {
		parts := strings.SplitN(key, " ", 2)
		if _, ok := apispec.Lookup(parts[0], parts[1]); !ok {
			t.Error("route without contract", key)
		}
	}
}
