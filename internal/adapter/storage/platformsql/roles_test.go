// Author: yunnuo <ymz@ebox.vip>
// Description: Fixed roles, separate account stores and realm-specific credential revocation.
package platformsql

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"testing"
	"time"
)

func exerciseRoles(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, admin contracts.User) {
	t.Helper()
	admins := &Repository{Store: store, Administrators: true}
	identity, administrator := platform.New(r), platform.New(admins)
	// The same username and email represent independent accounts with different credentials.
	member, err := identity.Create(ctx, contracts.UserCreate{Username: admin.Username, Email: admin.Email, Password: "member-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if member.ID == admin.ID || len(member.Permissions) != 0 {
		t.Fatal("identities not separated")
	}
	if _, _, err = identity.Login(ctx, contracts.LoginInput{Username: admin.Username, Password: "test-password-strong"}, "realm-member", false, 1); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("administrator credential worked in user realm", err)
	}
	if _, _, err = administrator.Login(ctx, contracts.LoginInput{Username: admin.Username, Password: "member-password-strong"}, "realm-admin", false, 1); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("user credential worked in administrator realm", err)
	}
	_, memberToken, err := identity.Issue(ctx, member, 1)
	if err != nil {
		t.Fatal(err)
	}
	_, adminToken, err := administrator.Issue(ctx, admin, 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = identity.Session(ctx, adminToken); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("cross realm admin session", err)
	}
	if _, err = administrator.Session(ctx, memberToken); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("cross realm member session", err)
	}
	if _, err = r.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: "super_admin", Status: "active"}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("role conversion", err)
	}
	if _, err = r.CreateUser(ctx, contracts.UserCreate{Username: "escalate", Email: "escalate@example.test", Role: "user"}, "unused", member.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("member managed accounts", err)
	}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO role_permissions(role_id,permission_id) VALUES('user','settings:read')"); err != nil {
		t.Fatal(err)
	}
	account, err := r.FindAccount(ctx, member.Username)
	if err != nil || platform.Has(account.User, "settings:read") {
		t.Fatal("residual grant authorized", err)
	}
	if _, err = r.RoleOptions(ctx, member.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("member role catalogue", err)
	}
	options, err := r.RoleOptions(ctx, admin.ID)
	if err != nil || len(options.Items) != 2 {
		t.Fatal("role catalogue", err)
	}
	if err = identity.ChangePassword(ctx, member, contracts.ChangePasswordInput{CurrentPassword: "wrong-password-strong", Password: "next-password-strong"}, "change-member"); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("wrong current password", err)
	}
	if err = identity.ChangePassword(ctx, member, contracts.ChangePasswordInput{CurrentPassword: "member-password-strong", Password: "next-password-strong"}, "change-member"); err != nil {
		t.Fatal(err)
	}
	if _, err = identity.Session(ctx, memberToken); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("old member session survived", err)
	}
	if _, err = administrator.Session(ctx, adminToken); err != nil {
		t.Fatal("member password revoked administrator", err)
	}
	// Six-digit challenges and browser-bound enterprise proofs also stay in their realm.
	now := int(time.Now().Unix())
	challenge := platform.EmailChallenge{ID: platform.Token(), Purpose: "login", Digest: platform.Hash("654321"), Payload: "sealed", Created: now, Expires: now + 600}
	if err = admins.QueueEmailChallenge(ctx, admin.Email, challenge); err != nil {
		t.Fatal(err)
	}
	if _, err = r.ConsumeEmailChallenge(ctx, challenge.ID, "login", challenge.Digest, "", platform.Hash(platform.Token()), now+600, now); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("cross realm six-digit code", err)
	}
	if got, e := admins.ConsumeEmailChallenge(ctx, challenge.ID, "login", challenge.Digest, "", platform.Hash(platform.Token()), now+600, now); e != nil || got.ID != admin.ID {
		t.Fatal("administrator code", e)
	}
	if err = admins.CreateOIDCFlow(ctx, "administrator-flow", "browser", "sealed", int64(now+600)); err != nil {
		t.Fatal(err)
	}
	if _, err = r.ConsumeOIDCFlow(ctx, "administrator-flow", "browser"); !errors.Is(err, platform.ErrOIDC) {
		t.Fatal("cross realm enterprise proof", err)
	}
	if _, err = admins.ConsumeOIDCFlow(ctx, "administrator-flow", "browser"); err != nil {
		t.Fatal(err)
	}
	// A recovery proof from one realm cannot be consumed in the other.
	proof := platform.Hash(platform.Token())
	expiry := int(time.Now().Add(time.Minute).Unix())
	if err = admins.QueueAccountToken(ctx, admin.Email, "reset", proof, expiry, "sealed"); err != nil {
		t.Fatal(err)
	}
	if err = r.ConsumeAccountToken(ctx, proof, "reset", "hash", int(time.Now().Unix())); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("cross realm recovery", err)
	}
	if _, err = store.Exec(ctx, store.DB, "DELETE FROM role_permissions WHERE role_id='user'"); err != nil {
		t.Fatal(err)
	}
}
