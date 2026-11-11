// Author: yunnuo <ymz@ebox.vip>
package httpadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mailer"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

type notificationCapture struct {
	messages []mailer.Message
	fail     bool
}

func (c *notificationCapture) SendChannel(_ context.Context, _ map[string]string, m mailer.Message) error {
	if c.fail {
		return io.ErrUnexpectedEOF
	}
	c.messages = append(c.messages, m)
	return nil
}
func TestNotificationPermissionsEventsAndQueue(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	m, e := install.Open(ctx, install.Options{DataDir: dir})
	if e != nil {
		t.Fatal(e)
	}
	defer func() { m.Close() }()
	token, _ := os.ReadFile(m.TokenPath())
	_, admin, e := m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Notifications", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if e != nil {
		t.Fatal(e)
	}
	session, raw, e := m.Identity(true).Issue(ctx, admin, 1)
	if e != nil {
		t.Fatal(e)
	}
	store, settings, identity, _ := m.Services()
	member, e := identity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if e != nil {
		t.Fatal(e)
	}
	_, memberRaw, _ := identity.Issue(ctx, member, 1)
	router := New(Config{Core: bootstrap.Core(), Install: m, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, in any, who, csrf string) *httptest.ResponseRecorder {
		data, _ := json.Marshal(in)
		r := httptest.NewRequest(method, "http://localhost/api/v1/admin/settings/notifications"+path, bytes.NewReader(data))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", csrf)
		if who != "" {
			name := administratorSessionCookie
			if who == memberRaw {
				name = sessionCookie
			}
			r.AddCookie(&http.Cookie{Name: name, Value: who})
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	for _, who := range []string{"", memberRaw} {
		if w := request("GET", "", nil, who, ""); w.Code == 200 {
			t.Fatalf("unauthorized settings read: %d", w.Code)
		}
	}
	c, e := settings.Notifications(ctx)
	if e != nil {
		t.Fatal(e)
	}
	c.Enabled = true
	c.ChannelEnabled = true
	c.Provider = "webhook"
	c.WebhookUrl = "https://notify.example.test/hook?token=synthetic"
	c.SigningSecret = "synthetic-secret"
	if w := request("PUT", "", c, raw, ""); w.Code != 403 {
		t.Fatalf("CSRF %d", w.Code)
	}
	w := request("PUT", "", c, raw, session.CsrfToken)
	if w.Code != 200 {
		t.Fatalf("save %d %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "synthetic") {
		t.Fatal("response leaked credential")
	}
	values, e := store.ReadSettings(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if strings.Contains(values["notifications.webhook_url"], "notify.example") || values["notifications.signing_secret"] == "synthetic-secret" {
		t.Fatal("plaintext credentials")
	}
	capture := &notificationCapture{fail: true}
	m.Mail().Channels = capture
	testInput := contracts.NotifyTest{Destination: "channel", Recipient: "ignored@example.test", Template: c.Templates[0]}
	if w := request("POST", "/test", testInput, raw, session.CsrfToken); w.Code != 502 || !strings.Contains(w.Body.String(), "NOTIFICATION_CHANNEL_DELIVERY_FAILED") || strings.Contains(w.Body.String(), "SMTP") {
		t.Fatalf("channel test error: %d %s", w.Code, w.Body.String())
	}
	capture.fail = false
	if w := request("POST", "/test", testInput, raw, session.CsrfToken); w.Code != 200 {
		t.Fatalf("channel test without SMTP: %d %s", w.Code, w.Body.String())
	}
	if len(capture.messages) != 1 || capture.messages[0].Channel != "webhook" || capture.messages[0].Event != "login" || capture.messages[0].To != "" {
		t.Fatal("channel test used wrong destination or omitted event")
	}
	testInput.Destination = "email"
	testInput.Recipient = "test@example.test"
	if w := request("POST", "/test", testInput, raw, session.CsrfToken); w.Code != 409 || !strings.Contains(w.Body.String(), "MAIL_NOT_READY") {
		t.Fatalf("email readiness: %d %s", w.Code, w.Body.String())
	}
	capture.fail = true
	capture.messages = nil
	_, e = identity.Create(ctx, contracts.UserCreate{Username: "second", Email: "second@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if e != nil {
		t.Fatal(e)
	}
	jobs, e := m.Mail().Store.MailJobs(ctx)
	if e != nil || len(jobs.Items) != 1 {
		t.Fatalf("expected atomic channel job: %#v %v", jobs, e)
	}
	var encrypted string
	if e = store.DB.QueryRow("SELECT payload FROM unicore_mail_jobs WHERE id=?", jobs.Items[0].ID).Scan(&encrypted); e != nil {
		t.Fatal(e)
	}
	if strings.Contains(encrypted, "second") {
		t.Fatal("plaintext queue")
	}
	now := int(time.Now().Unix())
	if e = m.Mail().Tick(ctx, now); e != nil {
		t.Fatal(e)
	}
	jobs, _ = m.Mail().Store.MailJobs(ctx)
	if jobs.Items[0].State != "pending" || jobs.Items[0].Attempts != 1 {
		t.Fatal("failed delivery did not retry")
	}
	if e = m.Close(); e != nil {
		t.Fatal(e)
	}
	m, e = install.Open(ctx, install.Options{DataDir: dir})
	if e != nil {
		t.Fatal(e)
	}
	capture.fail = false
	m.Mail().Channels = capture
	if e = m.Mail().Tick(ctx, now+20); e != nil {
		t.Fatal(e)
	}
	if len(capture.messages) != 1 || capture.messages[0].Event != "user_created" {
		t.Fatal("restart lost queued event")
	}
	jobs, _ = m.Mail().Store.MailJobs(ctx)
	if jobs.Items[0].State != "sent" {
		t.Fatal("delivery not recorded")
	}
	// The second factor is the successful login boundary.
	_, settings, identity, _ = m.Services()
	if e = identity.ChangePassword(ctx, member, contracts.ChangePasswordInput{CurrentPassword: "test-password-strong", Password: "new-password-strong"}, "203.0.113.10"); e != nil {
		t.Fatal(e)
	}
	c, _ = settings.Notifications(ctx)
	if !c.WebhookConfigured || !c.SigningConfigured || c.WebhookUrl != "" {
		t.Fatal("secret persistence")
	}
	c, _ = settings.Notifications(ctx)
	for i := range c.Rules {
		if c.Rules[i].Event == "login" {
			c.Rules[i].AdminChannel = true
		}
	}
	if _, e = settings.SaveNotifications(ctx, c, admin.ID); e != nil {
		t.Fatal(e)
	}
	store, _, _, _ = m.Services()
	secret := "JBSWY3DPEHPK3PXP"
	if _, e = store.DB.Exec("INSERT INTO unicore_personal_accounts(user_id,display_name,totp_secret,recovery_digests,last_step,setup_secret,setup_session,setup_expires,setup_attempts) VALUES(?,'',?,'',-1,'','',0,0)", member.ID, m.Mail().Secrets.Seal(secret)); e != nil {
		t.Fatal(e)
	}
	before, _ := m.Mail().Store.MailJobs(ctx)
	pending, loginToken, e := identity.Login(ctx, contracts.LoginInput{Username: "member", Password: "new-password-strong"}, "203.0.113.10", false, false, 1)
	if e != nil || pending.MfaPending == nil || !*pending.MfaPending {
		t.Fatalf("MFA boundary: %v", e)
	}
	after, _ := m.Mail().Store.MailJobs(ctx)
	if len(after.Items) != len(before.Items) {
		t.Fatal("login notified before second factor")
	}
	code := personalCode(secret, time.Now().Unix()/30)
	if e = identity.Personal.Factor(ctx, loginToken, code, "203.0.113.10", false); e != nil {
		t.Fatal(e)
	}
	after, _ = m.Mail().Store.MailJobs(ctx)
	if len(after.Items) != len(before.Items)+1 {
		t.Fatal("verified login notification missing")
	}
	if e = identity.Personal.Factor(ctx, loginToken, code, "203.0.113.10", false); e == nil {
		t.Fatal("factor replay accepted")
	}

	c, _ = settings.Notifications(ctx)
	c.Enabled = false
	if _, e = settings.SaveNotifications(ctx, c, admin.ID); e != nil {
		t.Fatal(e)
	}
	delivered := len(capture.messages)
	if e = m.Mail().Tick(ctx, int(time.Now().Unix())+30); e != nil {
		t.Fatal(e)
	}
	if len(capture.messages) != delivered {
		t.Fatal("disabled event still delivered")
	}
	jobs, _ = m.Mail().Store.MailJobs(ctx)
	cancelled := false
	for _, job := range jobs.Items {
		if job.State == "cancelled" && job.LastError == "DISABLED" {
			cancelled = true
		}
	}
	if !cancelled {
		t.Fatal("suppressed delivery falsely recorded as sent")
	}

}
