// Author: yunnuo <ymz@ebox.vip>
// Description: Real signed token verification and PKCE failures against an isolated IdP.
package oidcadapter

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
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

// The userinfo response must describe the same subject the verified ID token
// proved; a mismatched sub refuses the whole enrichment.
func TestUserinfoSubjectBinding(t *testing.T) {
	p := oidcfixture.New()
	server := httptest.NewServer(p)
	defer server.Close()
	p.URL = server.URL
	p.SetUserinfoSubject("someone-else")
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid email", Callback: "http://127.0.0.1:12345/callback", Userinfo: true, UserinfoEmailPath: "email", UserinfoUsernamePath: "preferred_username"}
	if _, err := verifyFixture(t, c, ""); err == nil {
		t.Fatal("userinfo subject mismatch accepted")
	}
}

// Non-default identities must keep their own subject through signed token
// verification and userinfo enrichment, even when grants finish out of order.
func TestUserinfoNonDefaultSubjects(t *testing.T) {
	p := oidcfixture.New()
	server := httptest.NewServer(p)
	defer server.Close()
	p.URL = server.URL
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid email profile", Callback: "http://127.0.0.1:12345/callback", Userinfo: true, UserinfoEmailPath: "email", UserinfoUsernamePath: "preferred_username"}
	type grant struct{ subject, code, nonce, verifier string }
	var grants []grant
	for _, subject := range []string{"employee-alice", "employee-bob", "employee-alice"} {
		code, nonce, verifier := authorizeFixture(t, c, "userinfo", subject)
		grants = append(grants, grant{subject, code, nonce, verifier})
	}
	for i := len(grants) - 1; i >= 0; i-- {
		g := grants[i]
		claims, err := (Provider{}).Verify(context.Background(), c, g.code, g.nonce, g.verifier, false)
		if err != nil {
			t.Fatal("non-default subject rejected", g.subject, err)
		}
		if claims.Subject != g.subject || claims.Issuer != p.URL || claims.Email != "userinfo@example.test" || !claims.EmailVerified || claims.Username != "userinfo-employee" {
			t.Fatal("userinfo lost identity binding or enrichment", claims)
		}
	}
}

// Malformed or unsuccessful userinfo responses fail closed, rather than
// returning either the verified ID-token identity or partial enrichment.
func TestUserinfoInvalidResponses(t *testing.T) {
	p := oidcfixture.New()
	var responseMu sync.Mutex
	var status int
	var body string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/userinfo" {
			p.ServeHTTP(w, r)
			return
		}
		// Preserve the fixture's bearer validation before replacing its payload.
		recorded := httptest.NewRecorder()
		p.ServeHTTP(recorded, r)
		if recorded.Code != http.StatusOK {
			t.Errorf("adapter supplied an invalid userinfo bearer: status %d", recorded.Code)
			http.Error(w, "invalid bearer", http.StatusUnauthorized)
			return
		}
		responseMu.Lock()
		defer responseMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	defer server.Close()
	p.URL = server.URL
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid email", Callback: "http://127.0.0.1:12345/callback", Userinfo: true, UserinfoEmailPath: "email", UserinfoUsernamePath: "preferred_username"}
	for _, tc := range []struct {
		name   string
		status int
		body   string
	}{
		{"missing-sub", http.StatusOK, `{"email":"other@example.test","email_verified":true}`},
		{"empty-sub", http.StatusOK, `{"sub":""}`},
		{"null-sub", http.StatusOK, `{"sub":null}`},
		{"numeric-sub", http.StatusOK, `{"sub":123}`},
		{"boolean-sub", http.StatusOK, `{"sub":true}`},
		{"array-sub", http.StatusOK, `{"sub":["employee-001"]}`},
		{"object-sub", http.StatusOK, `{"sub":{"value":"employee-001"}}`},
		{"mismatched-sub", http.StatusOK, `{"sub":"someone-else"}`},
		{"malformed-json", http.StatusOK, `{"sub":`},
		{"empty-body", http.StatusOK, ""},
		{"null-payload", http.StatusOK, `null`},
		{"array-payload", http.StatusOK, `[]`},
		{"unauthorized", http.StatusUnauthorized, `{"sub":"employee-001"}`},
		{"server-error", http.StatusInternalServerError, `{"sub":"employee-001"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			responseMu.Lock()
			status, body = tc.status, tc.body
			responseMu.Unlock()
			// Also reject bad userinfo when the ID token already has an email.
			for _, scenario := range []string{"userinfo", "success"} {
				t.Run(scenario, func(t *testing.T) {
					claims, err := verifyFixture(t, c, scenario)
					if !errors.Is(err, platform.ErrOIDC) {
						t.Fatalf("invalid userinfo must return ErrOIDC, got %v", err)
					}
					if claims.Subject != "" || claims.Email != "" || claims.Username != "" || claims.EmailVerified {
						t.Fatal("invalid userinfo leaked partial identity", claims)
					}
				})
			}
		})
	}
}

// A token from another valid grant still cannot enrich the current ID token.
func TestUserinfoRejectsAnotherIdentityToken(t *testing.T) {
	p := oidcfixture.New()
	var tokenMu sync.Mutex
	var aliceToken string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			recorded := httptest.NewRecorder()
			p.ServeHTTP(recorded, r)
			var payload map[string]any
			if err := json.Unmarshal(recorded.Body.Bytes(), &payload); err != nil {
				t.Error(err)
				http.Error(w, "bad fixture response", http.StatusInternalServerError)
				return
			}
			tokenMu.Lock()
			if aliceToken == "" {
				aliceToken, _ = payload["access_token"].(string)
			} else {
				payload["access_token"] = aliceToken
			}
			tokenMu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(recorded.Code)
			_ = json.NewEncoder(w).Encode(payload)
		default:
			p.ServeHTTP(w, r)
		}
	}))
	defer server.Close()
	p.URL = server.URL
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid email", Callback: "http://127.0.0.1:12345/callback", Userinfo: true, UserinfoEmailPath: "email"}
	for _, subject := range []string{"alice", "bob"} {
		code, nonce, verifier := authorizeFixture(t, c, "userinfo", subject)
		claims, err := (Provider{}).Verify(context.Background(), c, code, nonce, verifier, false)
		if subject == "alice" {
			tokenMu.Lock()
			hasToken := aliceToken != ""
			tokenMu.Unlock()
			if err != nil || claims.Subject != subject || !hasToken {
				t.Fatal("initial identity failed", claims, err)
			}
		} else if !errors.Is(err, platform.ErrOIDC) || claims.Subject != "" {
			t.Fatal("another identity's bearer accepted", claims, err)
		}
	}
}

// The verified flag never crosses sources: an unverified ID-token email stays
// unverified even when the userinfo payload asserts verification.
func TestUserinfoEmailStaysWithItsSource(t *testing.T) {
	p := oidcfixture.New()
	server := httptest.NewServer(p)
	defer server.Close()
	p.URL = server.URL
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid email", Callback: "http://127.0.0.1:12345/callback", Userinfo: true, UserinfoEmailPath: "email", UserinfoUsernamePath: "preferred_username"}
	claims, err := verifyFixture(t, c, "unverified")
	if err != nil {
		t.Fatal(err)
	}
	if claims.Email != "employee@example.test" || claims.EmailVerified {
		t.Fatal("cross-source email verification stitched", claims)
	}
}

// The token exchange must ride the bounded HTTP client: a token endpoint that
// answers with a redirect is refused instead of followed.
func TestTokenExchangeRefusesRedirects(t *testing.T) {
	p := oidcfixture.New()
	mux := http.NewServeMux()
	mux.HandleFunc("/token-redirect", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, p.URL+"/token", http.StatusTemporaryRedirect)
	})
	mux.Handle("/", p)
	server := httptest.NewServer(mux)
	defer server.Close()
	p.URL = server.URL
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid", Callback: "http://127.0.0.1:12345/callback", Manual: map[string]string{"token": p.URL + "/token-redirect"}}
	if _, err := (Provider{}).Check(context.Background(), c); err != nil {
		t.Fatal(err)
	}
	if _, err := verifyFixture(t, c, ""); err == nil {
		t.Fatal("token exchange followed a redirect")
	}
}

// An unsupported negotiated auth method list must fail resolution instead of
// silently falling back to the default style.
func TestNegotiatedAuthMethodError(t *testing.T) {
	p := oidcfixture.New()
	server := httptest.NewServer(p)
	defer server.Close()
	p.URL = server.URL
	p.SetAuthMethods([]string{"none"})
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid", Callback: "http://127.0.0.1:12345/callback"}
	if _, err := (Provider{}).Check(context.Background(), c); err == nil {
		t.Fatal("unsupported auth methods accepted")
	}
}

// verifyFixture drives the authorize/approve/redirect round trip and calls
// adapter.Verify once with the returned code.
func verifyFixture(t *testing.T, c platform.OIDCConfig, scenario string) (platform.OIDCClaims, error) {
	t.Helper()
	code, nonce, verifier := authorizeFixture(t, c, scenario, "")
	return (Provider{}).Verify(context.Background(), c, code, nonce, verifier, false)
}

// authorizeFixture leaves the grant unexchanged so tests can interleave identities.
func authorizeFixture(t *testing.T, c platform.OIDCConfig, scenario, subject string) (string, string, string) {
	t.Helper()
	adapter := Provider{}
	ctx := context.Background()
	verifier, nonce := platform.Token(), platform.Token()
	auth, err := adapter.Authorize(ctx, c, platform.Token(), nonce, verifier, false)
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(auth)
	q := u.Query()
	q.Set("approve", "yes")
	if scenario != "" {
		q.Set("scenario", scenario)
	}
	if subject != "" {
		q.Set("subject", subject)
	}
	u.RawQuery = q.Encode()
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Get(u.String())
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("authorization status %d", resp.StatusCode)
	}
	redirect, err := url.Parse(resp.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	code := redirect.Query().Get("code")
	if code == "" {
		t.Fatal("authorization returned no code")
	}
	return code, nonce, verifier
}
