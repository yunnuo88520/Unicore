// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator email and OIDC entry reject ordinary users transactionally.
package platformsql

import (
	"errors"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
)

func TestManagementEmailAndOIDCAdmission(t *testing.T) {
	store, repo, owner := scopeSecurityStore(t)
	ctx := t.Context()
	member, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "entry-member", Email: "entry-member@example.test", Role: "user"}, "unused-test-hash", owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	admins := &Repository{Store: store, Administrators: true}
	now := int(time.Now().Unix())
	challenge := platform.EmailChallenge{ID: platform.Token(), Purpose: "login", Digest: platform.Hash("123456"), Payload: "sealed", Created: now, Expires: now + 600}
	if err = admins.QueueEmailChallenge(ctx, member.Email, challenge); err != nil {
		t.Fatal(err)
	}
	emailSession := platform.Hash(platform.Token())
	if _, err = admins.ConsumeEmailChallenge(ctx, challenge.ID, "login", challenge.Digest, "", emailSession, now+600, now); !errors.Is(err, platform.ErrForbidden) {
		t.Fatalf("ordinary member accepted by administrator email entry: %v", err)
	}
	assertNoSession := func(tokenHash string) {
		t.Helper()
		var count int
		if err := store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_sessions WHERE token_hash=?", tokenHash).Scan(&count); err != nil || count != 0 {
			t.Fatalf("rejected entry created session: %d %v", count, err)
		}
	}
	assertNoSession(emailSession)
	if user, err := repo.ConsumeEmailChallenge(ctx, challenge.ID, "login", challenge.Digest, "", platform.Hash(platform.Token()), now+600, now); err != nil || user.ID != member.ID {
		t.Fatalf("ordinary email workspace entry unavailable after admin denial: %+v %v", user, err)
	}

	values := settings.Defaults("web-platform")
	values["oidc.enabled"] = "true"
	values["oidc.issuer"] = "https://idp.example.test"
	values["oidc.client_id"] = "entry-test"
	if err = store.SaveSettings(ctx, values, owner.ID); err != nil {
		t.Fatal(err)
	}
	claims := platform.OIDCClaims{Issuer: values["oidc.issuer"], Subject: "entry-member", Email: member.Email, EmailVerified: true}
	identityHash := platform.Hash(claims.Issuer + "\x00" + claims.Subject)
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_external_identities(identity_hash,user_id,issuer,subject,created_at) VALUES(?,?,?,?,?)", identityHash, member.ID, claims.Issuer, claims.Subject, now); err != nil {
		t.Fatal(err)
	}
	flow := platform.OIDCFlow{Mode: "login", Fingerprint: settings.OIDCFingerprint(values)}
	expires := now + 3600
	oidcSession := platform.Hash(platform.Token())
	if _, err = admins.CompleteOIDC(ctx, flow, claims, oidcSession, expires); !errors.Is(err, platform.ErrForbidden) {
		t.Fatalf("ordinary linked member accepted by administrator OIDC entry: %v", err)
	}
	assertNoSession(oidcSession)
	if user, err := repo.CompleteOIDC(ctx, flow, claims, platform.Hash(platform.Token()), expires); err != nil || user.ID != member.ID {
		t.Fatalf("ordinary OIDC workspace entry unavailable after admin denial: %+v %v", user, err)
	}

	userRealm := "user"
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Delegated management entry", Realm: &userRealm, Permissions: []string{"admin:access"}}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: rolePtr(role.ID), Status: "active"}, owner.ID); err != nil {
		t.Fatal(err)
	}
	allowedChallenge := platform.EmailChallenge{ID: platform.Token(), Purpose: "login", Digest: platform.Hash("654321"), Payload: "sealed", Created: now + 61, Expires: now + 661}
	if err = admins.QueueEmailChallenge(ctx, member.Email, allowedChallenge); err != nil {
		t.Fatal(err)
	}
	if user, err := admins.ConsumeEmailChallenge(ctx, allowedChallenge.ID, "login", allowedChallenge.Digest, "", platform.Hash(platform.Token()), now+3600, now+61); err != nil || user.ID != member.ID || !platform.HasManagementAccess(user) {
		t.Fatalf("governance user role rejected by administrator email entry: %+v %v", user, err)
	}
	allowedOIDCSession := platform.Hash(platform.Token())
	if user, err := admins.CompleteOIDC(ctx, flow, claims, allowedOIDCSession, expires); err != nil || user.ID != member.ID || !platform.HasManagementAccess(user) {
		t.Fatalf("governance user role rejected by administrator OIDC entry: %+v %v", user, err)
	}
}
