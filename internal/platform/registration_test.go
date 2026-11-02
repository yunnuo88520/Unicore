// Author: yunnuo <ymz@ebox.vip>
// Description: Real registrations without SMTP and backend restriction enforcement across account flows.
package platform_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
)

func TestRegistrationWithoutMailAndRestrictions(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	m, err := install.Open(ctx, install.Options{DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	token, _ := os.ReadFile(m.TokenPath())
	_, admin, err := m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Unicore", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	db, config, identity, _ := m.Services()
	accounts := m.AccountService(false)
	patch := func(k, v string) {
		t.Helper()
		if _, err := config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: k, Value: v}}}, admin.ID); err != nil {
			t.Fatal(k, err)
		}
	}
	patch("account.registration_enabled", "true")
	patch("security.register_captcha", "false")
	policy, err := accounts.Policy(ctx)
	if err != nil || !policy.RegistrationEnabled || policy.EmailVerificationRequired || policy.MailReady {
		t.Fatal(policy, err)
	}
	if _, err = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "account.email_verification_required", Value: "true"}}}, admin.ID); !errors.Is(err, settings.ErrMailNotReady) {
		t.Fatal("verification enabled without tested SMTP", err)
	}
	input := contracts.RegisterInput{Username: "directmember", Email: "direct@example.test", Password: "safe-password-strong"}
	result, err := accounts.RegisterCode(ctx, input, "203.0.113.1")
	if err != nil || result.RegistrationComplete == nil || !*result.RegistrationComplete || result.ChallengeID != "" {
		t.Fatal(result, err)
	}
	session, raw, err := identity.Login(ctx, contracts.LoginInput{Username: input.Username, Password: input.Password}, "203.0.113.1", false, 1)
	if err != nil || session.User.Status != "active" {
		t.Fatal("direct registration not active", err)
	}
	if _, err = accounts.RequestCode(ctx, contracts.EmailRequest{Email: input.Email}, "203.0.113.1", "verify"); !errors.Is(err, platform.ErrFlowDisabled) {
		t.Fatal("unneeded verification enabled", err)
	}
	input.Username = "legacydirect"
	input.Email = "legacy@example.test"
	if err = accounts.Register(ctx, input, "203.0.113.2"); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = db.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM unicore_mail_jobs").Scan(&count); err != nil || count != 0 {
		t.Fatal("mail queued without SMTP", count, err)
	}
	patch("account.email_domains", "example.test")
	patch("account.email_domain_mode", "allowlist")
	input.Username = "restricted"
	input.Email = "restricted@other.test"
	if _, err = accounts.RegisterCode(ctx, input, "203.0.113.3"); !errors.Is(err, platform.ErrInput) {
		t.Fatal("suffix bypass", err)
	}
	patch("account.email_domain_mode", "blocklist")
	input.Email = "restricted@example.test"
	if err = accounts.Register(ctx, input, "203.0.113.3"); !errors.Is(err, platform.ErrInput) {
		t.Fatal("legacy suffix bypass", err)
	}
	patch("account.email_domain_mode", "unrestricted")
	for _, key := range []string{"account.username_blacklist", "account.nickname_blacklist", "account.password_blacklist"} {
		value := "STRicted"
		if key == "account.password_blacklist" {
			value = "SAFE-PASSWORD-STRONG"
		}
		patch(key, value)
		if _, err = accounts.RegisterCode(ctx, input, "203.0.113.3"); !errors.Is(err, platform.ErrInput) {
			t.Fatal(key, "bypassed", err)
		}
		patch(key, "")
	}
	patch("account.nickname_blacklist", "official")
	if _, err = identity.Personal.SaveName(ctx, raw, "The OFFICIAL team"); !errors.Is(err, platform.ErrInput) {
		t.Fatal("nickname restriction bypass", err)
	}
	patch("account.username_blacklist", "DIRECT")
	if _, err = identity.Personal.SaveName(ctx, raw, "Innocent name"); !errors.Is(err, platform.ErrInput) {
		t.Fatal("username profile restriction bypass", err)
	}
	patch("account.username_blacklist", "")
	patch("account.password_blacklist", "new-password-strong")
	if err = identity.ChangePassword(ctx, session.User, contracts.ChangePasswordInput{CurrentPassword: "safe-password-strong", Password: "NEW-password-strong"}, "203.0.113.1"); !errors.Is(err, platform.ErrInput) {
		t.Fatal("password restriction bypass", err)
	}
	patch("account.ip_blacklist", "203.0.113.*\n198.51.100.0/24\n2001:db8::/32")
	for _, ip := range []string{"203.0.113.3", "198.51.100.4", "2001:db8::1"} {
		if _, _, err = identity.Login(ctx, contracts.LoginInput{Username: "directmember", Password: "safe-password-strong"}, ip, false, 1); !errors.Is(err, platform.ErrCredentials) {
			t.Fatal("IP login bypass", ip, err)
		}
		if _, err = accounts.RegisterCode(ctx, input, ip); !errors.Is(err, platform.ErrInput) {
			t.Fatal("IP register bypass", ip, err)
		}
	}
	// Persisting the registration switch snapshots the independent verification policy across restarts.
	if err = m.Close(); err != nil {
		t.Fatal(err)
	}
	m, err = install.Open(ctx, install.Options{DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	policy, err = m.AccountService(false).Policy(ctx)
	if err != nil || !policy.RegistrationEnabled || policy.EmailVerificationRequired {
		t.Fatal("registration policy changed after restart", policy, err)
	}
}
