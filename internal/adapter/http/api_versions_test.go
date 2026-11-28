// Author: yunnuo <ymz@ebox.vip>
// Description: API roots are explicit, unambiguous and always registered through the policy router.
package httpadapter

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestAPIVersionRegistration(t *testing.T) {
	for _, root := range []string{"/api/v0", "/api/v01", "/api/v2/", "/api/v2/admin", "/api/v1", "/api/{version}", "/other/v2"} {
		t.Run(root, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("ambiguous root accepted")
				}
			}()
			New(Config{APIVersions: []APIVersion{{Root: root, Register: func(chi.Router) {}}}})
		})
	}
	for _, versions := range [][]APIVersion{{{Root: "/api/v2"}}, {{Root: "/api/v2", Register: func(chi.Router) {}}, {Root: "/api/v2", Register: func(chi.Router) {}}}} {
		func() {
			defer func() {
				if recover() == nil {
					t.Error("invalid registration accepted")
				}
			}()
			New(Config{APIVersions: versions})
		}()
	}
	called := false
	router := New(Config{APIVersions: []APIVersion{{Root: "/api/v2", Register: func(api chi.Router) {
		api.Route("/module/v7", func(module chi.Router) {
			module.Get("/undeclared", func(http.ResponseWriter, *http.Request) { called = true })
		})
	}}}})
	for _, tc := range []struct {
		method, path string
		status       int
		code         string
	}{
		{"GET", "/api/v2/module/v7/undeclared", 500, "ROUTE_POLICY_UNDECLARED"},
		{"POST", "/api/v2/module/v7/undeclared", 405, "METHOD_NOT_ALLOWED"},
		{"GET", "/api/v2/unknown", 404, "NOT_FOUND"},
		{"GET", "/api/v20/module/v7/undeclared", 404, "NOT_FOUND"},
	} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(tc.method, "http://localhost"+tc.path, nil))
		if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.code) {
			t.Fatal(tc.path, w.Code, w.Body.String())
		}
	}
	if called {
		t.Fatal("uncontracted handler executed")
	}
}
