// Author: yunnuo <ymz@ebox.vip>
// Description: MCP OAuth storage tests: family-state issuance gates, absolute deadlines, consent anchor revocation and code scope snapshots.
package platformsql

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/platform/mcpoauth"
	"github.com/yunnuo/unicore/migrations/runner"
)

func newMcpOauthRepository(t *testing.T) (*Repository, context.Context) {
	t.Helper()
	ctx := context.Background()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "mcp-oauth.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: "sqlite", Profile: "web-platform"}); err != nil {
		t.Fatal(err)
	}
	return &Repository{Store: store}, ctx
}

func oauthGrant(t *testing.T, r *Repository, ctx context.Context) mcpoauth.Grant {
	t.Helper()
	grant := mcpoauth.Grant{
		ID: platform.Token(), UserID: "user-1", ClientID: "client-1", RoleID: "role-a",
		Resource: "https://unicore.example/mcp", Scopes: []string{mcpoauth.ScopeRead, mcpoauth.ScopeOffline},
		Status: mcpoauth.GrantActive, SecurityAnchor: platform.Hash("password-v1"), ConsentEpoch: 1, CreatedAt: int(time.Now().Unix()),
	}
	if _, err := r.CreateGrant(ctx, grant); err != nil {
		t.Fatalf("create grant: %v", err)
	}
	return grant
}

func TestOAuthFamilyGateAndDeadline(t *testing.T) {
	r, ctx := newMcpOauthRepository(t)
	// First issuance creates the family state row; the refresh insert fixes
	// the absolute deadline.
	if err := r.SaveToken(ctx, "hash-a", mcpoauth.TokenAccess, "grant-1", "family-1", "", `["mcp.read"]`, 1, time.Now().Unix()+900, 0); err != nil {
		t.Fatalf("first access insert: %v", err)
	}
	if err := r.SaveToken(ctx, "hash-b", mcpoauth.TokenRefresh, "grant-1", "family-1", "hash-a", `["mcp.read","offline_access"]`, 1, 7000, 7000); err != nil {
		t.Fatalf("first refresh insert: %v", err)
	}
	deadline, err := r.FamilyDeadline(ctx, "family-1")
	if err != nil || deadline != 7000 {
		t.Fatalf("family deadline = %d, %v; want 7000", deadline, err)
	}
	// Rotation cannot push the deadline: a later refresh insert keeps the
	// stored absolute value instead of overwriting it.
	if err = r.SaveToken(ctx, "hash-c", mcpoauth.TokenRefresh, "grant-1", "family-1", "hash-b", `["mcp.read","offline_access"]`, 1, 99999, 99999); err != nil {
		t.Fatalf("rotation insert: %v", err)
	}
	if deadline, _ = r.FamilyDeadline(ctx, "family-1"); deadline != 7000 {
		t.Fatalf("rotation extended the family deadline to %d", deadline)
	}
	// A missing family reports invalid grant: rotation must never relax to a
	// fresh window when the state row is unreadable.
	if _, err = r.FamilyDeadline(ctx, "family-missing"); err != mcpoauth.ErrInvalidGrant {
		t.Fatalf("missing family deadline error = %v, want ErrInvalidGrant", err)
	}
}

func TestOAuthFamilyRevocationRefusesMinting(t *testing.T) {
	r, ctx := newMcpOauthRepository(t)
	if err := r.SaveToken(ctx, "hash-a", mcpoauth.TokenAccess, "grant-1", "family-1", "", `["mcp.read"]`, 1, time.Now().Unix()+900, 0); err != nil {
		t.Fatalf("initial insert: %v", err)
	}
	now := time.Now().Unix()
	if err := r.RevokeFamily(ctx, "family-1", now); err != nil {
		t.Fatalf("revoke family: %v", err)
	}
	// Every later member is refused: no token can outlive a committed
	// revocation by joining afterwards.
	if err := r.SaveToken(ctx, "hash-b", mcpoauth.TokenRefresh, "grant-1", "family-1", "hash-a", `["mcp.read"]`, 1, now+7000, now+7000); err != mcpoauth.ErrInvalidGrant {
		t.Fatalf("mint into revoked family = %v, want ErrInvalidGrant", err)
	}
	// Revocation of a family without any issuance still leaves a revoked
	// marker, so a racing first issuance cannot sneak in.
	if err := r.RevokeFamily(ctx, "family-2", now); err != nil {
		t.Fatalf("revoke unknown family: %v", err)
	}
	if err := r.SaveToken(ctx, "hash-c", mcpoauth.TokenAccess, "grant-1", "family-2", "", `["mcp.read"]`, 1, now+900, 0); err != mcpoauth.ErrInvalidGrant {
		t.Fatalf("mint into pre-revoked family = %v, want ErrInvalidGrant", err)
	}
	// Revocation is idempotent.
	if err := r.RevokeFamily(ctx, "family-1", now); err != nil {
		t.Fatalf("repeated revoke: %v", err)
	}
}

func TestOAuthGrantTokensSweepFamilies(t *testing.T) {
	r, ctx := newMcpOauthRepository(t)
	grant := oauthGrant(t, r, ctx)
	now := time.Now().Unix()
	if err := r.SaveToken(ctx, "hash-a", mcpoauth.TokenAccess, grant.ID, "family-1", "", `["mcp.read"]`, 1, now+900, 0); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := r.RevokeGrantTokens(ctx, grant.ID, now); err != nil {
		t.Fatalf("revoke grant tokens: %v", err)
	}
	// The tokens-table guard also refuses minting into a family that only
	// carries revoked members, independent of the family row.
	if err := r.SaveToken(ctx, "hash-b", mcpoauth.TokenAccess, grant.ID, "family-1", "", `["mcp.read"]`, 1, now+900, 0); err != mcpoauth.ErrInvalidGrant {
		t.Fatalf("mint into swept family = %v, want ErrInvalidGrant", err)
	}
	// The sweep removes the orphaned family rows.
	if err := r.SweepExpired(ctx, now+100000); err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if _, err := r.FamilyDeadline(ctx, "family-1"); err != mcpoauth.ErrInvalidGrant {
		t.Fatalf("swept family deadline error = %v, want ErrInvalidGrant", err)
	}
}

func TestOAuthConsentAnchorChangeRevokesArtifacts(t *testing.T) {
	r, ctx := newMcpOauthRepository(t)
	grant := oauthGrant(t, r, ctx)
	now := time.Now().Unix()
	if err := r.SaveToken(ctx, "hash-a", mcpoauth.TokenAccess, grant.ID, "family-1", "", `["mcp.read"]`, 1, now+900, 0); err != nil {
		t.Fatalf("insert: %v", err)
	}
	// Re-consent with an unchanged anchor keeps the standing tokens.
	if _, err := r.UpdateGrantConsent(ctx, grant.ID, []string{mcpoauth.ScopeRead, mcpoauth.ScopeWrite, mcpoauth.ScopeOffline}, platform.Hash("password-v1")); err != nil {
		t.Fatalf("unchanged anchor re-consent: %v", err)
	}
	record, err := r.Token(ctx, "hash-a")
	if err != nil || record.Revoked {
		t.Fatalf("unchanged anchor revoked the token: %+v %v", record, err)
	}
	if kept, err := r.Grant(ctx, grant.ID); err != nil || kept.ConsentEpoch != grant.ConsentEpoch {
		t.Fatalf("unchanged anchor moved the epoch: %+v %v", kept, err)
	}
	// A changed anchor (password rotation happened meanwhile) revokes every
	// artifact of the grant inside the same commit: re-authorizing must not
	// resurrect them.
	updated, err := r.UpdateGrantConsent(ctx, grant.ID, []string{mcpoauth.ScopeRead}, platform.Hash("password-v2"))
	if err != nil {
		t.Fatalf("anchor change re-consent: %v", err)
	}
	if strings.Join(updated.Scopes, ",") != mcpoauth.ScopeRead {
		t.Fatalf("updated scopes = %v, want read only", updated.Scopes)
	}
	if record, err = r.Token(ctx, "hash-a"); err != nil || !record.Revoked {
		t.Fatalf("anchor change did not revoke the token: %+v %v", record, err)
	}
	// The anchor change also advanced the immutable authorization version:
	// every artifact issued under the previous epoch stops validating even
	// when no revocation sweep reached it (an in-flight redemption).
	bumped, err := r.Grant(ctx, grant.ID)
	if err != nil || bumped.ConsentEpoch != grant.ConsentEpoch+1 {
		t.Fatalf("anchor change epoch = %+v %v, want %d", bumped, err, grant.ConsentEpoch+1)
	}
	if err = r.SaveToken(ctx, "hash-b", mcpoauth.TokenAccess, grant.ID, "family-1", "", `["mcp.read"]`, 1, now+900, 0); err != mcpoauth.ErrInvalidGrant {
		t.Fatalf("mint after anchor revocation = %v, want ErrInvalidGrant", err)
	}
}

func TestOAuthCodeSnapshotRoundTrip(t *testing.T) {
	r, ctx := newMcpOauthRepository(t)
	if err := r.SaveCode(ctx, "code-hash", "grant-1", "https://app.example/cb", "challenge", "S256", `["mcp.read","offline_access"]`, 1, time.Now().Unix()+60); err != nil {
		t.Fatalf("save code: %v", err)
	}
	grantID, redirect, challenge, method, scopes, epoch, err := r.ConsumeCode(ctx, "code-hash", time.Now().Unix())
	if err != nil {
		t.Fatalf("consume code: %v", err)
	}
	if grantID != "grant-1" || redirect != "https://app.example/cb" || challenge != "challenge" || method != "S256" {
		t.Fatalf("consumed = %s %s %s %s", grantID, redirect, challenge, method)
	}
	if scopes != `["mcp.read","offline_access"]` {
		t.Fatalf("code scope snapshot = %s", scopes)
	}
	if epoch != 1 {
		t.Fatalf("code consent epoch = %d, want 1", epoch)
	}
	// A second consume finds nothing.
	if _, _, _, _, _, _, err = r.ConsumeCode(ctx, "code-hash", time.Now().Unix()); err != mcpoauth.ErrInvalidCode {
		t.Fatalf("replayed code = %v, want ErrInvalidCode", err)
	}
}

// TestOAuthFamilyIssuanceVsRevocation interleaves an in-flight issuance with
// a revocation on a real PostgreSQL or MySQL instance: the issuance holds the
// family row lock while the revocation marks and commits, and whichever way
// the commit ordering lands, the family ends without a live survivor. The
// tokens-only guard lost exactly this race on PostgreSQL's separate
// INSERT/NOT EXISTS snapshots.
//
// Both dialects reuse the shared harness database (see the ordering note in
// the subtest); unique identifiers and row cleanup keep the scenario
// collision-free without disturbing the migration harness.
func TestOAuthFamilyIssuanceVsRevocation(t *testing.T) {
	for _, dialect := range []string{"postgres", "mysql"} {
		dsn := os.Getenv("UNICORE_TEST_" + map[string]string{"postgres": "POSTGRES_DSN", "mysql": "MYSQL_DSN"}[dialect])
		if dsn == "" {
			continue
		}
		t.Run(dialect, func(t *testing.T) {
			ctx := context.Background()
			// The file sorts after repository_test.go, so the shared harness
			// database is already migrated when this runs; Apply stays a
			// no-op. Unique identifiers keep the scenario collision-free and
			// the cleanup removes exactly the rows it created.
			store, err := webdb.Open(ctx, dialect, dsn, filepath.Join(t.TempDir(), "mcp-oauth.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: dialect, Profile: "web-platform"}); err != nil {
				t.Fatal(err)
			}
			r := &Repository{Store: store}
			family := "family-" + platform.Token()
			t.Cleanup(func() {
				_, _ = r.exec(ctx, store.DB, "DELETE FROM unicore_mcp_oauth_tokens WHERE family_id=?", family)
				_, _ = r.exec(ctx, store.DB, "DELETE FROM unicore_mcp_oauth_families WHERE family_id=?", family)
			})
			now := time.Now().Unix()
			if err = r.SaveToken(ctx, "hash-a-"+family, mcpoauth.TokenAccess, "grant-1", family, "", `["mcp.read"]`, 1, now+900, 0); err != nil {
				t.Fatalf("initial insert: %v", err)
			}
			// The in-flight issuance opens its transaction and passes the
			// gate, then parks with the family row locked.
			parked := make(chan struct{})
			release := make(chan struct{})
			var issuer sync.WaitGroup
			issuer.Add(1)
			go func() {
				defer issuer.Done()
				tx, txErr := store.DB.BeginTx(ctx, nil)
				if txErr != nil {
					t.Errorf("issuer tx: %v", txErr)
					return
				}
				defer tx.Rollback()
				if _, txErr = r.exec(ctx, tx, familyGate, int64(0), family); txErr != nil {
					t.Errorf("issuer gate: %v", txErr)
					return
				}
				close(parked)
				<-release
				if _, txErr = r.exec(ctx, tx, "INSERT INTO unicore_mcp_oauth_tokens(token_hash,kind,grant_id,family_id,parent_id,scopes,expires_at) VALUES(?,?,?,?,?,?,?)", "hash-b-"+family, mcpoauth.TokenRefresh, "grant-1", family, "hash-a-"+family, `["mcp.read","offline_access"]`, now+7000); txErr != nil {
					t.Errorf("issuer insert: %v", txErr)
					return
				}
				if txErr = tx.Commit(); txErr != nil {
					t.Errorf("issuer commit: %v", txErr)
				}
			}()
			<-parked
			// The revocation marks the family; its UPDATE waits for the
			// issuer's commit, then sweeps the freshly inserted member.
			revoked := make(chan error, 1)
			go func() { revoked <- r.RevokeFamily(ctx, family, now+1) }()
			time.Sleep(200 * time.Millisecond)
			close(release)
			issuer.Wait()
			if err = <-revoked; err != nil {
				t.Fatalf("revoke: %v", err)
			}
			record, err := r.Token(ctx, "hash-b-"+family)
			if err != nil {
				t.Fatalf("read swept token: %v", err)
			}
			if !record.Revoked {
				t.Fatal("the in-flight issuance survived the committed revocation unrevoked")
			}
		})
	}
}
