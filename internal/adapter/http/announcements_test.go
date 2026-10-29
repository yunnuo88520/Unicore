// Author: yunnuo <ymz@ebox.vip>
// Description: Announcement endpoint authorization, CSRF, identity separation, content validation and profile boundaries.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
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

func TestAnnouncementEndpointPolicy(t *testing.T) {
	ctx := context.Background()
	m, e := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if e != nil {
		t.Fatal(e)
	}
	defer m.Close()
	token, _ := os.ReadFile(m.TokenPath())
	_, admin, e := m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Test", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if e != nil {
		t.Fatal(e)
	}
	a, araw, e := m.Identity(true).Issue(ctx, admin, 1)
	if e != nil {
		t.Fatal(e)
	}
	member, e := m.Identity(false).Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if e != nil {
		t.Fatal(e)
	}
	u, uraw, e := m.Identity(false).Issue(ctx, member, 1)
	if e != nil {
		t.Fatal(e)
	}
	router := New(Config{Core: bootstrap.Core(), Install: m, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, in any, cookie, value, csrf string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(in)
		r := httptest.NewRequest(method, "http://localhost/api/v1"+path, bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", csrf)
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: cookie, Value: value})
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	check := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("want %d got %d %s", status, w.Code, w.Body.String())
		}
	}
	input := contracts.AnnouncementInput{Content: "中文公告 **欢迎**", Format: "markdown", Type: "info", Status: "published", PublishAt: int(time.Now().Unix()), Note: "private"}
	for _, route := range []struct {
		method, path string
		body         any
	}{{"GET", "/admin/announcements", nil}, {"POST", "/admin/announcements", input}, {"PUT", "/admin/announcements/unknown", contracts.AnnouncementUpdate{Content: input.Content, Format: "markdown", Type: "info", Status: "published", PublishAt: input.PublishAt, Version: 1}}, {"POST", "/admin/announcements/delete", contracts.AnnouncementDelete{Items: []contracts.AnnouncementSelection{{ID: "unknown", Version: 1}}}}, {"GET", "/admin/announcements/settings", nil}, {"PUT", "/admin/announcements/settings", contracts.AnnouncementSetting{Enabled: false}}, {"POST", "/admin/announcements/preview", input}} {
		check(request(route.method, route.path, route.body, "", "", ""), 401)
		check(request(route.method, route.path, route.body, sessionCookie, uraw, u.CsrfToken), 403)
		if route.method != "GET" {
			check(request(route.method, route.path, route.body, administratorSessionCookie, araw, ""), 403)
		}
	}
	check(request("GET", "/announcements", nil, "", "", ""), 401)
	check(request("GET", "/announcements", nil, administratorSessionCookie, araw, a.CsrfToken), 401)
	check(request("GET", "/admin/announcements", nil, administratorSessionCookie, uraw, u.CsrfToken), 401)
	created := request("POST", "/admin/announcements", input, administratorSessionCookie, araw, a.CsrfToken)
	check(created, 200)
	var envelope contracts.AnnouncementEntryResponse
	_ = json.Unmarshal(created.Body.Bytes(), &envelope)
	feed := request("GET", "/announcements", nil, sessionCookie, uraw, "")
	check(feed, 200)
	if strings.Contains(feed.Body.String(), "private") || strings.Contains(feed.Body.String(), "created_by") || !strings.Contains(feed.Body.String(), "中文公告") {
		t.Fatal("bad user projection", feed.Body.String())
	}
	check(request("GET", "/announcements/"+envelope.Data.ID, nil, sessionCookie, uraw, ""), 200)
	check(request("GET", "/admin/announcements?page_size=999", nil, administratorSessionCookie, araw, ""), 400)
	input.Format = "html"
	input.Content = `<p onclick="alert(1)">bad</p>`
	check(request("POST", "/admin/announcements", input, administratorSessionCookie, araw, a.CsrfToken), 400)
	check(request("PUT", "/admin/announcements/settings", contracts.AnnouncementSetting{Enabled: false}, administratorSessionCookie, araw, a.CsrfToken), 200)
	check(request("GET", "/announcements/"+envelope.Data.ID, nil, sessionCookie, uraw, ""), 404)
	feed = request("GET", "/announcements", nil, sessionCookie, uraw, "")
	if !strings.Contains(feed.Body.String(), `"enabled":false`) || !strings.Contains(feed.Body.String(), `"items":[]`) {
		t.Fatal(feed.Body.String())
	}
}
func TestAnnouncementsUnavailableLocally(t *testing.T) {
	ctx := context.Background()
	m, e := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if e != nil {
		t.Fatal(e)
	}
	defer m.Close()
	token, _ := os.ReadFile(m.TokenPath())
	if _, _, e = m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-standalone", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Local", BaseUrl: "http://localhost"}); e != nil {
		t.Fatal(e)
	}
	router := New(Config{Core: bootstrap.Core(), Install: m, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	for _, path := range []string{"/announcements", "/announcements/id", "/admin/announcements", "/admin/announcements/settings"} {
		r := httptest.NewRequest("GET", "http://localhost/api/v1"+path, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != 404 {
			t.Fatal(path, w.Code, w.Body.String())
		}
	}
	store, _, _, _ := m.Services()
	var count int
	if e = store.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='platform_announcements'").Scan(&count); e != nil || count != 0 {
		t.Fatal("local platform migration", count, e)
	}
}
