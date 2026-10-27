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
)

func exerciseOIDC(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, admin contracts.User) {
	t.Helper()
	for _, q := range []string{"DROP TABLE oidc_flows", "DROP TABLE external_identities", "DELETE FROM schema_migrations WHERE version=6"} {
		if _, err := store.Exec(ctx, store.DB, q); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Migrate(ctx, true); err != nil {
		t.Fatal("upgrade from M2d", err)
	}
	// Retry after only the first DDL has persisted (as can happen with MySQL).
	for _, q := range []string{"DROP TABLE oidc_flows", "DELETE FROM schema_migrations WHERE version=6"} {
		if _, err := store.Exec(ctx, store.DB, q); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Migrate(ctx, true); err != nil {
		t.Fatal("partial DDL recovery", err)
	}
	if err := store.Migrate(ctx, true); err != nil {
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
	info, err := r.OIDCAccount(ctx, member.ID)
	if err != nil || !info.Linked || info.HasLocalPassword {
		t.Fatal(info, err)
	}
	// Existing identity, never email, controls subsequent login.
	claims.Email = admin.Email
	again, err := complete(f, claims)
	if err != nil || again.ID != member.ID {
		t.Fatal("identity reidentified by email", again, err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: "user", Status: "disabled"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = complete(f, claims); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("disabled identity signed in", err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: "super_admin", Status: "active"}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("cross realm conversion", err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: "user", Status: "active"}, admin.ID); err != nil {
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
}
