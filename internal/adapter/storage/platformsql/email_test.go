// Author: yunnuo <ymz@ebox.vip>
// Description: Cross-dialect challenge abuse limits, credential races and one-use session creation.
package platformsql

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
	"sync"
	"testing"
	"time"
)

func exerciseEmailCodes(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, a *platform.Accounts, email string) {
	t.Helper()
	now := int(time.Now().Unix())
	makeCode := func(purpose string) platform.EmailChallenge {
		return platform.EmailChallenge{ID: platform.Token(), Purpose: purpose, Digest: a.Mail.Secrets.Digest("test:" + purpose + ":012345"), Created: now - 61, Expires: now + 600, Payload: a.Mail.Encrypt(mailer.Message{To: email, Subject: "synthetic code", Body: "012345"})}
	}
	consume := func(c platform.EmailChallenge, digest string) (contracts.User, error) {
		return r.ConsumeEmailChallenge(ctx, c.ID, c.Purpose, digest, "changed-password-strong", platform.Hash(platform.Token()), now+3600, now)
	}
	c := makeCode("login")
	if err := r.QueueEmailChallenge(ctx, email, c); err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := store.Row(ctx, store.DB, "SELECT code_digest FROM email_challenges WHERE id=?", c.ID).Scan(&stored); err != nil || stored == "012345" || len(stored) != 64 {
		t.Fatal("invalid code digest", err)
	}
	// Repeated request within 60 seconds leaves the original code in place.
	next := makeCode("login")
	next.Created = c.Created + 1
	if err := r.QueueEmailChallenge(ctx, email, next); err != nil {
		t.Fatal(err)
	}
	var count int
	_ = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM email_challenges WHERE id=?", next.ID).Scan(&count)
	if count != 0 {
		t.Fatal("persistent resend cooldown bypassed")
	}
	if _, err := r.ConsumeEmailChallenge(ctx, c.ID, "reset", c.Digest, "", "", now+3600, now); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("cross-purpose code accepted", err)
	}
	for range 5 {
		if _, err := consume(c, "wrong"); !errors.Is(err, platform.ErrAccountToken) {
			t.Fatal("wrong code accepted", err)
		}
	}
	if _, err := consume(c, c.Digest); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("locked code accepted", err)
	}
	var payload string
	_ = store.Row(ctx, store.DB, "SELECT payload FROM mail_jobs WHERE token_hash=?", c.ID).Scan(&payload)
	if payload != "" {
		t.Fatal("locked code retained pending mail")
	}
	// A fresh code atomically creates exactly one session under concurrent submissions.
	c = makeCode("login")
	c.Created = now
	if err := r.QueueEmailChallenge(ctx, email, c); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := consume(c, c.Digest); results <- err }()
	}
	wg.Wait()
	close(results)
	winners := 0
	for err := range results {
		if err == nil {
			winners++
		} else if !errors.Is(err, platform.ErrAccountToken) {
			t.Fatal(err)
		}
	}
	if winners != 1 {
		t.Fatal("code replayed", winners)
	}
	expired := makeCode("reset")
	expired.Expires = now - 1
	if err := r.QueueEmailChallenge(ctx, email, expired); err != nil {
		t.Fatal(err)
	}
	if _, err := consume(expired, expired.Digest); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("expired code accepted", err)
	}
}
