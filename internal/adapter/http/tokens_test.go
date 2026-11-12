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
	return tokenData[contracts.PersonalTokenCreated](f.t, f.request("POST", "/account/tokens", contracts.PersonalTokenInput{Name: "reader", ExpiresInDays: 30, RoleID: "user"}, "", f.userRaw, true), 200)
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
	tokenData[any](t, f.request("POST", "/notes", contracts.NoteInput{Title: "role allowed", Status: "open"}, pat.Token, "", false), 200)
	tokenData[any](t, f.request("GET", "/admin/notes", nil, pat.Token, "", false), 403)
	tokenData[any](t, f.request("GET", "/account/tokens", nil, pat.Token, "", false), 403)
	tokenData[any](t, f.request("GET", "/account/tokens", nil, pair.AccessToken, "", false), 403)
	// Neither the whole PAT nor its random suffix can be laundered into a full Cookie session.
	tokenData[any](t, f.request("GET", "/notes", nil, "", pat.Token, true), 401)
	tokenData[any](t, f.request("GET", "/notes", nil, "", strings.TrimPrefix(pat.Token, "ucp_"), true), 401)
	tokenData[any](t, f.request("POST", "/auth/token/refresh", contracts.RefreshTokenInput{RefreshToken: pair.RefreshToken}, "", f.userRaw, true), 403)
	tokenData[any](t, f.request("POST", "/account/tokens", contracts.PersonalTokenInput{Name: "bad", ExpiresInDays: 1, RoleID: "super_admin"}, "", f.userRaw, true), 403)
	tokenData[any](t, f.request("POST", "/account/tokens", contracts.PersonalTokenInput{Name: "csrf", ExpiresInDays: 1, RoleID: "user"}, "", f.userRaw, false), 403)
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
			// Replaying the current unpublished baseline must preserve issued
			// credentials, their selected role and revocation state.
			for range 2 {
				if err := runner.Apply(context.Background(), store.DB, runner.Options{Dialect: driver, Profile: "web-platform"}); err != nil {
					t.Fatal(err)
				}
			}
			tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 401)
			adminInput := contracts.AdminPersonalTokenInput{Name: "Permanent database credential", RoleID: "user", UserID: f.user.ID, Remark: "External dialect", ExpiresInDays: 0}
			permanent := tokenData[contracts.PersonalTokenCreated](t, f.request("POST", "/admin/access-tokens", adminInput, "", f.adminRaw, true), 200)
			tokenData[any](t, f.request("GET", "/notes", nil, permanent.Token, "", false), 200)
			tokenData[any](t, f.request("POST", "/admin/access-tokens/"+permanent.Credential.ID+"/renew", contracts.PersonalTokenRenewInput{ExpiresInDays: 90}, "", f.adminRaw, true), 200)
			records := tokenData[contracts.PersonalTokenList](t, f.request("GET", "/admin/access-tokens?search=Permanent", nil, "", f.adminRaw, false), 200)
			if records.Total != 1 || records.Items[0].RoleID != "user" || records.Items[0].ExpiresAt == 0 {
				t.Fatal(records)
			}
			tokenData[any](t, f.request("DELETE", "/admin/access-tokens/"+permanent.Credential.ID, nil, "", f.adminRaw, true), 200)
			tokenData[any](t, f.request("POST", "/admin/access-tokens/"+permanent.Credential.ID+"/renew", contracts.PersonalTokenRenewInput{ExpiresInDays: 1}, "", f.adminRaw, true), 403)

		})
	}
}

func TestPersonalTokenManagementAndLifetimes(t *testing.T) {
	f := newTokenHTTP(t)
	input := contracts.PersonalTokenInput{Name: "automation", RoleID: "user", Remark: "Nightly job", ExpiresInDays: 0}
	for _, days := range []int{0, 1, 7, 30, 90} {
		input.ExpiresInDays = days
		pat := tokenData[contracts.PersonalTokenCreated](t, f.request("POST", "/account/tokens", input, "", f.userRaw, true), 200)
		if (days == 0) != (pat.Credential.ExpiresAt == 0) {
			t.Fatalf("invalid expiry: %+v", pat.Credential)
		}
		tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 200)
	}
	for _, days := range []int{-1, 2, 365} {
		input.ExpiresInDays = days
		tokenData[any](t, f.request("POST", "/account/tokens", input, "", f.userRaw, true), 400)
	}
	input.ExpiresInDays = 1
	tokenData[any](t, f.request("GET", "/account/token-roles", nil, "", "", false), 401)
	roles := tokenData[contracts.RoleOptions](t, f.request("GET", "/account/token-roles", nil, "", f.userRaw, false), 200)
	if len(roles.Items) != 1 || roles.Items[0].ID != "user" {
		t.Fatal(roles)
	}
	for _, path := range []string{"/admin/access-tokens", "/admin/access-tokens/users", "/admin/access-tokens/users/" + f.user.ID + "/roles"} {
		tokenData[any](t, f.request("GET", path, nil, "", "", false), 401)
		tokenData[any](t, f.request("GET", path, nil, "", f.userRaw, false), 403)
		tokenData[any](t, f.request("GET", path, nil, "", f.adminRaw, false), 200)
	}
	adminInput := contracts.AdminPersonalTokenInput{Name: input.Name, RoleID: input.RoleID, Remark: input.Remark, ExpiresInDays: 1, UserID: f.user.ID}
	tokenData[any](t, f.request("POST", "/admin/access-tokens", adminInput, "", f.adminRaw, false), 403)
	tokenData[any](t, f.request("POST", "/admin/access-tokens", adminInput, "", f.userRaw, true), 403)
	invalid := adminInput
	invalid.RoleID = "super_admin"
	tokenData[any](t, f.request("POST", "/admin/access-tokens", invalid, "", f.adminRaw, true), 403)
	invalid = adminInput
	invalid.UserID = "missing-user"
	tokenData[any](t, f.request("POST", "/admin/access-tokens", invalid, "", f.adminRaw, true), 403)
	pat := tokenData[contracts.PersonalTokenCreated](t, f.request("POST", "/admin/access-tokens", adminInput, "", f.adminRaw, true), 200)
	list := tokenData[contracts.PersonalTokenList](t, f.request("GET", "/admin/access-tokens?search=Nightly&page_size=2", nil, "", f.adminRaw, false), 200)
	if len(list.Items) != 2 || list.Total != 6 || list.Items[0].UserID != f.user.ID || list.Items[0].RoleID != "user" || list.Items[0].Remark != "Nightly job" {
		t.Fatalf("invalid management list: %+v", list)
	}
	if strings.Contains(f.request("GET", "/admin/access-tokens", nil, "", f.adminRaw, false).Body.String(), pat.Token) {
		t.Fatal("admin list leaked secret")
	}
	renew := contracts.PersonalTokenRenewInput{ExpiresInDays: 7}
	path := "/account/tokens/" + pat.Credential.ID + "/renew"
	tokenData[any](t, f.request("POST", path, renew, "", f.userRaw, false), 403)
	tokenData[any](t, f.request("POST", path, renew, "", f.adminRaw, true), 403)
	tokenData[any](t, f.request("POST", path, renew, "", f.userRaw, true), 200)
	own := tokenData[contracts.PersonalTokenList](t, f.request("GET", "/account/tokens?search=automation", nil, "", f.userRaw, false), 200)
	found := false
	for _, c := range own.Items {
		if c.ID == pat.Credential.ID {
			found = true
			if c.ExpiresAt < pat.Credential.ExpiresAt+7*86400-1 {
				t.Fatal("renewal shortened token")
			}
		}
	}
	if !found {
		t.Fatal("admin-created token missing from owner list")
	}
	adminPath := "/admin/access-tokens/" + pat.Credential.ID
	tokenData[any](t, f.request("POST", adminPath+"/renew", contracts.PersonalTokenRenewInput{ExpiresInDays: 0}, "", f.adminRaw, true), 200)
	tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 200)
	tokenData[any](t, f.request("DELETE", adminPath, nil, "", f.adminRaw, true), 200)
	tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 401)
	tokenData[any](t, f.request("POST", adminPath+"/renew", renew, "", f.adminRaw, true), 403)
	tokenData[any](t, f.request("POST", path, renew, "", f.userRaw, true), 403)
}

func TestPersonalTokenSingleRoleAndBrowserOnlyAdministration(t *testing.T) {
	f := newTokenHTTP(t)
	ctx := t.Context()
	read, err := f.identity.Store.CreateRole(ctx, contracts.RoleSaveInput{Name: "PAT reader", Permissions: []string{"notes:access"}, OperationIds: &[]string{"listNotes"}}, f.admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	roles := []string{"user", read.ID}
	user, err := f.identity.Store.UpdateUser(ctx, f.user.ID, contracts.UserUpdate{Status: "active", RoleIds: &roles}, f.admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, f.userRaw, err = f.identity.Issue(ctx, user, 24)
	if err != nil {
		t.Fatal(err)
	}
	pat := tokenData[contracts.PersonalTokenCreated](t, f.request("POST", "/account/tokens", contracts.PersonalTokenInput{Name: "reader", RoleID: read.ID, ExpiresInDays: 30}, "", f.userRaw, true), 200)
	tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 200)
	tokenData[any](t, f.request("POST", "/notes", contracts.NoteInput{Title: "no writer union", Status: "open"}, pat.Token, "", false), 403)
	tokenData[any](t, f.request("POST", "/notes", contracts.NoteInput{Title: "browser union", Status: "open"}, "", f.userRaw, true), 200)
	tokenData[any](t, f.request("GET", "/account/token-roles", nil, pat.Token, "", false), 403)
	// Even a super role token cannot issue credentials or invoke reserved governance.
	adminPAT := tokenData[contracts.PersonalTokenCreated](t, f.request("POST", "/account/tokens", contracts.PersonalTokenInput{Name: "admin script", RoleID: "super_admin", ExpiresInDays: 7}, "", f.adminRaw, true), 200)
	for _, path := range []string{"/admin/access-tokens", "/admin/access-tokens/users", "/account/tokens"} {
		tokenData[any](t, f.request("GET", path, nil, adminPAT.Token, "", false), 403)
	}
	// A role edit revokes the security anchor. A fresh browser cannot renew it back to life.
	if _, err = f.identity.Store.UpdateRole(ctx, read.ID, contracts.RoleSaveInput{Name: "Renamed reader", Permissions: []string{"notes:access"}}, f.admin.ID); err != nil {
		t.Fatal(err)
	}
	tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 401)
	_, f.userRaw, err = f.identity.Issue(ctx, user, 24)
	if err != nil {
		t.Fatal(err)
	}
	tokenData[any](t, f.request("POST", "/account/tokens/"+pat.Credential.ID+"/renew", contracts.PersonalTokenRenewInput{ExpiresInDays: 30}, "", f.userRaw, true), 403)
}

func TestExpiredPersonalTokenRenewalKeepsSecurityAnchor(t *testing.T) {
	f := newTokenHTTP(t)
	pat := f.pat()
	ctx := t.Context()
	store, _, _, _ := f.manager.Services()
	if _, err := store.Exec(ctx, store.DB, "UPDATE unicore_api_credentials SET expires_at=? WHERE id=?", time.Now().Unix()-60, pat.Credential.ID); err != nil {
		t.Fatal(err)
	}
	tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 401)
	// Ordinary session cleanup must not erase the security anchor of an expired PAT.
	if _, _, err := f.identity.Issue(ctx, f.user, 24); err != nil {
		t.Fatal(err)
	}
	tokenData[any](t, f.request("POST", "/account/tokens/"+pat.Credential.ID+"/renew", contracts.PersonalTokenRenewInput{ExpiresInDays: 1}, "", f.userRaw, true), 200)
	tokenData[any](t, f.request("GET", "/notes", nil, pat.Token, "", false), 200)
	status := "disabled"
	if _, err := f.identity.Store.UpdateUser(ctx, f.user.ID, contracts.UserUpdate{Status: status}, f.admin.ID); err != nil {
		t.Fatal(err)
	}
	// A super administrator can still revoke retained records of a disabled owner.
	tokenData[any](t, f.request("POST", "/admin/access-tokens/"+pat.Credential.ID+"/renew", contracts.PersonalTokenRenewInput{ExpiresInDays: 1}, "", f.adminRaw, true), 403)
	tokenData[any](t, f.request("DELETE", "/admin/access-tokens/"+pat.Credential.ID, nil, "", f.adminRaw, true), 200)
}

func TestPersonalTokenAdministrativeDataScope(t *testing.T) {
	f := newTokenHTTP(t)
	ctx := t.Context()
	self, all := platform.ScopeSelf, platform.ScopeAll
	narrow, err := f.identity.Store.CreateRole(ctx, contracts.RoleSaveInput{Name: "Self account editor", Permissions: []string{"users:read", "users:update"}, DataScope: &self}, f.admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	wide, err := f.identity.Store.CreateRole(ctx, contracts.RoleSaveInput{Name: "Global account editor", Permissions: []string{"users:read", "users:update", "users:create"}, DataScope: &all}, f.admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	roles := []string{narrow.ID, wide.ID}
	actor, err := f.identity.Create(ctx, contracts.UserCreate{Username: "dualmanager", Email: "dualmanager@example.test", Password: "test-password-strong", RoleIds: &roles}, f.admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, raw, err := f.identity.Issue(ctx, actor, 24)
	if err != nil {
		t.Fatal(err)
	}
	pat := tokenData[contracts.PersonalTokenCreated](t, f.request("POST", "/account/tokens", contracts.PersonalTokenInput{Name: "self editor", RoleID: narrow.ID, ExpiresInDays: 30}, "", raw, true), 200)
	list := tokenData[contracts.UserList](t, f.request("GET", "/admin/users", nil, pat.Token, "", false), 200)
	if list.Total != 1 || list.Items[0].ID != actor.ID {
		t.Fatalf("PAT data scope included another role: %+v", list)
	}
	full := tokenData[contracts.UserList](t, f.request("GET", "/admin/users", nil, "", raw, false), 200)
	if full.Total < 3 {
		t.Fatal("cookie lost multi-role scope", full)
	}
	tokenData[any](t, f.request("PATCH", "/admin/users/"+f.user.ID, contracts.UserUpdate{Status: "active"}, pat.Token, "", false), 403)
	tokenData[any](t, f.request("PATCH", "/admin/users/"+f.user.ID, contracts.UserUpdate{Status: "active"}, "", raw, true), 200)
	tokenData[any](t, f.request("POST", "/admin/users", contracts.UserCreate{Username: "forbidden", Email: "forbidden@example.test", Password: "test-password-strong", Role: "user"}, pat.Token, "", false), 403)
}

func TestExpiredPersonalTokenRenewalRespectsActiveLimit(t *testing.T) {
	f := newTokenHTTP(t)
	ctx := t.Context()
	expired := f.pat()
	store, _, _, _ := f.manager.Services()
	if _, err := store.Exec(ctx, store.DB, "UPDATE unicore_api_credentials SET expires_at=? WHERE id=?", time.Now().Unix()-1, expired.Credential.ID); err != nil {
		t.Fatal(err)
	}
	var active platform.APICredential
	for range 50 {
		candidate := platform.APICredential{ID: platform.Token(), UserID: f.user.ID, Kind: "pat", Name: "quota fixture", RoleID: "user", SessionHash: platform.Hash("ucp_" + platform.Token()), CreatedAt: int(time.Now().Unix()), ExpiresAt: 0}
		var err error
		active, err = f.identity.Tokens.Store.CreatePersonalToken(ctx, platform.Hash(f.userRaw), candidate)
		if err != nil {
			t.Fatal(err)
		}
	}
	path := "/account/tokens/" + expired.Credential.ID + "/renew"
	input := contracts.PersonalTokenRenewInput{ExpiresInDays: 7}
	tokenData[any](t, f.request("POST", path, input, "", f.userRaw, true), 400)
	tokenData[any](t, f.request("DELETE", "/account/tokens/"+active.ID, nil, "", f.userRaw, true), 200)
	tokenData[any](t, f.request("POST", path, input, "", f.userRaw, true), 200)
}
