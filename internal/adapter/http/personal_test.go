// Author: yunnuo <ymz@ebox.vip>
// Description: Real HTTP personal-center permission, replay, mailbox and device-session regressions.
package httpadapter

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
)

type personalMailSender struct{}

func (personalMailSender) Send(context.Context, mailer.Config, mailer.Message) error { return nil }
func personalCode(secret string, step int64) string {
	key, _ := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	var b [8]byte
	binary.BigEndian.PutUint64(b[:], uint64(step))
	h := hmac.New(sha1.New, key)
	_, _ = h.Write(b[:])
	d := h.Sum(nil)
	o := d[len(d)-1] & 15
	return fmt.Sprintf("%06d", (binary.BigEndian.Uint32(d[o:o+4])&0x7fffffff)%1000000)
}
func TestPersonalCenterHTTP(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	manager, err := install.Open(ctx, install.Options{DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = manager.Close() }()
	token, _ := os.ReadFile(manager.TokenPath())
	_, admin, err := manager.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Personal", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	db, config, identity, _ := manager.Services()
	if _, err = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.login_failure_limit", Value: "20"}}}, admin.ID); err != nil {
		t.Fatal(err)
	}
	member, err := identity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	other, err := identity.Create(ctx, contracts.UserCreate{Username: "another", Email: "another@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, otherToken, _ := identity.Issue(ctx, other, 1)
	router := New(Config{Core: bootstrap.Core(), Install: manager, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, input any, raw string, adminCookie bool, csrf string) *httptest.ResponseRecorder {
		data, _ := json.Marshal(input)
		req := httptest.NewRequest(method, "http://localhost/api/v1"+path, bytes.NewReader(data))
		req.RemoteAddr = "192.0.2.7:12345"
		req.Header.Set("User-Agent", "Personal test browser")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		if raw != "" {
			name := sessionCookie
			if adminCookie {
				name = administratorSessionCookie
			}
			req.AddCookie(&http.Cookie{Name: name, Value: raw})
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	check := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("want %d: got %d %s", status, w.Code, w.Body.String())
		}
	}
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	_, err = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.login_captcha", Value: "false"}, {Key: "mail.host", Value: "localhost"}, {Key: "mail.port", Value: "2525"}, {Key: "mail.tls", Value: "plain"}, {Key: "mail.from", Value: "sender@example.test"}}}, admin.ID)
	must(err)
	manager.Mail().Sender = personalMailSender{}
	must(manager.Mail().Test(ctx, "recipient@example.test", admin.ID))
	_, err = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "account.email_login_enabled", Value: "true"}, {Key: "account.password_reset_enabled", Value: "true"}}}, admin.ID)
	must(err)
	for _, adminRealm := range []bool{false, true} {
		name, prefix, user := "member", "", member
		if adminRealm {
			name, prefix, user = "admin", "/admin", admin
		}
		t.Run(name, func(t *testing.T) {
			check := func(w *httptest.ResponseRecorder, status int) {
				t.Helper()
				if w.Code != status {
					t.Fatalf("want %d: got %d %s", status, w.Code, w.Body.String())
				}
			}
			must := func(err error) {
				t.Helper()
				if err != nil {
					t.Fatal(err)
				}
			}
			resetLimits := func() { manager.Identity(adminRealm).Limiter = platform.NewLimiter() }

			login := func() string {
				w := request("POST", prefix+"/auth/login", contracts.LoginInput{Username: name, Password: "test-password-strong"}, "", adminRealm, "")
				check(w, 200)
				for _, c := range w.Result().Cookies() {
					if c.Name == map[bool]string{false: sessionCookie, true: administratorSessionCookie}[adminRealm] {
						return c.Value
					}
				}
				t.Fatal("cookie missing")
				return ""
			}
			raw := login()
			csrf := platform.CSRF(raw)
			check(request("GET", prefix+"/account/profile", nil, "", adminRealm, ""), 401)
			check(request("PATCH", prefix+"/account/profile", contracts.ProfileInput{DisplayName: "New nickname"}, raw, adminRealm, ""), 403)
			check(request("PATCH", prefix+"/account/profile", map[string]string{"display_name": "Name", "username": "elevated"}, raw, adminRealm, csrf), 400)
			check(request("PATCH", prefix+"/account/profile", contracts.ProfileInput{DisplayName: "New nickname"}, raw, adminRealm, csrf), 200)
			check(request("GET", prefix+"/account/profile", nil, raw, !adminRealm, ""), 401)
			profile := request("GET", prefix+"/account/profile", nil, raw, adminRealm, "")
			check(profile, 200)
			if !strings.Contains(profile.Body.String(), `"display_name":"New nickname"`) {
				t.Fatal("profile not persisted")
			}
			check(request("POST", prefix+"/account/sessions/revoke", contracts.RevokeDeviceInput{ID: platform.Hash(otherToken)}, raw, adminRealm, csrf), 400)
			second := login()
			check(request("POST", prefix+"/account/sessions/revoke-others", nil, raw, adminRealm, csrf), 200)
			check(request("GET", prefix+"/account/profile", nil, second, adminRealm, ""), 401)
			devices := request("GET", prefix+"/account/sessions", nil, raw, adminRealm, "")
			check(devices, 200)
			if !strings.Contains(devices.Body.String(), "Personal test browser") || !strings.Contains(devices.Body.String(), "192.0.2.7") || strings.Contains(devices.Body.String(), raw) {
				t.Fatal("bad device metadata or bearer leaked")
			}
			// Two mailbox proofs are bound to this precise session and original mailbox.
			var current contracts.EmailChallengeResponse
			w := request("POST", prefix+"/account/email/current", nil, raw, adminRealm, csrf)
			check(w, 200)
			must(json.Unmarshal(w.Body.Bytes(), &current))
			table := "unicore_email_changes"
			if adminRealm {
				table = "unicore_administrator_email_changes"
			}
			readCode := func(id string) string {
				var payload string
				must(db.Row(ctx, db.DB, "SELECT payload FROM unicore_mail_jobs WHERE token_hash=?", id).Scan(&payload))
				plain, e := manager.Mail().Secrets.Open(payload)
				must(e)
				if strings.Contains(payload, "验证码") {
					t.Fatal("unencrypted queue")
				}
				match := regexp.MustCompile(`[0-9]{6}`).FindString(plain)
				if match == "" {
					t.Fatal("mail code missing")
				}
				return match
			}
			oldCode := readCode(current.Data.ChallengeID)
			wrongCode := "000000"
			if wrongCode == oldCode {
				wrongCode = "111111"
			}
			check(request("POST", prefix+"/account/email/new", contracts.EmailChangeInput{CurrentChallengeID: current.Data.ChallengeID, Email: "new-" + name + "@example.test"}, raw, adminRealm, csrf), 400)
			check(request("POST", prefix+"/account/email/verify-current", contracts.EmailChangeVerifyInput{ChallengeID: current.Data.ChallengeID, Code: wrongCode}, raw, adminRealm, csrf), 400)
			check(request("POST", prefix+"/account/email/verify-current", contracts.EmailChangeVerifyInput{ChallengeID: current.Data.ChallengeID, Code: oldCode}, raw, adminRealm, csrf), 200)
			check(request("POST", prefix+"/account/email/verify-current", contracts.EmailChangeVerifyInput{ChallengeID: current.Data.ChallengeID, Code: oldCode}, raw, adminRealm, csrf), 400)
			second = login()
			resetLimits()
			check(request("POST", prefix+"/account/email/new", contracts.EmailChangeInput{CurrentChallengeID: current.Data.ChallengeID, Email: "new-" + name + "@example.test"}, second, adminRealm, platform.CSRF(second)), 400)
			resetLimits()
			var next contracts.EmailChallengeResponse
			w = request("POST", prefix+"/account/email/new", contracts.EmailChangeInput{CurrentChallengeID: current.Data.ChallengeID, Email: "new-" + name + "@example.test"}, raw, adminRealm, csrf)
			check(w, 200)
			must(json.Unmarshal(w.Body.Bytes(), &next))
			newCode := readCode(next.Data.ChallengeID)
			check(request("POST", prefix+"/account/email/confirm", contracts.EmailChangeVerifyInput{ChallengeID: next.Data.ChallengeID, Code: newCode}, raw, adminRealm, csrf), 200)
			check(request("GET", prefix+"/account/profile", nil, second, adminRealm, ""), 401)
			check(request("POST", prefix+"/account/email/confirm", contracts.EmailChangeVerifyInput{ChallengeID: next.Data.ChallengeID, Code: newCode}, raw, adminRealm, csrf), 400)
			var pendingCount int
			must(db.Row(ctx, db.DB, "SELECT COUNT(*) FROM "+table+" WHERE user_id=?", user.ID).Scan(&pendingCount))
			if pendingCount != 0 {
				t.Fatal("email proofs survived completion")
			}
			// Set up an encrypted authenticator, bound to the initiating session.
			check(request("POST", prefix+"/account/totp/setup", contracts.TOTPSetupInput{Password: "wrong"}, raw, adminRealm, csrf), 401)
			var setup contracts.TOTPSetupResponse
			w = request("POST", prefix+"/account/totp/setup", contracts.TOTPSetupInput{Password: "test-password-strong"}, raw, adminRealm, csrf)
			check(w, 200)
			must(json.Unmarshal(w.Body.Bytes(), &setup))
			second = login()
			step := time.Now().Unix() / 30
			enableCode := personalCode(setup.Data.Secret, step-1)
			check(request("POST", prefix+"/account/totp/enable", contracts.SecurityCodeInput{Code: enableCode}, second, adminRealm, platform.CSRF(second)), 400)
			var recovery contracts.RecoveryCodesResponse
			w = request("POST", prefix+"/account/totp/enable", contracts.SecurityCodeInput{Code: enableCode}, raw, adminRealm, csrf)
			check(w, 200)
			must(json.Unmarshal(w.Body.Bytes(), &recovery))
			if len(recovery.Data.Codes) != 10 {
				t.Fatal("missing recovery codes")
			}
			secretTable := "unicore_personal_accounts"
			if adminRealm {
				secretTable = "unicore_administrator_personal_accounts"
			}
			var sealed, digests string
			must(db.Row(ctx, db.DB, "SELECT totp_secret,recovery_digests FROM "+secretTable+" WHERE user_id=?", user.ID).Scan(&sealed, &digests))
			if strings.Contains(sealed, setup.Data.Secret) || strings.Contains(digests, recovery.Data.Codes[0]) {
				t.Fatal("plaintext factor material stored")
			}
			check(request("GET", prefix+"/account/profile", nil, second, adminRealm, ""), 401)

			// Security state and inventory survive a full database/key/process composition restart.
			must(manager.Close())
			manager, err = install.Open(ctx, install.Options{DataDir: dir})
			must(err)
			db, config, identity, _ = manager.Services()
			router = New(Config{Core: bootstrap.Core(), Install: manager, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
			check(request("GET", prefix+"/account/profile", nil, raw, adminRealm, ""), 200)
			pending := login()
			w = request("GET", prefix+"/bootstrap", nil, pending, adminRealm, "")
			check(w, 200)
			if !strings.Contains(w.Body.String(), `"mfa_pending":true`) || strings.Contains(w.Body.String(), `"current_user"`) {
				t.Fatal("restricted login exposed workspace", w.Body.String())
			}
			check(request("GET", prefix+"/account/profile", nil, pending, adminRealm, ""), 401)
			check(request("POST", prefix+"/auth/mfa", contracts.SecurityCodeInput{Code: recovery.Data.Codes[0]}, pending, adminRealm, ""), 403)
			check(request("POST", prefix+"/auth/mfa", contracts.SecurityCodeInput{Code: enableCode}, pending, adminRealm, platform.CSRF(pending)), 400)
			freshCode := personalCode(setup.Data.Secret, step)
			check(request("POST", prefix+"/auth/mfa", contracts.SecurityCodeInput{Code: freshCode}, pending, adminRealm, platform.CSRF(pending)), 200)
			check(request("GET", prefix+"/account/profile", nil, pending, adminRealm, ""), 200)
			pending2 := login()
			check(request("POST", prefix+"/auth/mfa", contracts.SecurityCodeInput{Code: freshCode}, pending2, adminRealm, platform.CSRF(pending2)), 400)
			check(request("POST", prefix+"/auth/mfa", contracts.SecurityCodeInput{Code: recovery.Data.Codes[0]}, pending2, adminRealm, platform.CSRF(pending2)), 200)
			replay := login()
			check(request("POST", prefix+"/auth/mfa", contracts.SecurityCodeInput{Code: recovery.Data.Codes[0]}, replay, adminRealm, platform.CSRF(replay)), 400)
			for i := 0; i < 7; i++ {
				check(request("POST", prefix+"/auth/mfa", contracts.SecurityCodeInput{Code: "invalid"}, replay, adminRealm, platform.CSRF(replay)), 400)
			}
			check(request("POST", prefix+"/auth/mfa", contracts.SecurityCodeInput{Code: recovery.Data.Codes[1]}, replay, adminRealm, platform.CSRF(replay)), 401)
			resetLimits()
			expired := login()
			details := "unicore_session_details"
			if adminRealm {
				details = "unicore_administrator_session_details"
			}
			_, e := db.Exec(ctx, db.DB, "UPDATE "+details+" SET created_at=? WHERE token_hash=?", time.Now().Unix()-301, platform.Hash(expired))
			must(e)
			check(request("POST", prefix+"/auth/mfa", contracts.SecurityCodeInput{Code: recovery.Data.Codes[1]}, expired, adminRealm, platform.CSRF(expired)), 401)
			// Email login also yields a restricted session; possession of a mailbox cannot bypass TOTP.
			accountService := manager.AccountService(adminRealm)
			c, e := accountService.RequestCode(ctx, contracts.EmailRequest{Email: "new-" + name + "@example.test"}, "mail-"+name, "login")
			must(e)
			mailCode := readCode(c.ChallengeID)
			_, emailToken, e := accountService.CompleteCode(platform.WithDevice(ctx, "192.0.2.8", "Email browser"), contracts.EmailCodeInput{ChallengeID: c.ChallengeID, Code: mailCode}, "mail-"+name, "login")
			must(e)
			if _, e = manager.Identity(adminRealm).Session(ctx, emailToken); e != platform.ErrMFA {
				t.Fatal("email login bypassed TOTP", e)
			}
			// Forced policy cannot be bypassed by posting directly to disable.
			_, e = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.force_2fa", Value: "true"}}}, admin.ID)
			must(e)
			check(request("POST", prefix+"/account/totp/disable", contracts.SecurityCodeInput{Code: personalCode(setup.Data.Secret, step+1)}, raw, adminRealm, csrf), 403)
			_, e = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.force_2fa", Value: "false"}}}, admin.ID)
			must(e)
			check(request("POST", prefix+"/account/totp/disable", contracts.SecurityCodeInput{Code: recovery.Data.Codes[1]}, raw, adminRealm, csrf), 400)
			check(request("POST", prefix+"/account/totp/disable", contracts.SecurityCodeInput{Code: personalCode(setup.Data.Secret, step+1)}, raw, adminRealm, csrf), 200)
			check(request("GET", prefix+"/account/profile", nil, pending2, adminRealm, ""), 401)
			check(request("POST", prefix+"/account/sessions/revoke", contracts.RevokeDeviceInput{ID: platform.Hash(raw)}, raw, adminRealm, csrf), 200)
			check(request("GET", prefix+"/account/profile", nil, raw, adminRealm, ""), 401)
		})
	}
	// Policy prevents workspace API use while still allowing enrollment and credential recovery.
	_, e := config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.force_2fa", Value: "true"}}}, admin.ID)
	must(e)
	check(request("GET", "/account/profile", nil, otherToken, false, ""), 200)
	check(request("GET", "/notes", nil, otherToken, false, ""), 403)
}
