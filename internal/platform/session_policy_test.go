// Author: yunnuo <ymz@ebox.vip>
// Description: Persisted idle/absolute expiry, passive polling and independent realm policies on real SQL sessions.
package platform_test

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
	"os"
	"strings"
	"testing"
	"time"
)

func TestSessionSecurityPolicy(t *testing.T) {
	ctx := context.Background()
	m, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	token, _ := os.ReadFile(m.TokenPath())
	_, admin, err := m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Unicore", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	db, config, memberIdentity, _ := m.Services()
	adminIdentity := m.Identity(true)
	member, err := memberIdentity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "member-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, memberToken, err := memberIdentity.Issue(ctx, member, 24)
	if err != nil {
		t.Fatal(err)
	}
	_, adminToken, err := adminIdentity.Issue(ctx, admin, 24)
	if err != nil {
		t.Fatal(err)
	}
	patch := func(changes ...contracts.SettingChange) {
		t.Helper()
		if _, err := config.Patch(ctx, contracts.SettingPatch{Changes: changes}, admin.ID); err != nil {
			t.Fatal(err)
		}
	}
	patch(contracts.SettingChange{Key: "security.user_idle_minutes", Value: "1"}, contracts.SettingChange{Key: "security.admin_idle_minutes", Value: "2"}, contracts.SettingChange{Key: "security.admin_max_minutes", Value: "3"}, contracts.SettingChange{Key: "security.force_user_2fa", Value: "true"})
	userProfile, err := memberIdentity.Personal.Profile(ctx, memberToken)
	if err != nil || !userProfile.Force2fa || userProfile.CanDisable2fa {
		t.Fatal(userProfile, err)
	}
	adminProfile, err := adminIdentity.Personal.Profile(ctx, adminToken)
	if err != nil || adminProfile.Force2fa {
		t.Fatal("user-only 2FA leaked into administrator realm", adminProfile, err)
	}
	// Forced 2FA follows the identity realm, not the super_admin flag: a
	// restricted administrator is an administrator-domain session, so the user
	// switch does not reach it and the administrator switch does.
	administratorRealm := "administrator"
	role, err := adminIdentity.Store.CreateRole(ctx, contracts.RoleSaveInput{Name: "运营管理员", Realm: &administratorRealm, Permissions: []string{"users:read"}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	restricted, err := adminIdentity.Create(ctx, contracts.UserCreate{Username: "restricted", Email: "restricted@example.test", Password: "restricted-strong", Role: role.ID}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, restrictedToken, err := adminIdentity.Issue(ctx, restricted, 24)
	if err != nil {
		t.Fatal(err)
	}
	restrictedProfile, err := adminIdentity.Personal.Profile(ctx, restrictedToken)
	if err != nil || restrictedProfile.Force2fa {
		t.Fatal("user 2FA switch reached restricted administrator", restrictedProfile, err)
	}
	patch(contracts.SettingChange{Key: "security.force_user_2fa", Value: "false"}, contracts.SettingChange{Key: "security.force_admin_2fa", Value: "true"})
	for _, account := range []struct {
		profile contracts.AccountProfile
		realm   string
	}{
		{func() contracts.AccountProfile {
			p, e := adminIdentity.Personal.Profile(ctx, adminToken)
			if e != nil {
				t.Fatal(e)
			}
			return p
		}(), "super"},
		{func() contracts.AccountProfile {
			p, e := adminIdentity.Personal.Profile(ctx, restrictedToken)
			if e != nil {
				t.Fatal(e)
			}
			return p
		}(), "restricted"},
	} {
		if !account.profile.Force2fa {
			t.Fatal("administrator 2FA switch missed", account.realm, account.profile)
		}
	}
	memberProfile, err := memberIdentity.Personal.Profile(ctx, memberToken)
	if err != nil || memberProfile.Force2fa {
		t.Fatal("administrator 2FA switch reached user realm", memberProfile, err)
	}
	patch(contracts.SettingChange{Key: "security.force_admin_2fa", Value: "false"}, contracts.SettingChange{Key: "security.force_user_2fa", Value: "false"})
	now := int(time.Now().Unix())
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := db.DB.ExecContext(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec("UPDATE unicore_session_details SET last_seen_at=? WHERE token_hash=?", now-30, platform.Hash(memberToken))
	if _, err = memberIdentity.Session(platform.WithPassive(ctx), memberToken); err != nil {
		t.Fatal(err)
	}
	var last int
	if err = db.DB.QueryRowContext(ctx, "SELECT last_seen_at FROM unicore_session_details WHERE token_hash=?", platform.Hash(memberToken)).Scan(&last); err != nil || last != now-30 {
		t.Fatal("passive polling extended idle", last, err)
	}
	if _, err = memberIdentity.Session(ctx, memberToken); err != nil {
		t.Fatal(err)
	}
	if err = db.DB.QueryRowContext(ctx, "SELECT last_seen_at FROM unicore_session_details WHERE token_hash=?", platform.Hash(memberToken)).Scan(&last); err != nil || last < now {
		t.Fatal("active request failed to renew idle", last, err)
	}
	exec("UPDATE unicore_session_details SET last_seen_at=? WHERE token_hash=?", now-61, platform.Hash(memberToken))
	if _, err = memberIdentity.Session(ctx, memberToken); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("user idle bypass", err)
	}
	if _, err = adminIdentity.Session(ctx, adminToken); err != nil {
		t.Fatal("member idle invalidated admin", err)
	}
	exec("UPDATE unicore_administrator_session_details SET created_at=?,last_seen_at=? WHERE token_hash=?", now-181, now, platform.Hash(adminToken))
	if _, err = adminIdentity.Session(ctx, adminToken); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("administrator maximum bypass", err)
	}
	// Failed attempts block the source IP without freezing another account/source or the other realm.
	patch(contracts.SettingChange{Key: "security.login_failure_limit", Value: "2"})
	for i := 0; i < 2; i++ {
		_, _, _ = memberIdentity.Login(ctx, contracts.LoginInput{Username: "member", Password: "wrong"}, "192.0.2.1", false, false, 24)
	}
	if _, _, err = memberIdentity.Login(ctx, contracts.LoginInput{Username: "member", Password: "member-password-strong"}, "192.0.2.1", false, false, 24); !errors.Is(err, platform.ErrRateLimited) {
		t.Fatal("IP ban bypass", err)
	}
	if _, _, err = memberIdentity.Login(ctx, contracts.LoginInput{Username: "member", Password: "member-password-strong"}, "192.0.2.2", false, false, 24); err != nil {
		t.Fatal("account frozen", err)
	}
	if _, _, err = adminIdentity.Login(ctx, contracts.LoginInput{Username: "admin", Password: "test-password-strong"}, "192.0.2.1", false, false, 24); err != nil {
		t.Fatal("ban crossed identity realms", err)
	}
}
