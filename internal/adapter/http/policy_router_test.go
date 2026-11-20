// Author: yunnuo <ymz@ebox.vip>
// Description: Chi registration and composition retain leaf policy checks and native routing error semantics.
package httpadapter

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func policyTestConfig() Config {
	return Config{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

func TestPolicyChainedRegistrationSurfaces(t *testing.T) {
	registrations := []struct {
		name, method string
		register     func(chi.Router, string, http.HandlerFunc)
	}{
		{"Get", "GET", chi.Router.Get},
		{"Post", "POST", chi.Router.Post},
		{"Put", "PUT", chi.Router.Put},
		{"Patch", "PATCH", chi.Router.Patch},
		{"Delete", "DELETE", chi.Router.Delete},
		{"Head", "HEAD", chi.Router.Head},
		{"Connect", "CONNECT", chi.Router.Connect},
		{"Options", "OPTIONS", chi.Router.Options},
		{"Query", "QUERY", chi.Router.Query},
		{"Trace", "TRACE", chi.Router.Trace},
		{"Method", "QUERY", func(r chi.Router, p string, h http.HandlerFunc) { r.Method("QUERY", p, h) }},
		{"MethodFunc", "QUERY", func(r chi.Router, p string, h http.HandlerFunc) { r.MethodFunc("QUERY", p, h) }},
		{"Handle", "GET", func(r chi.Router, p string, h http.HandlerFunc) { r.Handle(p, h) }},
		{"HandleFunc", "GET", chi.Router.HandleFunc},
	}
	compositions := []struct {
		name    string
		compose func(chi.Router, func(chi.Router))
	}{
		{"direct", func(r chi.Router, register func(chi.Router)) { register(r) }},
		{"With", func(r chi.Router, register func(chi.Router)) { register(r.With().With()) }},
		{"GroupCallback", func(r chi.Router, register func(chi.Router)) { r.Group(register) }},
		{"GroupReturn", func(r chi.Router, register func(chi.Router)) { register(r.Group(func(chi.Router) {})) }},
		{"GroupNil", func(r chi.Router, register func(chi.Router)) { register(r.Group(nil)) }},
		{"RouteCallback", func(r chi.Router, register func(chi.Router)) { r.Route("/nested", register) }},
		{"RouteReturn", func(r chi.Router, register func(chi.Router)) { register(r.Route("/nested", func(chi.Router) {})) }},
		{"mixed", func(r chi.Router, register func(chi.Router)) {
			register(r.With().Route("/nested", func(chi.Router) {}).Group(nil).With())
		}},
	}
	for _, composition := range compositions {
		for _, registration := range registrations {
			t.Run(composition.name+"/"+registration.name, func(t *testing.T) {
				root := newPolicyRouter(policyTestConfig())
				called := false
				composition.compose(root, func(r chi.Router) {
					registration.register(r, "/undeclared", func(http.ResponseWriter, *http.Request) { called = true })
				})
				path := "/undeclared"
				if strings.Contains(composition.name, "Route") || composition.name == "mixed" {
					path = "/nested" + path
				}
				w := httptest.NewRecorder()
				root.ServeHTTP(w, httptest.NewRequest(registration.method, path, nil))
				if w.Code != 500 || !strings.Contains(w.Body.String(), "ROUTE_POLICY_UNDECLARED") || called {
					t.Fatalf("want undeclared 500 without handler execution, got %d %s called=%v", w.Code, w.Body.String(), called)
				}
			})
		}
	}
}

func TestPolicyRouteNilMatchesChi(t *testing.T) {
	for _, guarded := range []bool{false, true} {
		t.Run(map[bool]string{false: "chi", true: "policy"}[guarded], func(t *testing.T) {
			var r chi.Router = chi.NewRouter()
			if guarded {
				r = newPolicyRouter(policyTestConfig())
			}
			func() {
				defer func() {
					if recover() == nil {
						t.Error("Route(nil) must panic")
					}
				}()
				r.Route("/nil", nil)
			}()
			if len(r.Routes()) != 0 {
				t.Fatal("Route(nil) registered routes before panicking")
			}
		})
	}
}

func TestPolicyControlledMountEnforcesLeaves(t *testing.T) {
	manager, adminRaw, memberRaw := newPolicyFixture(t)
	config := policyTestConfig()
	config.Install = manager
	root, api, admin := newPolicyRouter(config), newPolicyRouter(config), newPolicyRouter(config)
	called := 0
	admin.Get("/announcements", func(w http.ResponseWriter, r *http.Request) {
		if chi.RouteContext(r.Context()).RoutePattern() != "/api/v1/admin/announcements" {
			t.Error("incomplete leaf route pattern")
		}
		called++
		w.WriteHeader(200)
	})
	admin.Get("/undeclared", func(http.ResponseWriter, *http.Request) { t.Error("undeclared mounted handler executed") })
	api.Mount("/admin", admin)
	root.Mount("/api/v1", api)
	for _, tc := range []struct {
		name, token string
		status      int
	}{
		{"anonymous", "", 401}, {"member", memberRaw, 403}, {"admin", adminRaw, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/api/v1/admin/announcements", nil)
			if tc.token != "" {
				r.AddCookie(&http.Cookie{Name: sessionCookie, Value: tc.token})
			}
			w := httptest.NewRecorder()
			root.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("want %d got %d %s", tc.status, w.Code, w.Body.String())
			}
		})
	}
	if called != 1 {
		t.Fatalf("protected handler called %d times", called)
	}
	w := httptest.NewRecorder()
	root.ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/admin/undeclared", nil))
	if w.Code != 500 || !strings.Contains(w.Body.String(), "ROUTE_POLICY_UNDECLARED") {
		t.Fatalf("undeclared: %d %s", w.Code, w.Body.String())
	}
	routes := []string{}
	if err := chi.Walk(root, func(method, path string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		routes = append(routes, method+" "+path)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if len(routes) != 2 {
		t.Fatalf("mount traversal lost leaves: %v", routes)
	}
}

func TestPolicyMountRejectsOpaqueHandlers(t *testing.T) {
	config := policyTestConfig()
	controlled := newPolicyRouter(config)
	for _, tc := range []struct {
		name    string
		handler http.Handler
	}{
		{"raw mux", chi.NewRouter()},
		{"opaque", http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("opaque handler executed") })},
		{"nil", nil},
		{"inline", controlled.With()},
		{"group", controlled.Group(nil)},
		{"uncontrolled wrapper", policyRouter{Router: chi.NewRouter(), config: config}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := newPolicyRouter(config)
			func() {
				defer func() {
					if recover() == nil {
						t.Error("Mount must reject uncontrolled handler at assembly time")
					}
				}()
				root.Mount("/opaque", tc.handler)
			}()
			if len(root.Routes()) != 0 {
				t.Fatal("rejected Mount modified routing tree")
			}
		})
	}
}

func TestPolicyRoutingErrorsMatchChi(t *testing.T) {
	for _, timing := range []string{"default", "before", "after"} {
		for _, childOverride := range []bool{false, true} {
			t.Run(timing+map[bool]string{false: "/inherited", true: "/child"}[childOverride], func(t *testing.T) {
				build := func(guarded bool) chi.Router {
					newRouter := func() chi.Router {
						if guarded {
							return newPolicyRouter(policyTestConfig())
						}
						return chi.NewRouter()
					}
					root, child, leaf := newRouter(), newRouter(), newRouter()
					errors := func(r chi.Router, marker string) {
						r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
							w.Header().Set("X-Error", marker)
							http.Error(w, marker+" missing", 404)
						})
						r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
							w.Header().Set("X-Error", marker)
							http.Error(w, marker+" method", 405)
						})
					}
					if timing == "before" {
						errors(root, "parent")
					}
					if childOverride {
						errors(child, "child")
					}
					leaf.Get("/live", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) })
					child.Mount("/health", leaf)
					root.Mount("/api/v1", child)
					if timing == "after" {
						errors(root, "parent")
					}
					return root
				}
				raw, guarded := build(false), build(true)
				for _, req := range [][2]string{{"GET", "/missing"}, {"GET", "/api/v1/missing"}, {"GET", "/api/v1/health/missing"}, {"POST", "/api/v1/health/live"}, {"GET", "/api/v1/health/live"}} {
					baseline, actual := httptest.NewRecorder(), httptest.NewRecorder()
					raw.ServeHTTP(baseline, httptest.NewRequest(req[0], req[1], nil))
					guarded.ServeHTTP(actual, httptest.NewRequest(req[0], req[1], nil))
					if baseline.Code != actual.Code || baseline.Body.String() != actual.Body.String() || !reflect.DeepEqual(baseline.Header(), actual.Header()) {
						t.Fatalf("%v: chi=%d %q %v, policy=%d %q %v", req, baseline.Code, baseline.Body.String(), baseline.Header(), actual.Code, actual.Body.String(), actual.Header())
					}
				}
			})
		}
	}
}
