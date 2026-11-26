// Author: yunnuo <ymz@ebox.vip>
// Description: Management entry admission preserves shared identity and checks current grants atomically.
package platformsql

import (
	"errors"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestManagementLoginAdmission(t *testing.T) {
	store, repo, owner := scopeSecurityStore(t)
	ctx := t.Context()
	password := "workspace-test-password-strong"
	hash, err := platform.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	member, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "workspace-member", Email: "workspace-member@example.test", Role: "user"}, hash, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	service := platform.New(repo)
	input := contracts.LoginInput{Username: member.Username, Password: password}
	if _, token, err := service.LoginForWorkspace(ctx, input, "ordinary-admin", false, false, 1, true); !errors.Is(err, platform.ErrForbidden) || token != "" {
		t.Fatalf("ordinary account admitted: %q %v", token, err)
	}
	var count int
	if err := store.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM unicore_sessions WHERE user_id=?", member.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rejected entry created a session: %d %v", count, err)
	}
	if _, token, err := service.Login(ctx, input, "ordinary-user", false, false, 1); err != nil || token == "" {
		t.Fatalf("ordinary login unavailable: %v", err)
	}
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Management entry", Permissions: []string{"admin:access"}}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	roles := []string{"user", role.ID}
	if _, err := repo.UpdateUser(ctx, member.ID, contracts.UserUpdate{Status: "active", RoleIds: &roles}, owner.ID); err != nil {
		t.Fatal(err)
	}
	session, token, err := service.LoginForWorkspace(ctx, input, "custom-admin", false, false, 1, true)
	if err != nil || token == "" || platform.IsSuper(session.User) {
		t.Fatalf("delegated management entry rejected: %+v %v", session, err)
	}
	if shared, err := service.Session(ctx, token); err != nil || shared.User.ID != member.ID {
		t.Fatalf("management login did not share identity: %+v %v", shared, err)
	}
	roles = []string{"user"}
	if _, err := repo.UpdateUser(ctx, member.ID, contracts.UserUpdate{Status: "active", RoleIds: &roles}, owner.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Session(ctx, token); err == nil {
		t.Fatal("management session survived role revocation")
	}
	// Even if password verification saw the previous role projection, issuance
	// must re-read admission under the same installation lock as role changes.
	if err := repo.CreateSession(ctx, "stale-management-attempt", member.ID, int(time.Now().Unix())+3600, hash, true); !errors.Is(err, platform.ErrForbidden) {
		t.Fatalf("stale management grants accepted during issuance: %v", err)
	}
	if err := store.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM unicore_sessions WHERE user_id=?", member.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rejected stale entry created a session: %d %v", count, err)
	}
}
