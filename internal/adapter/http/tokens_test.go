// Author: yunnuo <ymz@ebox.vip>
// Description: Real SQLite/HTTP matrices for JWT proof, refresh replay, PAT scoping and account revocation.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	jose "github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/migrations/catalogdata"
	"github.com/yunnuo/unicore/migrations/runner"
)

type tokenHTTPFixture struct {
	t                 *testing.T
	manager           *install.Manager
	router            http.Handler
	identity          *platform.Service
	admin, user       contracts.User
	adminRaw, userRaw string
}

func newTokenHTTP(t *testing.T) *tokenHTTPFixture {
	return newTokenHTTPDatabase(t, contracts.DatabaseInput{Driver: "sqlite"})
}
func newTokenHTTPDatabase(t *testing.T, database contracts.DatabaseInput) *tokenHTTPFixture {
	t.Helper()
	ctx := context.Background()
	m, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.Close() })
	token, _ := os.ReadFile(m.TokenPath())
	_, admin, err := m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: database, SiteName: "Tokens", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	_, settings, identity, _ := m.Services()
	_, err = settings.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.login_captcha", Value: "false"}}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	user, err := identity.Create(ctx, contracts.UserCreate{Username: "tokenmember", Email: "tokenmember@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, adminRaw, err := identity.Issue(ctx, admin, 24)
	if err != nil {
		t.Fatal(err)
	}
	_, userRaw, err := identity.Issue(ctx, user, 24)
	if err != nil {
		t.Fatal(err)
	}
	r := New(Config{Core: bootstrap.Core(), Install: m, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	return &tokenHTTPFixture{t: t, manager: m, router: r, identity: identity, admin: admin, user: user, adminRaw: adminRaw, userRaw: userRaw}
}
func (f *tokenHTTPFixture) request(method, path string, input any, bearer, cookie string, csrf bool) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(input)
	r := httptest.NewRequest(method, "http://localhost/api/v1"+path, bytes.NewReader(raw))
	r.RemoteAddr = "192.0.2.91:1234"
	r.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		r.Header.Set("Authorization", "Bearer "+bearer)
	}
	if cookie != "" {
		r.AddCookie(&http.Cookie{Name: sessionCookie, Value: cookie})
		if csrf {
			r.Header.Set("X-CSRF-Token", platform.CSRF(cookie))
		}
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, r)
	return w
}
func tokenData[T any](t *testing.T, w *httptest.ResponseRecorder, code int) T {
	t.Helper()
	if w.Code != code {
		t.Fatalf("status %d want %d: %s", w.Code, code, w.Body.String())
	}
	var envelope struct {
		Data T `json:"data"`
	}
	if code == 200 {
		if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
			t.Fatal(err)
		}
	}
	return envelope.Data
}
func (f *tokenHTTPFixture) login() contracts.ClientTokenPair {
	f.t.Helper()
	w := f.request("POST", "/auth/token", contracts.LoginInput{Username: f.user.Username, Password: "test-password-strong"}, "", "", false)
	result := tokenData[contracts.ClientTokenLogin](f.t, w, 200)
	if result.Tokens == nil || result.MfaRequired || len(w.Result().Cookies()) != 0 {
		f.t.Fatalf("invalid client exchange: %s", w.Body.String())
	}
	return *result.Tokens
}
func (f *tokenHTTPFixture) pat() contracts.PersonalTokenCreated {
	f.t.Helper()
	return tokenData[contracts.PersonalTokenCreated](f.t, f.request("POST", "/account/tokens", contracts.PersonalTokenInput{Name: "reader", ExpiresInDays: 30, OperationIds: []string{"listNotes"}}, "", f.userRaw, true), 200)
}
func TestTokenHTTPIdentityAndPersonalScope(t *testing.T) {
	f := newTokenHTTP(t)
	pair := f.login()
	pat := f.pat()
	tokenData[any](t, f.request("GET", "/notes", nil, pair.AccessToken, "", false), 200)
	tokenData[any](t, f.request("POST", "/notes", contracts.NoteInput{Title: "client note", Body: "body", Status: "open"}, pair.AccessToken, "", false), 200)
	tokenData[any](t, f.request("GET", "/admin/users", nil, pair.AccessToken, "", false), 403)
	tokenData[any](t, f.request("GET", "/notes", nil, "invalid", f.userRaw, true), 401)
	tokenData[any](t, f.request("GET", "/notes", nil, pair.AccessToken, f.userRaw, true), 401)
	tokenData[any](t, f.request("POST", "/notes", contracts.NoteInput{Title: "missing csrf", Status: "open"}, "", f.userRaw, false), 403)
	tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 200)
	tokenData[any](t, f.request("POST", "/notes", contracts.NoteInput{Title: "denied", Status: "open"}, pat.Token, "", false), 403)
	tokenData[any](t, f.request("GET", "/admin/notes", nil, pat.Token, "", false), 403)
	tokenData[any](t, f.request("GET", "/account/tokens", nil, pat.Token, "", false), 403)
	tokenData[any](t, f.request("GET", "/account/tokens", nil, pair.AccessToken, "", false), 403)
	// Neither the whole PAT nor its random suffix can be laundered into a full Cookie session.
	tokenData[any](t, f.request("GET", "/notes", nil, "", pat.Token, true), 401)
	tokenData[any](t, f.request("GET", "/notes", nil, "", strings.TrimPrefix(pat.Token, "ucp_"), true), 401)
	tokenData[any](t, f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: pair.RefreshToken}, "", f.userRaw, true), 403)
	tokenData[any](t, f.request("POST", "/account/tokens", contracts.PersonalTokenInput{Name: "bad", ExpiresInDays: 1, OperationIds: []string{"adminUsers"}}, "", f.userRaw, true), 403)
	tokenData[any](t, f.request("POST", "/account/tokens", contracts.PersonalTokenInput{Name: "csrf", ExpiresInDays: 1, OperationIds: []string{"listNotes"}}, "", f.userRaw, false), 403)
	list := f.request("GET", "/account/tokens", nil, "", f.userRaw, false)
	tokenData[contracts.PersonalTokenList](t, list, 200)
	if strings.Contains(list.Body.String(), pat.Token) {
		t.Fatal("secret leaked by list")
	}
	tokenData[any](t, f.request("DELETE", "/account/tokens/"+pat.Credential.ID, nil, "", f.adminRaw, true), 403)
	tokenData[any](t, f.request("DELETE", "/account/tokens/"+pat.Credential.ID, nil, "", f.userRaw, true), 200)
	tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 401)
}
func TestRefreshReplayAndParallelRotationRevokeFamily(t *testing.T) {
	f := newTokenHTTP(t)
	pair := f.login()
	next := tokenData[contracts.ClientTokenPair](t, f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: pair.RefreshToken}, "", "", false), 200)
	if next.RefreshToken == pair.RefreshToken {
		t.Fatal("refresh secret did not rotate")
	}
	tokenData[any](t, f.request("GET", "/notes", nil, next.AccessToken, "", false), 200)
	tokenData[any](t, f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: pair.RefreshToken}, "", "", false), 401)
	tokenData[any](t, f.request("GET", "/notes", nil, next.AccessToken, "", false), 401)
	tokenData[any](t, f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: next.RefreshToken}, "", "", false), 401)
	pair = f.login()
	var wg sync.WaitGroup
	results := make(chan *httptest.ResponseRecorder, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: pair.RefreshToken}, "", "", false)
		}()
	}
	wg.Wait()
	close(results)
	success, denied := 0, 0
	for w := range results {
		switch w.Code {
		case 200:
			success++
			next = tokenData[contracts.ClientTokenPair](t, w, 200)
		case 401:
			denied++
		default:
			t.Fatalf("parallel rotation: %d %s", w.Code, w.Body.String())
		}
	}
	if success > 1 || success+denied != 2 || denied < 1 {
		t.Fatalf("parallel refresh succeeded %d denied %d", success, denied)
	}
	if success == 1 {
		tokenData[any](t, f.request("GET", "/notes", nil, next.AccessToken, "", false), 401)
	}
}
func TestJWTValidationAndSigningKeyRotation(t *testing.T) {
	f := newTokenHTTP(t)
	pair := f.login()
	tokens := f.identity.Tokens
	key, err := tokens.Store.TokenKey(context.Background(), "", platform.TokenSigningKey{}, false)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := tokens.Secrets.Open(key.Secret)
	if err != nil {
		t.Fatal(err)
	}
	valid := jwt.Claims{Issuer: "unicore", Subject: f.user.ID, Audience: jwt.Audience{"unicore-api"}, IssuedAt: jwt.NewNumericDate(time.Now()), NotBefore: jwt.NewNumericDate(time.Now()), Expiry: jwt.NewNumericDate(time.Now().Add(time.Minute)), ID: platform.Token()}
	parsed, err := jwt.ParseSigned(pair.AccessToken, []jose.SignatureAlgorithm{jose.HS256})
	if err != nil {
		t.Fatal(err)
	}
	var original struct {
		SID string `json:"sid"`
	}
	if err = parsed.Claims([]byte(secret), &original); err != nil {
		t.Fatal(err)
	}
	for _, scenario := range []string{"issuer", "audience", "expired", "future", "missing-expiry", "too-long", "unknown-session"} {
		claims := valid
		sid := original.SID
		switch scenario {
		case "issuer":
			claims.Issuer = "other"
		case "audience":
			claims.Audience = jwt.Audience{"other"}
		case "expired":
			claims.Expiry = jwt.NewNumericDate(time.Now().Add(-time.Minute))
		case "future":
			claims.NotBefore = jwt.NewNumericDate(time.Now().Add(time.Hour))
		case "missing-expiry":
			claims.Expiry = nil
		case "too-long":
			claims.Expiry = jwt.NewNumericDate(time.Now().Add(time.Hour))
		case "unknown-session":
			sid = platform.Token()
		}
		signer, _ := jose.NewSigner(jose.SigningKey{Algorithm: jose.HS256, Key: []byte(secret)}, (&jose.SignerOptions{}).WithType("at+jwt").WithHeader("kid", key.ID))
		raw, _ := jwt.Signed(signer).Claims(claims).Claims(map[string]string{"sid": sid}).Serialize()
		w := f.request("GET", "/notes", nil, raw, "", false)
		if w.Code != 401 {
			t.Fatalf("%s accepted: %d", scenario, w.Code)
		}
	}
	tokenData[any](t, f.request("POST", "/admin/auth/token-keys/rotate", nil, "", f.userRaw, true), 403)
	tokenData[any](t, f.request("POST", "/admin/auth/token-keys/rotate", nil, "", f.adminRaw, true), 200)
	tokenData[any](t, f.request("GET", "/notes", nil, pair.AccessToken, "", false), 200)
	next := tokenData[contracts.ClientTokenPair](t, f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: pair.RefreshToken}, "", "", false), 200)
	newParsed, _ := jwt.ParseSigned(next.AccessToken, []jose.SignatureAlgorithm{jose.HS256})
	if newParsed.Headers[0].KeyID == key.ID {
		t.Fatal("signing key unchanged")
	}
	store, _, _, _ := f.manager.Services()
	if _, err = store.Exec(context.Background(), store.DB, "UPDATE unicore_api_token_keys SET valid_until=? WHERE id=?", time.Now().Unix()-1, key.ID); err != nil {
		t.Fatal(err)
	}
	tokenData[any](t, f.request("GET", "/notes", nil, pair.AccessToken, "", false), 401)
	tokenData[any](t, f.request("GET", "/notes", nil, next.AccessToken, "", false), 200)
}
func TestTokensFollowAccountLifecycle(t *testing.T) {
	for _, change := range []string{"password", "disabled", "role", "device"} {
		t.Run(change, func(t *testing.T) {
			f := newTokenHTTP(t)
			pair := f.login()
			pat := f.pat()
			ctx := context.Background()
			switch change {
			case "password":
				if err := f.identity.ChangePassword(ctx, f.user, contracts.ChangePasswordInput{CurrentPassword: "test-password-strong", Password: "replacement-password-strong"}, "192.0.2.91"); err != nil {
					t.Fatal(err)
				}
			case "disabled":
				status := "disabled"
				if _, err := f.identity.Store.UpdateUser(ctx, f.user.ID, contracts.UserUpdate{Status: status}, f.admin.ID); err != nil {
					t.Fatal(err)
				}
			case "role":
				roles := []string{"user"}
				if _, err := f.identity.Store.UpdateUser(ctx, f.user.ID, contracts.UserUpdate{Status: "active", RoleIds: &roles}, f.admin.ID); err != nil {
					t.Fatal(err)
				}
			case "device":
				if err := f.identity.Personal.Store.RevokeDevice(ctx, platform.Hash(f.userRaw), "", true); err != nil {
					t.Fatal(err)
				}
			}
			tokenData[any](t, f.request("GET", "/notes", nil, pair.AccessToken, "", false), 401)
			tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 401)
			tokenData[any](t, f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: pair.RefreshToken}, "", "", false), 401)
		})
	}
}

func TestClientTokensRespectMFAAndEnrollment(t *testing.T) {
	f := newTokenHTTP(t)
	ctx := context.Background()
	setup, err := f.identity.Personal.BeginTOTP(ctx, f.userRaw, "test-password-strong", "192.0.2.91")
	if err != nil {
		t.Fatal(err)
	}
	recovery, err := f.identity.Personal.Enable(ctx, f.userRaw, personalCode(setup.Secret, time.Now().Unix()/30))
	if err != nil {
		t.Fatal(err)
	}
	login := tokenData[contracts.ClientTokenLogin](t, f.request("POST", "/auth/token", contracts.LoginInput{Username: f.user.Username, Password: "test-password-strong"}, "", "", false), 200)
	if !login.MfaRequired || login.ChallengeToken == nil || login.Tokens != nil {
		t.Fatal("MFA was bypassed")
	}
	tokenData[any](t, f.request("GET", "/notes", nil, *login.ChallengeToken, "", false), 401)
	tokenData[any](t, f.request("GET", "/notes", nil, "", *login.ChallengeToken, true), 401)
	tokenData[any](t, f.request("POST", "/auth/mfa", map[string]string{"code": recovery.Codes[0]}, "", strings.TrimPrefix(*login.ChallengeToken, "ucc_"), true), 401)

	tokenData[any](t, f.request("POST", "/auth/token/mfa", contracts.ClientTokenMFAInput{ChallengeToken: *login.ChallengeToken, Code: "invalid"}, "", "", false), 400)
	pair := tokenData[contracts.ClientTokenPair](t, f.request("POST", "/auth/token/mfa", contracts.ClientTokenMFAInput{ChallengeToken: *login.ChallengeToken, Code: recovery.Codes[0]}, "", "", false), 200)
	tokenData[any](t, f.request("GET", "/notes", nil, pair.AccessToken, "", false), 200)
	tokenData[any](t, f.request("GET", "/notes", nil, "", *login.ChallengeToken, true), 401)
	tokenData[any](t, f.request("POST", "/auth/token/mfa", contracts.ClientTokenMFAInput{ChallengeToken: *login.ChallengeToken, Code: recovery.Codes[1]}, "", "", false), 401)
	// A forced enrollment policy cannot be bypassed by choosing the client API.
	other, err := f.identity.Create(ctx, contracts.UserCreate{Username: "noauthenticator", Email: "noauthenticator@example.test", Password: "test-password-strong", Role: "user"}, f.admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, settings, _, _ := f.manager.Services()
	if _, err = settings.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.force_user_2fa", Value: "true"}}}, f.admin.ID); err != nil {
		t.Fatal(err)
	}
	w := f.request("POST", "/auth/token", contracts.LoginInput{Username: other.Username, Password: "test-password-strong"}, "", "", false)
	if w.Code == 200 || !strings.Contains(w.Body.String(), "MFA_ENROLLMENT_REQUIRED") {
		t.Fatalf("enrollment bypassed: %d %s", w.Code, w.Body.String())
	}
}

func TestTokenHTTPExternalDatabases(t *testing.T) {
	for _, driver := range []string{"postgres", "mysql"} {
		t.Run(driver, func(t *testing.T) {
			dsn := os.Getenv("UNICORE_TOKEN_TEST_" + strings.ToUpper(driver) + "_DSN")
			if dsn == "" {
				t.Skip("dedicated token database not configured")
			}
			// Installation refuses any existing foreign/nonempty target. Reset below
			// is registered only after this test successfully owns a fresh installation.
			f := newTokenHTTPDatabase(t, contracts.DatabaseInput{Driver: driver, Dsn: dsn})
			store, _, _, _ := f.manager.Services()
			t.Cleanup(func() {
				if err := store.Reset(context.Background()); err != nil {
					t.Errorf("owned token database cleanup: %v", err)
				}
			})
			pair := f.login()
			pat := f.pat()
			tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 200)
			next := tokenData[contracts.ClientTokenPair](t, f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: pair.RefreshToken}, "", "", false), 200)
			tokenData[any](t, f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: pair.RefreshToken}, "", "", false), 401)
			tokenData[any](t, f.request("GET", "/notes", nil, next.AccessToken, "", false), 401)
			tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 200)
			tokenData[any](t, f.request("DELETE", "/account/tokens/"+pat.Credential.ID, nil, "", f.userRaw, true), 200)
			tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 401)
			// Upgrade an owned platform@9 snapshot with existing security data.
			if err := store.Reset(context.Background()); err != nil {
				t.Fatal(err)
			}
			snapshot, _ := json.Marshal(catalogdata.Catalog)
			var prefix catalogdata.Descriptor
			if err := json.Unmarshal(snapshot, &prefix); err != nil {
				t.Fatal(err)
			}
			for i := range prefix.Namespaces {
				if prefix.Namespaces[i].Id == "platform" {
					ms := prefix.Namespaces[i].Migrations
					older := ms[:0]
					for _, m := range ms {
						if m.Version < 10 {
							older = append(older, m)
						}
					}
					prefix.Namespaces[i].Migrations = older
				}
			}
			opts := runner.Options{Dialect: driver, Profile: "web-platform"}
			ctx := context.Background()
			if err := runner.ApplyDescriptor(ctx, store.DB, prefix, opts); err != nil {
				t.Fatal(err)
			}
			if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_users(id,username,email,password_hash,status,created_at,updated_at,last_login_at) VALUES(?,?,?,?,?,1,1,1)", "upgrade-user", "upgrade-user", "upgrade@example.test", "test-hash", "active"); err != nil {
				t.Fatal(err)
			}
			if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_personal_accounts(user_id,display_name,totp_secret,recovery_digests,last_step,setup_secret,setup_session,setup_expires,setup_attempts) VALUES(?,?,?,?,123,'','',0,0)", "upgrade-user", "保留昵称", "test-encrypted-proof", "[]"); err != nil {
				t.Fatal(err)
			}
			if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", platform.Hash("upgrade-session"), "upgrade-user", 2000000000); err != nil {
				t.Fatal(err)
			}
			if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_session_details(token_hash,user_id,ip_address,user_agent,created_at,last_seen_at,mfa_verified,mfa_attempts) VALUES(?,?,'127.0.0.1','test-device',1,1,1,0)", platform.Hash("upgrade-session"), "upgrade-user"); err != nil {
				t.Fatal(err)
			}
			for range 2 {
				if err := runner.Apply(ctx, store.DB, opts); err != nil {
					t.Fatal(err)
				}
			}
			var name, proof string
			var step int
			if err := store.Row(ctx, store.DB, "SELECT display_name,totp_secret,last_step FROM unicore_personal_accounts WHERE user_id=?", "upgrade-user").Scan(&name, &proof, &step); err != nil {
				t.Fatal(err)
			}
			if name != "保留昵称" || proof != "test-encrypted-proof" || step != 123 {
				t.Fatal("personal security data changed during upgrade")
			}
			var count int
			if err := store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_session_details d JOIN unicore_sessions s ON s.token_hash=d.token_hash").Scan(&count); err != nil || count != 1 {
				t.Fatalf("upgraded session join: count=%d error=%v", count, err)
			}
		})
	}
}
