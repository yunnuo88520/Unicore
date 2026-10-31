// Author: yunnuo <ymz@ebox.vip>
// Description: Real signed token verification and PKCE failures against an isolated IdP.
package oidcadapter

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/tests/oidcfixture"
)

func TestSignedOIDC(t *testing.T) {
	p := oidcfixture.New()
	server := httptest.NewServer(p)
	defer server.Close()
	p.URL = server.URL
	c := platform.OIDCConfig{Issuer: p.URL, ClientID: oidcfixture.ClientID, ClientSecret: oidcfixture.ClientSecret, Scopes: "openid email profile", Callback: "http://127.0.0.1:12345/callback"}
	adapter := Provider{}
	ctx := context.Background()
	if err := adapter.Check(ctx, c); err != nil {
		t.Fatal(err)
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, scenario := range []string{"success", "nonce", "issuer", "audience", "expired", "future", "signature", "azp", "missing-subject", "stale-auth", "pkce"} {
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
		if err := (Provider{}).Check(context.Background(), platform.OIDCConfig{Issuer: issuer}); err == nil {
			t.Fatal(issuer)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://example.test/discovery", 302)
	}))
	defer server.Close()
	if err := (Provider{}).Check(context.Background(), platform.OIDCConfig{Issuer: server.URL}); err == nil {
		t.Fatal("discovery followed redirect")
	}
}
