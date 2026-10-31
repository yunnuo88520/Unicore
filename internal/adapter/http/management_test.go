// Author: yunnuo <ymz@ebox.vip>
// Description: Real HTTP permissions, SMTP delivery, restart persistence and audit snapshots for management tools.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/testutil"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestManagementTemplatesAndLogs(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	manager, e := install.Open(ctx, install.Options{DataDir: dir})
	if e != nil {
		t.Fatal(e)
	}
	defer func() { manager.Close() }()
	token, _ := os.ReadFile(manager.TokenPath())
	_, admin, e := manager.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Management", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if e != nil {
		t.Fatal(e)
	}
	session, raw, e := manager.Identity(true).Issue(ctx, admin, 1)
	if e != nil {
		t.Fatal(e)
	}
	_, service, identity, _ := manager.Services()
	member, e := identity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if e != nil {
		t.Fatal(e)
	}
	_, memberRaw, _ := identity.Issue(ctx, member, 1)
	router := New(Config{Core: bootstrap.Core(), Install: manager, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, in any, who, csrf string) *httptest.ResponseRecorder {
		data, _ := json.Marshal(in)
		r := httptest.NewRequest(method, "http://localhost/api/v1"+path, bytes.NewReader(data))
		r.RemoteAddr = "[2001:db8::2]:31234"
		r.Header.Set("X-Forwarded-For", "8.8.8.8")
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
	check := func(w *httptest.ResponseRecorder, code int) {
		t.Helper()
		if w.Code != code {
			t.Fatalf("want %d got %d %s", code, w.Code, w.Body.String())
		}
	}
	input := contracts.MailTemplateInput{Purpose: "login", Subject: "{{site_name}} · Custom login", Body: `<p>Custom code: <b>{{code}}</b></p><p>Visit <a href="{{site_url}}">site</a></p>`}
	for _, route := range []struct {
		method, path string
		in           any
	}{{"GET", "/admin/logs", nil}, {"GET", "/admin/logs/export", nil}, {"GET", "/admin/settings/mail/templates", nil}, {"PUT", "/admin/settings/mail/templates", input}, {"POST", "/admin/settings/mail/templates/preview", input}, {"POST", "/admin/settings/mail/templates/test", contracts.MailTemplateTestInput{Template: input, Recipient: "recipient@example.test"}}, {"POST", "/admin/settings/mail/templates/reset", contracts.MailTemplateReset{Purpose: "login"}}} {
		check(request(route.method, route.path, route.in, "", ""), 401)
		check(request(route.method, route.path, route.in, memberRaw, ""), 403)
		if route.method != "GET" {
			check(request(route.method, route.path, route.in, raw, ""), 403)
		}
	}
	check(request("PUT", "/admin/settings/mail/templates", input, raw, session.CsrfToken), 200)
	unsafe := input
	unsafe.Body = `<p onclick="bad()">{{code}}</p>`
	check(request("PUT", "/admin/settings/mail/templates", unsafe, raw, session.CsrfToken), 400)
	check(request("PATCH", "/admin/settings", contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "mail.template.login", Value: "unsafe"}}}, raw, session.CsrfToken), 400)
	check(request("GET", "/admin/logs?page=-1", nil, raw, ""), 400)
	check(request("GET", "/admin/logs?sort=sql", nil, raw, ""), 400)
	logs := request("GET", "/admin/logs?action=mail.template.updated&search=admin", nil, raw, "")
	check(logs, 200)
	var list contracts.AuditLogResponse
	_ = json.Unmarshal(logs.Body.Bytes(), &list)
	if list.Data.Total != 1 || list.Data.Items[0].IpAddress != "2001:db8::2" || list.Data.Items[0].ActorName != "admin" || list.Data.Items[0].Target != "mail-template/login" {
		t.Fatal("metadata snapshot", logs.Body.String())
	}
	exported := request("GET", "/admin/logs/export?action=mail.template.updated", nil, raw, "")
	check(exported, 200)
	if !strings.Contains(exported.Body.String(), "mail-template/login") || !strings.Contains(exported.Body.String(), `"exported":1`) {
		t.Fatal(exported.Body.String())
	}
	for _, v := range []string{"=HYPERLINK(1)", " +SUM(1)", "@cmd", "-cmd", "\tcmd"} {
		if !strings.HasPrefix(csvSafe(v), "'") {
			t.Fatal("CSV formula", v)
		}
	}
	smtp, e := testutil.StartSMTP()
	if e != nil {
		t.Fatal(e)
	}
	defer smtp.Close()
	host, port, _ := net.SplitHostPort(smtp.Listener.Addr().String())
	_, e = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "mail.host", Value: host}, {Key: "mail.port", Value: port}, {Key: "mail.tls", Value: "plain"}, {Key: "mail.from", Value: "sender@example.test"}}}, admin.ID)
	if e != nil {
		t.Fatal(e)
	}
	if e = manager.Mail().Test(ctx, "recipient@example.test", admin.ID); e != nil {
		t.Fatal(e)
	}
	check(request("POST", "/admin/settings/mail/templates/test", contracts.MailTemplateTestInput{Template: input, Recipient: "recipient@example.test"}, raw, session.CsrfToken), 200)
	if len(smtp.Messages()) != 2 || !strings.Contains(testutil.MailText(smtp.Messages()[1]), "Custom code: 654321") {
		t.Fatal("real template delivery")
	}
	_, e = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "account.email_login_enabled", Value: "true"}, {Key: "security.login_captcha", Value: "false"}}}, admin.ID)
	if e != nil {
		t.Fatal(e)
	}
	if e = manager.Close(); e != nil {
		t.Fatal(e)
	}
	manager, e = install.Open(ctx, install.Options{DataDir: dir})
	if e != nil {
		t.Fatal(e)
	}
	templates, e := manager.Mail().Templates(ctx)
	if e != nil {
		t.Fatal(e)
	}
	found := false
	for _, v := range templates.Items {
		if v.Purpose == "login" {
			found = v.Customized && v.Subject == input.Subject
		}
	}
	if !found {
		t.Fatal("template lost on restart")
	}
	if _, e = manager.AccountService(true).RequestCode(ctx, contracts.EmailRequest{Email: admin.Email}, "local", "login"); e != nil {
		t.Fatal(e)
	}
	if e = manager.Mail().Tick(ctx, int(time.Now().Unix())); e != nil {
		t.Fatal(e)
	}
	messages := smtp.Messages()
	if len(messages) != 3 || !strings.Contains(testutil.MailText(messages[2]), "Custom code:") {
		t.Fatal("account flow ignored template")
	}
}
