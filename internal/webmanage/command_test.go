// Author: yunnuo <ymz@ebox.vip>
// Description: Real installed-instance recovery, refusal boundaries and literal configuration discovery.
package webmanage

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
)

func fixture(t *testing.T) (string, contracts.User, string) {
	t.Helper()
	directory := t.TempDir()
	m, e := install.Open(context.Background(), install.Options{DataDir: directory})
	if e != nil {
		t.Fatal(e)
	}
	raw, e := os.ReadFile(m.TokenPath())
	if e != nil {
		t.Fatal(e)
	}
	_, admin, e := m.Complete(context.Background(), strings.TrimSpace(string(raw)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Operations", BaseUrl: "http://localhost:3000", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if e != nil {
		t.Fatal(e)
	}
	_, token, e := m.Identity(true).Issue(context.Background(), admin, 1)
	if e != nil {
		t.Fatal(e)
	}
	if e = m.Close(); e != nil {
		t.Fatal(e)
	}
	return directory, admin, token
}
func testConsole(input string) (Console, *bytes.Buffer) {
	out := &bytes.Buffer{}
	return Console{In: strings.NewReader(input), Out: out, Err: out, Getenv: func(string) string { return "" }}, out
}
func TestOfflineOperations(t *testing.T) {
	directory, _, oldToken := fixture(t)
	ctx := context.Background()
	run := func(input string, args ...string) string {
		t.Helper()
		c, out := testConsole(input)
		args = append(args, "--data-dir", directory)
		if e := Run(ctx, args, c); e != nil {
			t.Fatal(args, e, out.String())
		}
		return out.String()
	}
	if !strings.Contains(run("", "status"), `"running": false`) {
		t.Fatal("wrong stopped state")
	}
	run("", "doctor")
	run("", "admin", "list")
	run("next-password-strong\n", "admin", "reset-password", "--password-stdin")
	m, e := install.Open(ctx, install.Options{DataDir: directory})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = m.Identity(true).Session(ctx, oldToken); e == nil {
		t.Fatal("old session survived reset")
	}
	if _, _, e = m.Identity(true).Login(ctx, contracts.LoginInput{Username: "admin", Password: "test-password-strong"}, "old", false, false, 1); e != platform.ErrCredentials {
		t.Fatal("old password accepted", e)
	}
	if _, _, e = m.Identity(true).Login(ctx, contracts.LoginInput{Username: "admin", Password: "next-password-strong"}, "new", false, false, 1); e != nil {
		t.Fatal("new password rejected", e)
	}
	c, out := testConsole("")
	if e = Run(ctx, []string{"admin", "set-path", "--data-dir", directory, "--path", "/control"}, c); e == nil {
		t.Fatal("live mutation allowed", out.String())
	}
	if e = m.Close(); e != nil {
		t.Fatal(e)
	}
	run("", "admin", "set-path", "--path", "/control")
	run("", "maintenance", "on", "--message", "scheduled work")
	run("", "sessions", "revoke", "--all", "--realm", "administrator")
	run("", "site", "set-url", "--url", "https://new.example.test", "--yes")
	m, e = install.Open(ctx, install.Options{DataDir: directory})
	if e != nil {
		t.Fatal(e)
	}
	defer m.Close()
	if m.BaseURL() != "https://new.example.test" || m.AdminPath(ctx) != "/control" {
		t.Fatal("saved recovery values not used")
	}
	_, settings, _, _ := m.Services()
	value, e := settings.Value(ctx, "maintenance.enabled")
	if e != nil || value != "true" {
		t.Fatal(value, e)
	}
}
func TestRefuseMissingInstanceAndMalformedInput(t *testing.T) {
	for _, args := range [][]string{{"status"}, {"doctor"}, {"admin", "reset-password", "--password-stdin"}, {"database", "configure", "--dsn-stdin", "--yes"}} {
		directory := filepath.Join(t.TempDir(), "absent")
		c, _ := testConsole("not-a-real-password\n")
		if e := Run(context.Background(), append(args, "--data-dir", directory), c); e == nil {
			t.Fatal("accepted missing instance")
		}
		if _, e := os.Stat(directory); !os.IsNotExist(e) {
			t.Fatal("created a new instance", e)
		}
	}
	directory, _, _ := fixture(t)
	for _, args := range [][]string{{"admin", "set-path", "--path", "/api"}, {"sessions", "revoke", "--realm", "other", "--all"}, {"site", "set-url", "--url", "https://example.test/path", "--yes"}, {"admin", "reset-password", "--password-stdin"}, {"database", "configure", "--dsn-stdin", "--yes"}} {
		c, _ := testConsole("short\n")
		if e := Run(context.Background(), append(args, "--data-dir", directory), c); e == nil {
			t.Fatal("invalid operation accepted", args)
		}
	}
	if e := os.Remove(filepath.Join(directory, "secret.key")); e != nil {
		t.Fatal(e)
	}
	c, _ := testConsole("")
	if e := Run(context.Background(), []string{"doctor", "--data-dir", directory}, c); e == nil {
		t.Fatal("accepted missing key")
	}
	if _, e := os.Stat(filepath.Join(directory, "secret.key")); !os.IsNotExist(e) {
		t.Fatal("regenerated original key")
	}
}
func TestServiceBindingAndEnvironment(t *testing.T) {
	root := t.TempDir()
	work := filepath.Join(root, "installation")
	if e := os.Mkdir(work, 0700); e != nil {
		t.Fatal(e)
	}
	c, _ := testConsole("")
	c.Getenv = func(key string) string {
		if key == "XDG_CONFIG_HOME" {
			return root
		}
		return ""
	}
	o := options{name: "test-unit", user: true}
	_, binding, cfg := servicePaths(o, c)
	if e := os.MkdirAll(filepath.Dir(binding), 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(cfg, []byte("data_dir: data\nlisten: 127.0.0.1:3123\n"), 0600); e != nil {
		t.Fatal(e)
	}
	env := filepath.Join(root, "instance.env")
	if e := os.WriteFile(env, []byte("APP_SECRET_KEY='test-only-key'\nAPP_ADMIN_PATH=/recovery\n"), 0600); e != nil {
		t.Fatal(e)
	}
	record := serviceRecord{Name: o.name, Config: cfg, Directory: work, EnvironmentFile: env}
	raw, _ := json.Marshal(record)
	if e := os.WriteFile(binding, raw, 0600); e != nil {
		t.Fatal(e)
	}
	bound, e := boundEnvironment(o, c)
	if e != nil {
		t.Fatal(e)
	}
	web, _, e := resolve(o, bound)
	if e != nil || web.DataDir != filepath.Join(work, "data") || web.Listen != "127.0.0.1:3123" || bound.Getenv("APP_SECRET_KEY") != "test-only-key" {
		t.Fatal(web, e)
	}
	explicit, _, e := resolve(options{data: root}, c)
	if e != nil || explicit.DataDir != root {
		t.Fatal("explicit directory lost", e)
	}
	if _, e = parseEnvironment("export APP_SECRET_KEY=bad"); e == nil {
		t.Fatal("shell syntax accepted")
	}
	values, e := parseEnvironment("# comment\nAPP_OTHER=$(touch /tmp/must-not-run)\n")
	if e != nil || values["APP_OTHER"] != "$(touch /tmp/must-not-run)" {
		t.Fatal("literal parser changed values", e)
	}
}
func TestRenderedUnitAndMenu(t *testing.T) {
	r := serviceRecord{Executable: "/opt/my app/$test%/unicore", Config: "/tmp/my config.yaml", Directory: "/opt/my app", RunAs: "appuser", EnvironmentFile: "/opt/my app/service environment.env"}
	unit, e := renderUnit(r, false)
	if e != nil || !strings.Contains(unit, "Restart=always") || !strings.Contains(unit, "User=appuser") || !strings.Contains(unit, "$$test%%") || !strings.Contains(unit, `serve --config "/tmp/my config.yaml"`) {
		t.Fatal(unit, e)
	}
	if !strings.Contains(unit, "WorkingDirectory=/opt/my app\n") || !strings.Contains(unit, "EnvironmentFile=/opt/my app/service environment.env\n") {
		t.Fatal("systemd path directives must not contain argv quotes", unit)
	}
	r.Directory = "/tmp/\nExecStart=bad"
	if _, e = renderUnit(r, false); e == nil {
		t.Fatal("unit injection accepted")
	}
	c, out := testConsole("0\n")
	if e = Run(context.Background(), []string{"manage"}, c); e != nil || !strings.Contains(out.String(), "管理菜单") {
		t.Fatal(e, out.String())
	}
}

func TestRecoveryPreservesFactorAndOtherRealm(t *testing.T) {
	directory, admin, token := fixture(t)
	ctx := context.Background()
	m, e := install.Open(ctx, install.Options{DataDir: directory})
	if e != nil {
		t.Fatal(e)
	}
	member, e := m.Identity(false).Create(ctx, contracts.UserCreate{Username: "admin", Email: admin.Email, Password: "member-password-strong", Role: "user"}, admin.ID)
	if e != nil {
		t.Fatal(e)
	}
	_, memberToken, e := m.Identity(false).Issue(ctx, member, 1)
	if e != nil {
		t.Fatal(e)
	}
	identity := m.Identity(true)
	account, e := identity.Store.FindAccount(ctx, "admin")
	if e != nil {
		t.Fatal(e)
	}
	personal := identity.Personal.Store
	if e = personal.SaveTOTPSetup(ctx, platform.Hash(token), account.PasswordHash, "encrypted-existing-factor", int(time.Now().Unix())+600); e != nil {
		t.Fatal(e)
	}
	if e = personal.EnableTOTP(ctx, platform.Hash(token), "encrypted-existing-factor", 1000, "[]"); e != nil {
		t.Fatal(e)
	}
	if e = m.Close(); e != nil {
		t.Fatal(e)
	}
	c, _ := testConsole("recovered-password-strong\n")
	if e = Run(ctx, []string{"admin", "reset-password", "--data-dir", directory, "--username", "admin", "--password-stdin"}, c); e != nil {
		t.Fatal(e)
	}
	m, e = install.Open(ctx, install.Options{DataDir: directory})
	if e != nil {
		t.Fatal(e)
	}
	defer m.Close()
	if _, e = m.Identity(false).Session(ctx, memberToken); e != nil {
		t.Fatal("administrator recovery revoked a user session", e)
	}
	state, e := m.Identity(true).Store.FindAccount(ctx, "admin")
	if e != nil || !state.User.TotpEnabled {
		t.Fatal("existing factor was cleared", e)
	}
	login, _, e := m.Identity(true).Login(ctx, contracts.LoginInput{Username: "admin", Password: "recovered-password-strong"}, "recovery", false, false, 1)
	if e != nil || login.MfaPending == nil || !*login.MfaPending {
		t.Fatal("password recovery bypassed MFA", e)
	}
}
