// Author: yunnuo <ymz@ebox.vip>
// Description: Cross-dialect personal-center proofs, persistent throttles, factor races and OIDC gating.
package platformsql

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
)

func exercisePersonal(t *testing.T, ctx context.Context, store *sqlstore.Store, admin contracts.User) {
	t.Helper()
	for _, administrators := range []bool{false, true} {
		r := &Repository{Store: store, Administrators: administrators}
		identity := platform.New(r)
		name := "personal"
		if administrators {
			name += "_management"
		}
		user, err := identity.Create(ctx, contracts.UserCreate{Username: name, Email: name + "@example.test", Password: "test-password-strong", Role: r.roleID()}, admin.ID)
		if err != nil {
			t.Fatal(err)
		}
		must := func(err error) {
			t.Helper()
			if err != nil {
				t.Fatal(err)
			}
		}
		issue := func() string {
			_, token, err := identity.Issue(platform.WithDevice(ctx, "192.0.2.10", "Dialect test device"), user, 1)
			must(err)
			return platform.Hash(token)
		}
		first := issue()
		second := issue()
		must(r.SaveDisplayName(ctx, first, "Personal name"))
		state, err := r.PersonalSession(ctx, first)
		must(err)
		if state.State.DisplayName != "Personal name" {
			t.Fatal("display name not saved")
		}
		// Invalid avatar bindings must roll back the name and preserve the prior reference.
		invalidAvatar := "missing-file"
		if err := r.SaveAccountProfile(ctx, first, "must roll back", &invalidAvatar); !errors.Is(err, platform.ErrInput) {
			t.Fatal(err)
		}
		state, err = r.PersonalSession(ctx, first)
		must(err)
		if state.State.DisplayName != "Personal name" {
			t.Fatal("invalid avatar partially saved name")
		}
		_, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_account_avatars(user_id,creator_realm,file_id,updated_at) VALUES(?,?,?,0)", user.ID, r.avatarRealm(), "prior-file")
		must(err)
		must(r.SaveAccountProfile(ctx, first, "Name with preserved avatar", nil))
		avatar, err := r.UserAvatar(ctx, user.ID)
		must(err)
		if avatar != "prior-file" {
			t.Fatal("omitted avatar cleared reference")
		}
		peer, err := identity.Create(ctx, contracts.UserCreate{Username: name + "_peer", Email: name + "_peer@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
		must(err)
		otherRealm := "user"
		_, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_account_avatars(user_id,creator_realm,file_id,updated_at) VALUES(?,?,?,0)", peer.ID, otherRealm, "other-account-file")
		must(err)
		empty := ""
		must(r.SaveAccountProfile(ctx, first, "Name after clear", &empty))
		avatar, err = r.UserAvatar(ctx, user.ID)
		must(err)
		if avatar != "" {
			t.Fatal("empty avatar did not clear reference")
		}
		var otherAvatar string
		must(store.Row(ctx, store.DB, "SELECT file_id FROM unicore_account_avatars WHERE user_id=? AND creator_realm=?", peer.ID, otherRealm).Scan(&otherAvatar))
		if otherAvatar != "other-account-file" {
			t.Fatal("clear changed another account avatar")
		}
		now := int(time.Now().Unix())
		proof := platform.EmailChange{ID: platform.Token(), UserID: user.ID, SessionHash: first, Original: user.Email, Target: user.Email, Digest: platform.Hash("proof"), Payload: "sealed mail", Created: now - 120, Expires: now + 600}
		must(r.QueueEmailChange(ctx, proof))
		resend := proof
		resend.ID = platform.Token()
		resend.Created = now - 119
		if err = r.QueueEmailChange(ctx, resend); !errors.Is(err, platform.ErrRateLimited) {
			t.Fatal("resend cooldown lost", err)
		}
		for range 5 {
			if err = r.VerifyEmailChange(ctx, first, proof.ID, "wrong", false); !errors.Is(err, platform.ErrAccountToken) {
				t.Fatal("invalid email proof", err)
			}
		}
		if err = r.VerifyEmailChange(ctx, first, proof.ID, proof.Digest, false); !errors.Is(err, platform.ErrAccountToken) {
			t.Fatal("attempt limit bypass", err)
		}
		proof.ID = platform.Token()
		proof.Created = now - 59
		must(r.QueueEmailChange(ctx, proof))
		must(r.VerifyEmailChange(ctx, first, proof.ID, proof.Digest, false))
		next := proof
		next.ID = platform.Token()
		next.ParentID = proof.ID
		next.Target = name + "-changed@example.test"
		next.Created = now
		next.Digest = platform.Hash("next-proof")
		invalid := next
		invalid.SessionHash = second
		if err = r.QueueEmailChange(ctx, invalid); !errors.Is(err, platform.ErrAccountToken) {
			t.Fatal("email proof not session bound", err)
		}
		must(r.QueueEmailChange(ctx, next))
		must(r.VerifyEmailChange(ctx, first, next.ID, next.Digest, true))
		if _, _, err = r.Session(ctx, second); !errors.Is(err, platform.ErrCredentials) {
			t.Fatal("mailbox change retained other device", err)
		}
		second = issue()
		account, err := r.FindAccount(ctx, user.Username)
		must(err)
		must(r.SaveTOTPSetup(ctx, first, account.PasswordHash, "sealed-secret", now+60))
		if err = r.EnableTOTP(ctx, second, "sealed-secret", 1000, "[]"); !errors.Is(err, platform.ErrMFAInvalid) {
			t.Fatal("setup not session bound", err)
		}
		for range 5 {
			if err = r.EnableTOTP(ctx, first, "sealed-secret", -1, "[]"); !errors.Is(err, platform.ErrMFAInvalid) {
				t.Fatal("invalid setup proof", err)
			}
		}
		if err = r.EnableTOTP(ctx, first, "sealed-secret", 1000, "[]"); !errors.Is(err, platform.ErrMFAInvalid) {
			t.Fatal("setup attempts not durable", err)
		}
		must(r.SaveTOTPSetup(ctx, first, account.PasswordHash, "fresh-sealed-secret", now+60))
		recovery := platform.Hash(user.ID + ":recovery-secret-code")
		raw, _ := json.Marshal([]string{recovery})
		must(r.EnableTOTP(ctx, first, "fresh-sealed-secret", 1000, string(raw)))
		if _, _, err = r.Session(ctx, second); !errors.Is(err, platform.ErrCredentials) {
			t.Fatal("enrollment retained other device", err)
		}
		second = issue()
		third := issue()
		if _, _, err = r.Session(ctx, second); !errors.Is(err, platform.ErrMFA) {
			t.Fatal("new session bypassed second factor", err)
		}
		// Recovery codes are a single shared account proof, so concurrent consumption has exactly one winner.
		var wg sync.WaitGroup
		results := make(chan error, 2)
		for _, hash := range []string{second, third} {
			wg.Go(func() { results <- r.UseFactor(ctx, hash, "fresh-sealed-secret", -1, recovery, false) })
		}
		wg.Wait()
		close(results)
		success := 0
		for err := range results {
			if err == nil {
				success++
			} else if !errors.Is(err, platform.ErrMFAInvalid) {
				t.Fatal(err)
			}
		}
		if success != 1 {
			t.Fatal("recovery code consumed multiple times", success)
		}
		if err = r.UseFactor(ctx, first, "fresh-sealed-secret", 1000, "", true); !errors.Is(err, platform.ErrMFAInvalid) {
			t.Fatal("TOTP replay accepted", err)
		}
		// Enterprise login creates the same unverified sessions, including for accounts that already have TOTP.
		issuer, subject := "https://idp.example.test", "personal-"+user.ID
		claims := platform.OIDCClaims{Issuer: issuer, Subject: subject, Email: account.User.Email, EmailVerified: true}
		identityHash := platform.Hash(issuer + "\x00" + subject)
		_, err = r.exec(ctx, store.DB, "INSERT INTO unicore_external_identities(identity_hash,user_id,issuer,subject,created_at) VALUES(?,?,?,?,?)", identityHash, user.ID, issuer, subject, now)
		must(err)
		values, err := store.ReadSettings(ctx)
		must(err)
		values["oidc.enabled"] = "true"
		values["oidc.issuer"] = issuer
		values["oidc.client_id"] = "test-client"
		must(store.SaveSettings(ctx, values, admin.ID))
		oidcToken := platform.Token()
		_, err = r.CompleteOIDC(platform.WithDevice(ctx, "192.0.2.11", "OIDC device"), platform.OIDCFlow{Mode: "login", Fingerprint: settings.OIDCFingerprint(values)}, claims, platform.Hash(oidcToken), now+3600)
		must(err)
		if _, err = identity.Session(ctx, oidcToken); !errors.Is(err, platform.ErrMFA) {
			t.Fatal("OIDC login bypassed second factor", err)
		}
		must(r.UseFactor(ctx, first, "fresh-sealed-secret", 1001, "", true))
		devices, err := r.LoginDevices(ctx, first)
		must(err)
		if len(devices.Items) != 1 || !devices.Items[0].Current {
			t.Fatal("disable did not revoke other sessions", devices)
		}
	}
}
