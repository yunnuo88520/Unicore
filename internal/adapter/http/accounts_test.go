// Author: yunnuo <ymz@ebox.vip>
// Description: Actual HTTP mail policy, authorization, registration and password reset behavior.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net"
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
	"github.com/yunnuo/unicore/internal/testutil"
)

func TestMailAccountHTTP(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	manager, err := install.Open(ctx, install.Options{DataDir: directory})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = manager.Close() }()
	token, _ := os.ReadFile(manager.TokenPath())
	_, admin, err := manager.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Mail test", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	_, _, identity, _ := manager.Services()
	session, raw, err := identity.Issue(ctx, admin, 1)
	if err != nil {
		t.Fatal(err)
	}
	router := New(Config{Core: bootstrap.Core(), Install: manager, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, input any, cookie, csrf, origin string) *httptest.ResponseRecorder {
		data, _ := json.Marshal(input)
		req := httptest.NewRequest(method, "http://localhost/api/v1"+path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		if cookie != "" {
			req.AddCookie(&http.Cookie{Name: sessionCookie, Value: cookie})
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	assertStatus := func(response *httptest.ResponseRecorder, status int) {
		t.Helper()
		if response.Code != status {
			t.Fatalf("HTTP %d: %s", response.Code, response.Body.String())
		}
	}
	policy := request("GET", "/auth/policy", nil, "", "", "")
	assertStatus(policy, 200)
	if !strings.Contains(policy.Body.String(), `"registration_enabled":false`) || policy.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("unsafe initial policy", policy.Body.String())
	}
	assertStatus(request("POST", "/auth/register", contracts.RegisterInput{}, "", "", ""), 409)
	assertStatus(request("POST", "/admin/settings/mail/test", contracts.MailTestInput{Recipient: "recipient@example.test"}, "", "", ""), 401)
	assertStatus(request("POST", "/admin/settings/mail/test", contracts.MailTestInput{Recipient: "recipient@example.test"}, raw, "", ""), 403)
	assertStatus(request("POST", "/auth/password/request", contracts.EmailRequest{Email: "admin@example.test"}, "", "", "https://evil.example.test"), 403)
	member, err := identity.Create(ctx, contracts.UserCreate{Username: "ordinary", Email: "ordinary@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	memberSession, memberRaw, err := identity.Issue(ctx, member, 1)
	if err != nil {
		t.Fatal(err)
	}
	assertStatus(request("GET", "/admin/settings/mail/jobs", nil, memberRaw, "", ""), 403)
	assertStatus(request("POST", "/admin/settings/mail/test", contracts.MailTestInput{Recipient: "recipient@example.test"}, memberRaw, memberSession.CsrfToken, ""), 403)
	patch := func(changes ...contracts.SettingChange) *httptest.ResponseRecorder {
		return request("PATCH", "/admin/settings", contracts.SettingPatch{Changes: changes}, raw, session.CsrfToken, "")
	}
	assertStatus(patch(contracts.SettingChange{Key: "account.password_reset_enabled", Value: "true"}), 409)
	smtp, err := testutil.StartSMTP()
	if err != nil {
		t.Fatal(err)
	}
	defer smtp.Close()
	host, port, _ := net.SplitHostPort(smtp.Listener.Addr().String())
	response := patch(contracts.SettingChange{Key: "mail.host", Value: host}, contracts.SettingChange{Key: "mail.port", Value: port}, contracts.SettingChange{Key: "mail.tls", Value: "plain"}, contracts.SettingChange{Key: "mail.from", Value: "sender@example.test"}, contracts.SettingChange{Key: "mail.password", Value: "http-smtp-test-secret"})
	assertStatus(response, 200)
	if strings.Contains(response.Body.String(), "http-smtp-test-secret") || !strings.Contains(response.Body.String(), `"configured":true`) {
		t.Fatal("secret response leaked or lost mask")
	}
	assertStatus(request("POST", "/admin/settings/mail/test", contracts.MailTestInput{Recipient: "recipient@example.test"}, raw, session.CsrfToken, ""), 200)
	assertStatus(patch(contracts.SettingChange{Key: "account.registration_enabled", Value: "true"}, contracts.SettingChange{Key: "account.password_reset_enabled", Value: "true"}), 200)
	challenge := func() (string, string) {
		response := request("GET", "/auth/captcha", nil, "", "", "")
		assertStatus(response, 200)
		var challenge contracts.CaptchaResponse
		_ = json.Unmarshal(response.Body.Bytes(), &challenge)
		svg, _ := base64.StdEncoding.DecodeString(strings.Split(challenge.Data.Image, ",")[1])
		answer := ""
		for _, m := range regexp.MustCompile(`>([0-9])</text>`).FindAllStringSubmatch(string(svg), -1) {
			answer += m[1]
		}
		return challenge.Data.ID, answer
	}
	id, answer := challenge()
	registration := contracts.RegisterInput{Username: "httpmember", Email: "httpmember@example.test", Password: "test-password-strong", CaptchaID: id, CaptchaAnswer: answer}
	assertStatus(request("POST", "/auth/register", registration, "", "", ""), 200)
	id, answer = challenge()
	duplicate := registration
	duplicate.CaptchaID, duplicate.CaptchaAnswer = id, answer
	assertStatus(request("POST", "/auth/register", duplicate, "", "", ""), 200)
	// Close and reopen the actual database/key/config before delivering queued registration mail.
	if err = manager.Close(); err != nil {
		t.Fatal(err)
	}
	manager, err = install.Open(ctx, install.Options{DataDir: directory})
	if err != nil {
		t.Fatal("mail queue restart failed", err)
	}
	router = New(Config{Core: bootstrap.Core(), Install: manager, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if err = manager.Mail().Tick(ctx, int(time.Now().Unix())); err != nil {
		t.Fatal(err)
	}
	lastToken := func() string {
		messages := smtp.Messages()
		match := regexp.MustCompile(`token=([A-Za-z0-9_-]{43})`).FindStringSubmatch(testutil.MailText(messages[len(messages)-1]))
		if len(match) != 2 {
			t.Fatal("email token missing")
		}
		return match[1]
	}
	verify := lastToken()
	assertStatus(request("POST", "/auth/verification/complete", contracts.TokenInput{Token: verify}, "", "", ""), 200)
	assertStatus(request("POST", "/auth/verification/complete", contracts.TokenInput{Token: verify}, "", "", ""), 400)
	id, answer = challenge()
	login := request("POST", "/auth/login", contracts.LoginInput{Username: registration.Username, Password: registration.Password, CaptchaID: id, CaptchaAnswer: answer}, "", "", "")
	assertStatus(login, 200)
	oldCookie := login.Result().Cookies()[0].Value
	id, answer = challenge()
	assertStatus(request("POST", "/auth/password/request", contracts.EmailRequest{Email: registration.Email, CaptchaID: id, CaptchaAnswer: answer}, "", "", ""), 200)
	if err = manager.Mail().Tick(ctx, int(time.Now().Unix())); err != nil {
		t.Fatal(err)
	}
	reset := lastToken()
	response = request("POST", "/auth/password/reset", contracts.ResetInput{Token: reset, Password: "reset-password-strong"}, "", "", "")
	assertStatus(response, 200)
	assertStatus(request("GET", "/auth/session", nil, oldCookie, "", ""), 401)
	assertStatus(request("POST", "/auth/password/reset", contracts.ResetInput{Token: reset, Password: "reset-password-strong"}, "", "", ""), 400)
	jobs := request("GET", "/admin/settings/mail/jobs", nil, raw, "", "")
	assertStatus(jobs, 200)
	if strings.Contains(jobs.Body.String(), reset) || strings.Contains(jobs.Body.String(), registration.Email) {
		t.Fatal("mail job API exposed payload")
	}
	// New six-digit flows and protected HTML previews use the same production router.
	assertStatus(request("GET", "/admin/settings/mail/templates", nil, memberRaw, "", ""), 403)
	previews := request("GET", "/admin/settings/mail/templates", nil, raw, "", "")
	assertStatus(previews, 200)
	if !strings.Contains(previews.Body.String(), "654321") || strings.Contains(previews.Body.String(), "http-smtp-test-secret") {
		t.Fatal("unsafe preview response")
	}
	assertStatus(patch(contracts.SettingChange{Key: "account.email_login_enabled", Value: "true"}), 200)
	id, answer = challenge()
	codeRequest := request("POST", "/auth/email/login/request", contracts.EmailRequest{Email: registration.Email, CaptchaID: id, CaptchaAnswer: answer}, "", "", "")
	assertStatus(codeRequest, 200)
	var codeChallenge contracts.EmailChallengeResponse
	if err = json.Unmarshal(codeRequest.Body.Bytes(), &codeChallenge); err != nil {
		t.Fatal(err)
	}
	if err = manager.Mail().Tick(ctx, int(time.Now().Unix())); err != nil {
		t.Fatal(err)
	}
	messages := smtp.Messages()
	matches := regexp.MustCompile(`验证码：([0-9]{6})`).FindStringSubmatch(testutil.MailText(messages[len(messages)-1]))
	if len(matches) != 2 {
		t.Fatal("six-digit email code missing")
	}
	codeInput := contracts.EmailCodeInput{ChallengeID: codeChallenge.Data.ChallengeID, Code: matches[1], Password: ""}
	assertStatus(request("POST", "/auth/email/reset/complete", codeInput, "", "", ""), 400)
	completed := request("POST", "/auth/email/login/complete", codeInput, "", "", "")
	assertStatus(completed, 200)
	assertStatus(request("POST", "/auth/email/login/complete", codeInput, "", "", ""), 400)
	if len(completed.Result().Cookies()) != 1 {
		t.Fatal("email login did not create cookie")
	}

}
