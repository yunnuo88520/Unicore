// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit API root registration shared by middleware and policy-protected route assembly.
package httpadapter

import (
	"context"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
)

// APIVersion registers additional module operations at an explicit version root.
// Register receives the same guarded router as v1: every leaf must have its full
// path declared in OpenAPI. Framework auth/bootstrap routes remain at v1; this
// does not clone them or rewrite incoming paths/operation identities.
type APIVersion struct {
	Root     string
	Register func(chi.Router)
}

type apiRootKey struct{}

var apiRootPattern = regexp.MustCompile(`^/api/v[1-9][0-9]*$`)

func apiVersions(config Config) []APIVersion {
	versions := []APIVersion{{Root: "/api/v1", Register: func(api chi.Router) { mountAPI(api, config) }}}
	seen := map[string]bool{"/api/v1": true}
	for _, version := range config.APIVersions {
		if !apiRootPattern.MatchString(version.Root) || version.Register == nil || seen[version.Root] {
			panic("httpadapter: API roots must be unique /api/vN paths with a registrar")
		}
		seen[version.Root] = true
		versions = append(versions, version)
	}
	return versions
}

func withAPIRoot(r *http.Request, versions []APIVersion) *http.Request {
	for _, version := range versions {
		if r.URL.Path == version.Root || strings.HasPrefix(r.URL.Path, version.Root+"/") {
			return r.WithContext(context.WithValue(r.Context(), apiRootKey{}, version.Root))
		}
	}
	return r
}

func relativeAPIPath(r *http.Request) string {
	root, _ := r.Context().Value(apiRootKey{}).(string)
	// Existing isolated handler/policy fixtures remain v1 without New's context.
	if root == "" {
		root = "/api/v1"
	}
	if !strings.HasPrefix(r.URL.Path, root+"/") {
		return ""
	}
	return strings.TrimPrefix(r.URL.Path, root)
}

func mountAPIVersions(router chi.Router, config Config, versions []APIVersion) {
	for _, version := range versions {
		router.Route(version.Root, func(api chi.Router) {
			version.Register(policyRouter{Router: api, config: config})
		})
	}
}

// RequestSession returns the principal already authenticated by the contract
// middleware, including PAT single-role restrictions. Module handlers must not
// re-resolve a Cookie and accidentally widen a Bearer request. Public/local
// operations do not necessarily have a platform session.
func RequestSession(r *http.Request) (contracts.Session, bool) {
	session, ok := r.Context().Value(policySessionKey{}).(contracts.Session)
	return session, ok
}
