// Author: yunnuo <ymz@ebox.vip>
// Description: The same OIDC migration, identity and transaction invariants run on all supported SQL dialects.
package platformsql

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/migrations/runner"
)

func exerciseOIDC(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, admin contracts.User) {
	t.Helper()
	for _, q := range []string{"DROP TABLE unicore_oidc_flows", "DROP TABLE unicore_external_identities", "DELETE FROM schema_migrations WHERE namespace='platform' AND version=1"} {
		if _, err := store.Exec(ctx, store.DB, q); err != nil {
			t.Fatal(err)
		}
	}
	if err := runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
		t.Fatal("rebuild platform namespace", err)
	}
	// Retry after only the first DDL has persisted (as can happen with MySQL).
	for _, q := range []string{"DROP TABLE unicore_oidc_flows", "DELETE FROM schema_migrations WHERE namespace='platform' AND version=1"} {
		if _, err := store.Exec(ctx, store.DB, q); err != nil {
			t.Fatal(err)
		}
	}
	if err := runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
		t.Fatal("partial DDL recovery", err)
	}
	if err := runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
		t.Fatal("repeat migration", err)
	}
	v := settings.Defaults("web-platform")
	v["oidc.enabled"] = "true"
	v["oidc.issuer"] = "https://idp.example.test"
	v["oidc.client_id"] = "test-client"
	v["oidc.jit_enabled"] = "true"
	if err := store.SaveSettings(ctx, v, admin.ID); err != nil {
		t.Fatal(err)
	}
	f := platform.OIDCFlow{Mode: "login", Fingerprint: settings.OIDCFingerprint(v)}
	claims := platform.OIDCClaims{Issuer: v["oidc.issuer"], Subject: "enterprise-001", Email: "oidc@example.test", EmailVerified: true}
	expires := int(time.Now().Add(time.Hour).Unix())
	complete := func(f platform.OIDCFlow, c platform.OIDCClaims) (contracts.User, error) {
		return r.CompleteOIDC(ctx, f, c, platform.Hash(platform.Token()), expires)
	}
	unverified := claims
	unverified.EmailVerified = false
	if _, err := complete(f, unverified); !errors.Is(err, platform.ErrOIDCLinkRequired) {
		t.Fatal("unverified JIT", err)
	}
	conflict := claims
	conflict.Email = "member@example.test"
	if _, err := complete(f, conflict); !errors.Is(err, platform.ErrOIDCLinkRequired) {
		t.Fatal("email auto-linked", err)
	}
	member, err := complete(f, claims)
	if err != nil {
		t.Fatal(err)
	}
	if len(member.Roles) != 1 || member.Roles[0] != "user" || len(member.Permissions) != 0 {
		t.Fatal("JIT exceeded least privilege", member)
	}
	var display string
	if err = r.row(ctx, store.DB, "SELECT display_name FROM unicore_personal_accounts WHERE user_id=?", member.ID).Scan(&display); err != nil || display != "oidc" {
		t.Fatal("JIT display name fallback", display, err)
	}
	info, err := r.OIDCAccount(ctx, member.ID)
	if err != nil || !info.Linked || info.HasLocalPassword {
		t.Fatal(info, err)
	}
	// With the verification requirement lifted, an unverified enterprise email may still JIT,
	// and the display name comes from the configured claim instead of the email prefix.
	relaxed := settings.Defaults("web-platform")
	relaxed["oidc.enabled"] = "true"
	relaxed["oidc.issuer"] = "https://idp.example.test"
	relaxed["oidc.client_id"] = "test-client"
	relaxed["oidc.jit_enabled"] = "true"
	relaxed["oidc.require_email_verified"] = "false"
	if err = store.SaveSettings(ctx, relaxed, admin.ID); err != nil {
		t.Fatal(err)
	}
	relaxedClaims := platform.OIDCClaims{Issuer: v["oidc.issuer"], Subject: "relaxed-jit", Email: "relaxed@example.test", Username: "测试员工", EmailVerified: false}
	named, err := complete(platform.OIDCFlow{Mode: "login", Fingerprint: settings.OIDCFingerprint(relaxed)}, relaxedClaims)
	if err != nil {
		t.Fatal("relaxed unverified JIT", err)
	}
	if err = r.row(ctx, store.DB, "SELECT display_name FROM unicore_personal_accounts WHERE user_id=?", named.ID).Scan(&display); err != nil || display != "测试员工" {
		t.Fatal("claim display name", display, err)
	}
	if err = store.SaveSettings(ctx, v, admin.ID); err != nil {
		t.Fatal(err)
	}
	// Existing identity, never email, controls subsequent login.
	claims.Email = admin.Email
	again, err := complete(f, claims)
	if err != nil || again.ID != member.ID {
		t.Fatal("identity reidentified by email", again, err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: rolePtr("user"), Status: "disabled"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = complete(f, claims); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("disabled identity signed in", err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: rolePtr("super_admin"), Status: "active"}, admin.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("cross realm conversion", err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: rolePtr("user"), Status: "active"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	// A configuration change invalidates a flow even between token verification and commit.
	if err = store.SaveSettings(ctx, map[string]string{"oidc.jit_enabled": "false"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = complete(f, claims); !errors.Is(err, platform.ErrOIDC) {
		t.Fatal("stale config accepted", err)
	}
	if err = store.SaveSettings(ctx, map[string]string{"oidc.jit_enabled": "true"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	identity := platform.New(r)
	local, err := identity.Create(ctx, contracts.UserCreate{Username: "oidclocal", Email: "oidclocal@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, raw, err := identity.Issue(ctx, local, 1)
	if err != nil {
		t.Fatal(err)
	}
	account, err := r.FindAccount(ctx, local.Username)
	if err != nil {
		t.Fatal(err)
	}
	link := platform.OIDCFlow{Mode: "link", UserID: local.ID, CredentialHash: account.PasswordHash, SessionHash: platform.Hash(raw), Fingerprint: f.Fingerprint}
	if _, err = complete(link, claims); !errors.Is(err, platform.ErrOIDCLinkRequired) {
		t.Fatal("identity stolen from another user", err)
	}
	claims.Subject = "enterprise-local"
	claims.Email = local.Email
	linkedSession := platform.Hash(platform.Token())
	if _, err = r.CompleteOIDC(ctx, link, claims, linkedSession, expires); err != nil {
		t.Fatal(err)
	}
	if _, err = identity.Session(ctx, raw); err == nil {
		t.Fatal("old session survived binding")
	}
	if _, err = complete(link, claims); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("binding repeated with revoked session", err)
	}
	link.SessionHash = linkedSession
	link.CredentialHash = "stale"
	if _, err = r.UnlinkOIDC(ctx, link, platform.Hash(platform.Token()), expires); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("stale password unlinked", err)
	}
	link.CredentialHash = account.PasswordHash
	if _, err = r.UnlinkOIDC(ctx, link, platform.Hash(platform.Token()), expires); err != nil {
		t.Fatal(err)
	}
	info, err = r.OIDCAccount(ctx, local.ID)
	if err != nil || info.Linked || !info.HasLocalPassword {
		t.Fatal("local login lost", info, err)
	}
	// Bind-login links a colliding identity after the platform layer proved the local
	// password: one transaction links, revokes other sessions and issues the new one.
	_, staleSession, err := identity.Issue(ctx, local, 1)
	if err != nil {
		t.Fatal(err)
	}
	bind := platform.OIDCFlow{Mode: "bindlogin", UserID: local.ID, CredentialHash: account.PasswordHash, Fingerprint: f.Fingerprint}
	bindClaims := platform.OIDCClaims{Issuer: v["oidc.issuer"], Subject: "enterprise-local", Email: local.Email, EmailVerified: true}
	wrong := bind
	wrong.CredentialHash = "stale"
	if _, err = r.CompleteOIDC(ctx, wrong, bindClaims, platform.Hash(platform.Token()), expires); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("bind-login without password proof", err)
	}
	if _, err = r.CompleteOIDC(ctx, bind, bindClaims, platform.Hash(platform.Token()), expires); err != nil {
		t.Fatal("bind-login refused", err)
	}
	if _, err = identity.Session(ctx, staleSession); err == nil {
		t.Fatal("old session survived bind-login")
	}
	if _, err = r.CompleteOIDC(ctx, bind, bindClaims, platform.Hash(platform.Token()), expires); !errors.Is(err, platform.ErrOIDCLinkRequired) {
		t.Fatal("duplicate bind accepted", err)
	}
	other, err := identity.Create(ctx, contracts.UserCreate{Username: "oidclocal2", Email: "other@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	otherAccount, err := r.FindAccount(ctx, other.Username)
	if err != nil {
		t.Fatal(err)
	}
	steal := platform.OIDCFlow{Mode: "bindlogin", UserID: other.ID, CredentialHash: otherAccount.PasswordHash, Fingerprint: f.Fingerprint}
	if _, err = r.CompleteOIDC(ctx, steal, bindClaims, platform.Hash(platform.Token()), expires); !errors.Is(err, platform.ErrOIDCLinkRequired) {
		t.Fatal("identity theft via bind-login", err)
	}
	// Wrong browsers cannot consume the flow; correct callbacks consume it once, even concurrently.
	state, browser := platform.Hash(platform.Token()), platform.Hash(platform.Token())
	if err = r.CreateOIDCFlow(ctx, state, browser, "sealed-proof", time.Now().Add(time.Minute).Unix()); err != nil {
		t.Fatal(err)
	}
	if _, err = r.ConsumeOIDCFlow(ctx, state, "wrong"); !errors.Is(err, platform.ErrOIDC) {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := r.ConsumeOIDCFlow(ctx, state, browser); results <- err }()
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else if !errors.Is(err, platform.ErrOIDC) {
			t.Fatal(err)
		}
	}
	if successes != 1 {
		t.Fatal("flow consumed multiple times", successes)
	}
	if err = r.CreateOIDCFlow(ctx, "expired", browser, "sealed", time.Now().Add(-time.Minute).Unix()); err != nil {
		t.Fatal(err)
	}
	if _, err = r.ConsumeOIDCFlow(ctx, "expired", browser); !errors.Is(err, platform.ErrOIDC) {
		t.Fatal("expired flow", err)
	}
	exerciseOIDCTOTP(t, ctx, store, admin, f.Fingerprint)
}

// Run enrollment commit invariants in both independent account repositories.
func exerciseOIDCTOTP(t *testing.T, ctx context.Context, store *sqlstore.Store, admin contracts.User, fingerprint string) {
	t.Helper()
	for _, administrators := range []bool{false, true} {
		r := &Repository{Store: store, Administrators: administrators}
		identity := platform.New(r)
		name := "sso_totp_" + r.roleID()
		user, err := identity.Create(ctx, contracts.UserCreate{Username: name, Email: name + "@example.test", Password: "test-password-strong", Role: r.roleID()}, admin.ID)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = r.exec(ctx, store.DB, "UPDATE unicore_users SET password_hash='' WHERE id=?", user.ID); err != nil {
			t.Fatal(err)
		}
		claims := platform.OIDCClaims{Issuer: "https://idp.example.test", Subject: name, Email: user.Email, EmailVerified: true}
		if _, err = r.exec(ctx, store.DB, "INSERT INTO unicore_external_identities(identity_hash,user_id,issuer,subject,created_at) VALUES(?,?,?,?,?)", platform.Hash(claims.Issuer+"\x00"+claims.Subject), user.ID, claims.Issuer, claims.Subject, time.Now().Unix()); err != nil {
			t.Fatal(err)
		}
		_, token, err := identity.Issue(ctx, user, 1)
		if err != nil {
			t.Fatal(err)
		}
		f := platform.OIDCFlow{Mode: "totp", UserID: user.ID, SessionHash: platform.Hash(token), Fingerprint: fingerprint, SetupSecret: "encrypted-setup"}
		expires := int(time.Now().Unix()) + 600
		if _, err = r.CompleteOIDC(ctx, f, claims, "", int(time.Now().Unix())-1); err != platform.ErrOIDC {
			t.Fatal("expired enterprise setup accepted", err)
		}
		wrong := f
		wrong.SessionHash = platform.Hash(platform.Token())
		if _, err = r.CompleteOIDC(ctx, wrong, claims, "", expires); err != platform.ErrCredentials {
			t.Fatal("unrelated session accepted", err)
		}
		wrong = f
		wrong.UserID = admin.ID
		if _, err = r.CompleteOIDC(ctx, wrong, claims, "", expires); err != platform.ErrOIDC {
			t.Fatal("unrelated user accepted", err)
		}
		if _, err = r.exec(ctx, store.DB, "UPDATE unicore_users SET password_hash='local-password' WHERE id=?", user.ID); err != nil {
			t.Fatal(err)
		}
		if _, err = r.CompleteOIDC(ctx, f, claims, "", expires); err != platform.ErrCredentials {
			t.Fatal("local password bypassed", err)
		}
		if _, err = r.exec(ctx, store.DB, "UPDATE unicore_users SET password_hash='' WHERE id=?", user.ID); err != nil {
			t.Fatal(err)
		}
		if _, err = r.CompleteOIDC(ctx, f, claims, "", expires); err != nil {
			t.Fatal(err)
		}
		current, err := r.PersonalSession(ctx, f.SessionHash)
		if err != nil || current.State.SetupSecret != f.SetupSecret || current.State.SetupSession != f.SessionHash {
			t.Fatal("setup not bound", current, err)
		}
		if err = r.EnableTOTP(ctx, f.SessionHash, f.SetupSecret, 1000, "[]"); err != nil {
			t.Fatal(err)
		}
		if _, err = r.CompleteOIDC(ctx, f, claims, "", expires); err != platform.ErrCredentials {
			t.Fatal("existing factor could be replaced", err)
		}
	}
}
