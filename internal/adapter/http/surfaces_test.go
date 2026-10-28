// Author: yunnuo <ymz@ebox.vip>
// Description: Fixed API realms, administrator-created user login and separate browser entries.
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
)

func TestSeparateSurfacesAndCreatedUserLogin(t *testing.T) {
	ctx := context.Background()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	token, _ := os.ReadFile(manager.TokenPath())
	_, admin, err := manager.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Surfaces", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "administrator-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	_, settings, _, _ := manager.Services()
	if _, err = settings.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.login_captcha", Value: "false"}}}, admin.ID); err != nil {
		t.Fatal(err)
	}
	session, raw, err := manager.Identity(true).Issue(ctx, admin, 1)
	if err != nil {
		t.Fatal(err)
	}
	adminCookie := &http.Cookie{Name: administratorSessionCookie, Value: raw}
	router := New(Config{Core: bootstrap.Core(), Install: manager, Assets: fstest.MapFS{"index.html": {Data: []byte("USER_ENTRY")}, "admin.html": {Data: []byte("ADMIN_ENTRY")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, input any, cookie *http.Cookie, csrf, spoof string) *httptest.ResponseRecorder {
		t.Helper()
		body, _ := json.Marshal(input)
		r := httptest.NewRequest(method, "http://localhost"+path, bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", csrf)
		r.Header.Set("X-Unicore-Identity", spoof)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	check := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatal(status, w.Code, w.Body.String())
		}
	}
	check(request("POST", "/api/v1/admin/users", contracts.UserCreate{Username: "createdmember", Email: "member@example.test", Password: "member-password-strong", Role: "user"}, adminCookie, session.CsrfToken, ""), 200)
	login := contracts.LoginInput{Username: "createdmember", Password: "member-password-strong"}
	check(request("POST", "/api/v1/admin/auth/login", login, nil, "", "user"), 401)
	w := request("POST", "/api/v1/auth/login", login, nil, "", "administrator")
	check(w, 200)
	memberCookie := w.Result().Cookies()[0]
	if memberCookie.Name != sessionCookie {
		t.Fatal("realm switched by header")
	}
	check(request("GET", "/api/v1/admin/users", nil, memberCookie, "", "administrator"), 403)
	check(request("GET", "/api/v1/admin/auth/session", nil, memberCookie, "", "administrator"), 403)
	check(request("GET", "/api/v1/auth/session", nil, adminCookie, "", "administrator"), 401)
	check(request("GET", "/api/v1/admin/auth/session", nil, adminCookie, "", "user"), 200)
	w = request("GET", "/api/v1/bootstrap", nil, memberCookie, "", "administrator")
	check(w, 200)
	var boot contracts.BootstrapResponse
	_ = json.Unmarshal(w.Body.Bytes(), &boot)
	if boot.Data.CurrentUser == nil || boot.Data.CurrentUser.Username != "createdmember" || boot.Data.AdminPath != "" {
		t.Fatal(w.Body.String())
	}
	for path, entry := range map[string]string{"/": "USER_ENTRY", "/login": "USER_ENTRY", "/register": "USER_ENTRY", "/admin": "ADMIN_ENTRY"} {
		w = request("GET", path, nil, nil, "", "")
		check(w, 200)
		if w.Body.String() != entry {
			t.Fatal(path, w.Body.String())
		}
	}
	check(request("GET", "/admin.html", nil, nil, "", ""), 404)
	// Each route fixes the identity realm; spoofed headers and another realm's cookie cannot change note ownership.
	w = request("POST", "/api/v1/admin/notes", contracts.NoteInput{Title: "Admin private", Body: "private", Status: "open", AttachmentIds: []string{}}, adminCookie, session.CsrfToken, "user")
	check(w, 200)
	var note contracts.NoteResponse
	_ = json.Unmarshal(w.Body.Bytes(), &note)
	check(request("POST", "/api/v1/admin/notes", contracts.NoteInput{Title: "No csrf", Status: "open", AttachmentIds: []string{}}, adminCookie, "", ""), 403)
	check(request("GET", "/api/v1/notes", nil, nil, "", ""), 401)
	check(request("GET", "/api/v1/admin/notes", nil, memberCookie, "", "administrator"), 403)
	w = request("GET", "/api/v1/notes", nil, memberCookie, "", "administrator")
	check(w, 200)
	var notes contracts.NoteListResponse
	_ = json.Unmarshal(w.Body.Bytes(), &notes)
	if notes.Data.Total != 0 {
		t.Fatal("administrator note leaked to user")
	}
	w = request("GET", "/api/v1/auth/session", nil, memberCookie, "", "")
	check(w, 200)
	var memberSession contracts.SessionResponse
	_ = json.Unmarshal(w.Body.Bytes(), &memberSession)
	check(request("PUT", "/api/v1/notes/"+note.Data.ID, contracts.NoteUpdate{Title: "Stolen", Status: "open", Version: 1, AttachmentIds: []string{}}, memberCookie, memberSession.Data.CsrfToken, "administrator"), 404)
	check(request("POST", "/api/v1/notes", contracts.NoteInput{Title: "Invalid attachment", Status: "open", AttachmentIds: []string{"foreign-file"}}, memberCookie, memberSession.Data.CsrfToken, ""), 400)
	check(request("POST", "/api/v1/admin/auth/logout", nil, adminCookie, session.CsrfToken, ""), 200)
	check(request("GET", "/api/v1/auth/session", nil, memberCookie, "", ""), 200)
}
