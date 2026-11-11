// Author: yunnuo <ymz@ebox.vip>
// Description: Real signed token verification and PKCE failures against an isolated IdP.
package oidcadapter

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/tests/oidcfixture"
)

func TestSignedOIDC(t *testing.T) {
	p := oidcfixture.New()
	server := httptest.NewServer(p)
	defer server.Close()
	p.URL = server.URL
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid email profile", Callback: "http://127.0.0.1:12345/callback", Userinfo: true, UserinfoEmailPath: "email", UserinfoUsernamePath: "preferred_username"}
	adapter := Provider{}
	ctx := context.Background()
	endpoints, err := adapter.Check(ctx, c)
	if err != nil {
		t.Fatal(err)
	}
	if endpoints["userinfo"] != p.URL+"/userinfo" || endpoints["token"] != p.URL+"/token" {
		t.Fatal(endpoints)
	}
	// Manual overrides replace individual discovered endpoints.
	c.Manual = map[string]string{"userinfo": p.URL + "/userinfo"}
	if _, err = adapter.Check(ctx, c); err != nil {
		t.Fatal(err)
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, scenario := range []string{"success", "nonce", "issuer", "audience", "expired", "future", "signature", "azp", "missing-subject", "stale-auth", "pkce", "userinfo"} {
		t.Run(scenario, func(t *testing.T) {
			verifier := platform.Token()
			nonce := platform.Token()
			auth, err := adapter.Authorize(ctx, c, platform.Token(), nonce, verifier, true)
			if err != nil {
				t.Fatal(err)
			}
			u, _ := url.Parse(auth)
			q := u.Query()
			q.Set("approve", "yes")
			q.Set("scenario", scenario)
			u.RawQuery = q.Encode()
			resp, err := client.Get(u.String())
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			redirect, _ := url.Parse(resp.Header.Get("Location"))
			code := redirect.Query().Get("code")
			if scenario == "pkce" {
				verifier = platform.Token()
			}
			claims, err := adapter.Verify(ctx, c, code, nonce, verifier, true)
			if scenario == "success" {
				if err != nil || claims.Subject != "employee-001" || !claims.EmailVerified {
					t.Fatal(claims, err)
				}
			} else if scenario == "userinfo" {
				if err != nil || claims.Email != "userinfo@example.test" || !claims.EmailVerified || claims.Username != "userinfo-employee" {
					t.Fatal("userinfo enrichment failed", claims, err)
				}
			} else if err == nil {
				t.Fatal("invalid identity proof accepted")
			}
			if _, err = adapter.Verify(ctx, c, code, nonce, verifier, true); err == nil {
				t.Fatal("code replay accepted")
			}
		})
	}
}
func TestUnsafeEndpoints(t *testing.T) {
	for _, issuer := range []string{"http://example.test", "https://user:pass@example.test", "https://example.test/#fragment"} {
		if _, err := (Provider{}).Check(context.Background(), platform.OIDCConfig{Issuer: issuer}); err == nil {
			t.Fatal(issuer)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://example.test/discovery", 302)
	}))
	defer server.Close()
	if _, err := (Provider{}).Check(context.Background(), platform.OIDCConfig{Issuer: server.URL}); err == nil {
		t.Fatal("discovery followed redirect")
	}
}
func TestClaimPath(t *testing.T) {
	payload := map[string]any{"email": "top@example.test", "data": map[string]any{"email": "nested@example.test", "count": 3}}
	if value, ok := claimPath(payload, "email"); !ok || value != "top@example.test" {
		t.Fatal(value, ok)
	}
	if value, ok := claimPath(payload, "data.email"); !ok || value != "nested@example.test" {
		t.Fatal(value, ok)
	}
	for _, path := range []string{"", "missing", "data.count", "data.email.deep", "email.sub"} {
		if value, ok := claimPath(payload, path); ok {
			t.Fatal(path, value, ok)
		}
	}
}

// An IdP without discovery documents still works when every manual endpoint is provided.
func TestManualEndpointsWithoutDiscovery(t *testing.T) {
	p := oidcfixture.New()
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/.well-known/") {
			http.NotFound(w, r)
			return
		}
		p.ServeHTTP(w, r)
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	p.URL = server.URL
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid", Callback: "http://127.0.0.1:12345/callback", Userinfo: true, UserinfoEmailPath: "email", UserinfoUsernamePath: "preferred_username", Manual: map[string]string{"authorize": p.URL + "/authorize", "token": p.URL + "/token", "jwks": p.URL + "/jwks", "userinfo": p.URL + "/userinfo"}}
	adapter := Provider{}
	ctx := context.Background()
	endpoints, err := adapter.Check(ctx, c)
	if err != nil {
		t.Fatal("manual-only configuration rejected", err)
	}
	if endpoints["authorize"] != p.URL+"/authorize" || endpoints["jwks"] != p.URL+"/jwks" {
		t.Fatal(endpoints)
	}
	// An incomplete manual set cannot replace failed discovery.
	broken := c
	broken.Manual = map[string]string{"authorize": p.URL + "/authorize", "token": p.URL + "/token"}
	if _, err = adapter.Check(ctx, broken); err == nil {
		t.Fatal("incomplete manual configuration accepted")
	}
	verifier, nonce := platform.Token(), platform.Token()
	auth, err := adapter.Authorize(ctx, c, platform.Token(), nonce, verifier, false)
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(auth)
	q := u.Query()
	q.Set("approve", "yes")
	q.Set("scenario", "userinfo")
	u.RawQuery = q.Encode()
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Get(u.String())
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	redirect, _ := url.Parse(resp.Header.Get("Location"))
	claims, err := adapter.Verify(ctx, c, redirect.Query().Get("code"), nonce, verifier, false)
	if err != nil || claims.Email != "userinfo@example.test" || claims.Username != "userinfo-employee" {
		t.Fatal("manual endpoints failed", claims, err)
	}
}
