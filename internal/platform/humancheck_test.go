// Author: yunnuo <ymz@ebox.vip>
// Description: Human verification readiness, the Turnstile HTTP round trip and login/register enforcement.
package platform_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/humancheck"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestHumanCheckConfigReadiness(t *testing.T) {
	if (platform.HumanCheckConfig{Provider: "turnstile", TurnstileSecretKey: "s"}).Ready() != true {
		t.Fatal("turnstile ready without secret")
	}
	if (platform.HumanCheckConfig{Provider: "turnstile"}).Ready() {
		t.Fatal("turnstile ready without secret")
	}
	if (platform.HumanCheckConfig{Provider: "tencent", TencentAppID: "1", TencentAppSecretKey: "k", TencentSecretID: "i", TencentSecretKey: "s"}).Ready() != true {
		t.Fatal("tencent missing credential still ready")
	}
	if (platform.HumanCheckConfig{Provider: "alibaba", AliyunAccessKeyID: "i", AliyunAccessKeySecret: "s"}).Ready() {
		t.Fatal("alibaba ready without scene")
	}
}

func TestTurnstileVerifierRoundTrip(t *testing.T) {
	var received urlForm
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		received = urlForm{secret: r.PostFormValue("secret"), response: r.PostFormValue("response"), remoteip: r.PostFormValue("remoteip")}
		w.Header().Set("Content-Type", "application/json")
		if received.response == "good" {
			_, _ = w.Write([]byte(`{"success":true}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":false}`))
	}))
	defer server.Close()
	verifier := humancheck.Verifier{HTTPClient: server.Client(), SiteVerifyURL: server.URL}
	config := platform.HumanCheckConfig{Provider: "turnstile", TurnstileSecretKey: "site-secret"}
	if err := verifier.Verify(context.Background(), config, "good", "", "203.0.113.9"); err != nil {
		t.Fatal("valid token rejected", err)
	}
	if received.secret != "site-secret" || received.remoteip != "203.0.113.9" {
		t.Fatal("siteverify payload incomplete", received)
	}
	if err := verifier.Verify(context.Background(), config, "bad", "", ""); !errors.Is(err, platform.ErrHumanCheck) {
		t.Fatal("invalid token accepted", err)
	}
}

type urlForm struct{ secret, response, remoteip string }

func TestHumanCheckEnforcement(t *testing.T) {
	ctx := context.Background()
	m, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	tokenBytes, err := os.ReadFile(m.TokenPath())
	if err != nil {
		t.Fatal(err)
	}
	_, admin, err := m.Complete(ctx, strings.TrimSpace(string(tokenBytes)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Unicore", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	_, config, _, _ := m.Services()
	patch := func(k, v string) {
		t.Helper()
		if _, err := config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: k, Value: v}}}, admin.ID); err != nil {
			t.Fatal(k, err)
		}
	}
	patch("security.human_check_provider", "turnstile")

	accounts := m.AccountService(false)
	identity := m.Identity(false)
	// Seed a member before the switches turn on so login exercises the user realm.
	patch("account.registration_enabled", "true")
	patch("security.register_captcha", "false")
	if _, err = accounts.RegisterCode(ctx, contracts.RegisterInput{Username: "humanmember", Email: "human@example.test", Password: "human-password-strong"}, "203.0.113.31"); err != nil {
		t.Fatal(err)
	}
	patch("security.human_check_enabled", "true")
	// Enabled but unconfigured fails closed before any provider call.
	if _, _, err = identity.Login(ctx, contracts.LoginInput{Username: "humanmember", Password: "human-password-strong"}, "203.0.113.30", false, true, 1); !errors.Is(err, platform.ErrHumanCheckConfig) {
		t.Fatal("unconfigured login did not fail closed", err)
	}
	patch("security.turnstile_secret_key", "secret")

	stub := &stubChecker{result: platform.ErrHumanCheck}
	identity.HumanCheck = stub
	if _, _, err = identity.Login(ctx, contracts.LoginInput{Username: "humanmember", Password: "human-password-strong"}, "203.0.113.30", false, true, 1); !errors.Is(err, platform.ErrHumanCheck) {
		t.Fatal("missing token accepted", err)
	}
	stub.result = nil
	good := "human-token"
	if _, _, err = identity.Login(ctx, contracts.LoginInput{Username: "humanmember", Password: "human-password-strong", HumanCheckToken: &good}, "203.0.113.30", false, true, 1); err != nil {
		t.Fatal("verified token rejected", err)
	}
	if stub.lastToken != good {
		t.Fatal("token not forwarded to the verifier", stub.lastToken)
	}

	patch("security.turnstile_site_key", "site-key")
	if _, err = accounts.RegisterCode(ctx, contracts.RegisterInput{Username: "humanmember2", Email: "human2@example.test", Password: "human-password-strong"}, "203.0.113.31"); !errors.Is(err, platform.ErrHumanCheck) {
		t.Fatal("register without human token accepted", err)
	}
	checker := &stubChecker{}
	identity.HumanCheck = checker
	if _, err = accounts.RegisterCode(ctx, contracts.RegisterInput{Username: "humanmember2", Email: "human2@example.test", Password: "human-password-strong", HumanCheckToken: &good}, "203.0.113.31"); err != nil {
		t.Fatal("register with verifier failed", err)
	}
	policy, err := accounts.Policy(ctx)
	if err != nil || !policy.HumanCheckEnabled || policy.HumanCheckProvider != "turnstile" || policy.HumanCheckSiteKey == nil || *policy.HumanCheckSiteKey != "site-key" {
		t.Fatal("policy does not expose human verification", policy, err)
	}
}

type stubChecker struct {
	result    error
	lastToken string
}

func (s *stubChecker) Verify(_ context.Context, _ platform.HumanCheckConfig, token, _, _ string) error {
	s.lastToken = token
	return s.result
}
