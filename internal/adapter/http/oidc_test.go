// Author: yunnuo <ymz@ebox.vip>
// Description: Real HTTP OIDC callbacks and authorization boundaries without external services.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/yunnuo/unicore/internal/platform"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/tests/oidcfixture"
)

func TestOIDCHTTP(t *testing.T) {
	ctx := context.Background()
	m, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	bootstrapToken, _ := os.ReadFile(m.TokenPath())
	_, admin, err := m.Complete(ctx, strings.TrimSpace(string(bootstrapToken)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "OIDC test", BaseUrl: "http://127.0.0.1", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	p := oidcfixture.New()
	idp := httptest.NewServer(p)
	defer idp.Close()
	p.URL = idp.URL
	_, settings, identity, _ := m.Services()
	_, err = settings.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "oidc.issuer", Value: p.URL}, {Key: "oidc.client_id", Value: oidcfixture.ClientID}, {Key: "oidc.client_secret", Value: oidcfixture.ClientSecret}, {Key: "oidc.enabled", Value: "true"}, {Key: "oidc.jit_enabled", Value: "true"}}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	adminSession, raw, err := m.Identity(true).Issue(ctx, admin, 1)
	if err != nil {
		t.Fatal(err)
	}
	router := New(Config{Core: bootstrap.Core(), Install: m, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, input any, session, csrf, proof, origin string) *httptest.ResponseRecorder {
		if session == raw && !strings.HasPrefix(path, "/admin/") {
			path = "/admin" + path
		}
		data, _ := json.Marshal(input)
		req := httptest.NewRequest(method, "http://localhost/api/v1"+path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		if session != "" {
			name := sessionCookie
			if session == raw {
				name = "unicore_administrator_session"

			}
			req.AddCookie(&http.Cookie{Name: name, Value: session})
		}
		if proof != "" {
			req.AddCookie(&http.Cookie{Name: oidcCookie, Value: proof})
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	assert := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("status %d: %s", w.Code, w.Body.String())
		}
	}
	assert(request("GET", "/account/oidc", nil, "", "", "", ""), 401)
	assert(request("POST", "/account/oidc/link", contracts.OIDCPasswordInput{Password: "test-password-strong"}, raw, "", "", ""), 403)
	assert(request("POST", "/auth/oidc/start", nil, "", "", "", "https://evil.example.test"), 403)
	assert(request("POST", "/account/oidc/link", contracts.OIDCPasswordInput{Password: "wrong-password"}, raw, adminSession.CsrfToken, "", ""), 401)
	member, err := identity.Create(ctx, contracts.UserCreate{Username: "oidcmember", Email: "oidcmember@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	memberSession, memberRaw, err := identity.Issue(ctx, member, 1)
	if err != nil {
		t.Fatal(err)
	}
	assert(request("POST", "/admin/settings/oidc/check", nil, memberRaw, memberSession.CsrfToken, "", ""), 403)
	assert(request("POST", "/admin/settings/oidc/check", nil, raw, adminSession.CsrfToken, "", ""), 200)
	masked := request("GET", "/admin/settings", nil, raw, "", "", "")
	assert(masked, 200)
	if strings.Contains(masked.Body.String(), oidcfixture.ClientSecret) {
		t.Fatal("secret leaked")
	}
	start := func() (string, string) {
		t.Helper()
		w := request("POST", "/auth/oidc/start", nil, "", "", "", "")
		assert(w, 200)
		var result contracts.OIDCStartResponse
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		proof := ""
		for _, c := range w.Result().Cookies() {
			if c.Name == oidcCookie {
				proof = c.Value
				if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.Path != "/api/v1/auth/oidc/callback" {
					t.Fatal("unsafe proof cookie")
				}
			}
		}
		return result.Data.AuthorizationUrl, proof
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	callback := func(auth string) string {
		u, _ := url.Parse(auth)
		q := u.Query()
		q.Set("approve", "yes")
		u.RawQuery = q.Encode()
		response, err := client.Get(u.String())
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		u, _ = url.Parse(response.Header.Get("Location"))
		return "/auth/oidc/callback?" + u.RawQuery
	}
	auth, proof := start()
	path := callback(auth)
	wrong := request("GET", path, nil, "", "", "wrong", "")
	assert(wrong, 303)
	if wrong.Header().Get("Location") != "/?oidc=failed" {
		t.Fatal("browser proof ignored")
	}
	w := request("GET", path, nil, "", "", proof, "")
	assert(w, 303)
	if w.Header().Get("Location") != "/?oidc=success" || w.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Fatal("callback result", w.Header())
	}
	var sessionCookieValue string
	for _, c := range w.Result().Cookies() {
		if c.Name == sessionCookie {
			sessionCookieValue = c.Value
		}
	}
	session, err := identity.Session(ctx, sessionCookieValue)
	if err != nil || session.User.Roles[0] != "user" || len(session.User.Permissions) != 2 {
		t.Fatal("JIT claims elevated privileges", session, err)
	}
	assert(request("GET", "/admin/users", nil, sessionCookieValue, "", "", ""), 403)
	w = request("GET", path, nil, "", "", proof, "")
	if w.Header().Get("Location") != "/?oidc=failed" {
		t.Fatal("callback replay")
	}
	t.Run("SSO-only authenticator enrollment", func(t *testing.T) {
		assert := func(w *httptest.ResponseRecorder, status int) {
			t.Helper()
			if w.Code != status {
				t.Fatalf("status %d, want %d: %s", w.Code, status, w.Body.String())
			}
		}
		patch := contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.force_user_2fa", Value: "true"}}}
		if _, e := settings.Patch(ctx, patch, admin.ID); e != nil {
			t.Fatal(e)
		}
		assert(request("POST", "/account/oidc/totp", nil, "", "", "", ""), 401)
		assert(request("POST", "/account/oidc/totp", nil, sessionCookieValue, "", "", ""), 403)
		assert(request("POST", "/account/oidc/totp", nil, raw, adminSession.CsrfToken, "", ""), 401)
		assert(request("GET", "/account/totp/setup", nil, sessionCookieValue, "", "", ""), 400)
		assert(request("POST", "/core/execute", contracts.ExecuteInput{Text: "restricted"}, sessionCookieValue, session.CsrfToken, "", ""), 403)
		begin := func(token string) (string, string) {
			t.Helper()
			w := request("POST", "/account/oidc/totp", nil, token, platform.CSRF(token), "", "")
			assert(w, 200)
			var start contracts.OIDCStartResponse
			if e := json.Unmarshal(w.Body.Bytes(), &start); e != nil {
				t.Fatal(e)
			}
			u, _ := url.Parse(start.Data.AuthorizationUrl)
			if u.Query().Get("prompt") != "login" || u.Query().Get("max_age") != "0" {
				t.Fatal("fresh authentication not requested")
			}
			for _, c := range w.Result().Cookies() {
				if c.Name == oidcCookie {
					return start.Data.AuthorizationUrl, c.Value
				}
			}
			t.Fatal("missing browser proof")
			return "", ""
		}
		for _, scenario := range []string{"other-identity", "stale-auth", "other-session", "revoked-session"} {
			token := sessionCookieValue
			if scenario == "revoked-session" {
				_, token, err = identity.Issue(ctx, session.User, 1)
				if err != nil {
					t.Fatal(err)
				}
			}
			auth, proof := begin(token)
			u, _ := url.Parse(auth)
			q := u.Query()
			if scenario == "other-identity" {
				q.Set("subject", "unrelated-employee")
			}
			if scenario == "stale-auth" {
				q.Set("scenario", "stale-auth")
			}
			u.RawQuery = q.Encode()
			path := callback(u.String())
			if scenario == "other-session" {
				token = platform.Token()
			}
			if scenario == "revoked-session" {
				if e := identity.Store.DeleteSession(ctx, platform.Hash(token)); e != nil {
					t.Fatal(e)
				}
			}
			w := request("GET", path, nil, token, "", proof, "")
			if w.Header().Get("Location") != "/account-security?oidc=totp_failed" {
				t.Fatal(scenario, w.Header())
			}
			assert(request("GET", "/account/totp/setup", nil, sessionCookieValue, "", "", ""), 400)
		}
		auth, proof := begin(sessionCookieValue)
		path := callback(auth)
		w := request("GET", path, nil, sessionCookieValue, "", proof, "")
		if w.Header().Get("Location") != "/account-security?oidc=totp_ready" {
			t.Fatal("enrollment callback failed", w.Header())
		}
		for _, c := range w.Result().Cookies() {
			if c.Name == sessionCookie {
				t.Fatal("enrollment unexpectedly rotated or created a session")
			}
		}
		w = request("GET", path, nil, sessionCookieValue, "", proof, "")
		if w.Header().Get("Location") == "/account-security?oidc=totp_ready" {
			t.Fatal("enrollment callback replay")
		}
		_, other, e := identity.Issue(ctx, session.User, 1)
		if e != nil {
			t.Fatal(e)
		}
		assert(request("GET", "/account/totp/setup", nil, other, "", "", ""), 400)
		w = request("GET", "/account/totp/setup", nil, sessionCookieValue, "", "", "")
		assert(w, 200)
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("setup can be cached")
		}
		var setup contracts.TOTPSetupResponse
		if e = json.Unmarshal(w.Body.Bytes(), &setup); e != nil {
			t.Fatal(e)
		}
		if setup.Data.Secret == "" {
			t.Fatal("missing authenticator secret")
		}
		assert(request("POST", "/account/totp/enable", contracts.SecurityCodeInput{Code: personalCode(setup.Data.Secret, time.Now().Unix()/30-1)}, sessionCookieValue, session.CsrfToken, "", ""), 200)
		assert(request("GET", "/account/totp/setup", nil, sessionCookieValue, "", "", ""), 400)
		assert(request("POST", "/account/oidc/totp", nil, sessionCookieValue, session.CsrfToken, "", ""), 401)
		if _, e = identity.Session(ctx, other); e == nil {
			t.Fatal("other session survived enrollment")
		}
		auth, proof = start()
		w = request("GET", callback(auth), nil, "", "", proof, "")
		pending := ""
		for _, c := range w.Result().Cookies() {
			if c.Name == sessionCookie {
				pending = c.Value
			}
		}
		if _, e = identity.Session(ctx, pending); e != platform.ErrMFA {
			t.Fatal("OIDC bypassed enrolled TOTP", e)
		}
		assert(request("GET", "/account/totp/setup", nil, pending, "", "", ""), 401)
	})
	// Changing a configuration after authorization also rejects a valid signed identity.
	auth, proof = start()
	path = callback(auth)
	_, err = settings.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "oidc.enabled", Value: "false"}}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	w = request("GET", path, nil, "", "", proof, "")
	if w.Header().Get("Location") != "/?oidc=failed" {
		t.Fatal("disabled provider accepted")
	}
	// Existing password login always remains available when the IdP is disabled.
	if _, _, err = m.Identity(true).Login(ctx, contracts.LoginInput{Username: "admin", Password: "test-password-strong"}, "test", false, false, 1); err != nil {
		t.Fatal("local fallback lost", err)
	}
}
