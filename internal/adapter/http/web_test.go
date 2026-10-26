// Author: yunnuo <ymz@ebox.vip>
// Description: Full installation/authentication/authorization behavior through real HTTP handlers.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/runtime"
)

func TestPlatformInstallAuthAndRBAC(t *testing.T) {
	manager, err := install.Open(context.Background(), install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	tokenBytes, _ := os.ReadFile(manager.TokenPath())
	token := strings.TrimSpace(string(tokenBytes))
	router := New(Config{Core: bootstrap.Core(), Metadata: runtime.Metadata("web-platform", "development"), Install: manager, Assets: fstest.MapFS{"index.html": {Data: []byte("<html>app</html>")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, input any, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
		t.Helper()
		raw, _ := json.Marshal(input)
		r := httptest.NewRequest(method, "http://localhost"+path, bytes.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Bootstrap-Token", token)
		r.Header.Set("X-CSRF-Token", csrf)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	if w := request("GET", "/", nil, nil, ""); w.Code != 303 || w.Header().Get("Location") != "/install" {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request("GET", "/api/v1/admin/users", nil, nil, ""); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	input := contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Test platform", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"}
	w := request("POST", "/api/v1/install/complete", input, nil, "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatal("unsafe session cookie")
	}
	adminCookie := cookies[0]
	if w = request("POST", "/api/v1/install/complete", input, nil, ""); w.Code != 409 {
		t.Fatal("repeat install accepted", w.Code)
	}
	if w = request("GET", "/api/v1/admin/users", nil, nil, ""); w.Code != 401 {
		t.Fatal("anonymous admin access", w.Code)
	}
	w = request("GET", "/api/v1/bootstrap", nil, adminCookie, "")
	var data contracts.BootstrapResponse
	if err = json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if data.Data.CurrentUser == nil || data.Data.CsrfToken == nil {
		t.Fatal("missing authenticated bootstrap")
	}
	csrf := *data.Data.CsrfToken
	newUser := contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}
	if w = request("POST", "/api/v1/admin/users", newUser, adminCookie, ""); w.Code != 403 {
		t.Fatal("missing CSRF accepted", w.Code)
	}
	w = request("POST", "/api/v1/admin/users", newUser, adminCookie, csrf)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var member contracts.UserResponse
	_ = json.Unmarshal(w.Body.Bytes(), &member)
	if w = request("PATCH", "/api/v1/admin/users/"+data.Data.CurrentUser.ID, contracts.UserUpdate{Status: "disabled", Role: "super_admin"}, adminCookie, csrf); w.Code != 409 {
		t.Fatal("last admin disabled", w.Code, w.Body.String())
	}
	// Default captcha is returned as image data; extracting test glyphs verifies the round-trip without bypassing the endpoint.
	w = request("GET", "/api/v1/auth/captcha", nil, nil, "")
	var challenge contracts.CaptchaResponse
	_ = json.Unmarshal(w.Body.Bytes(), &challenge)
	svg, _ := base64.StdEncoding.DecodeString(strings.SplitN(challenge.Data.Image, ",", 2)[1])
	answer := ""
	for _, match := range regexp.MustCompile(`>([0-9])</text>`).FindAllStringSubmatch(string(svg), -1) {
		answer += match[1]
	}
	login := contracts.LoginInput{Username: "member", Password: "test-password-strong", CaptchaID: challenge.Data.ID, CaptchaAnswer: answer}
	w = request("POST", "/api/v1/auth/login", login, nil, "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	memberCookie := w.Result().Cookies()[0]
	var memberSession contracts.SessionResponse
	_ = json.Unmarshal(w.Body.Bytes(), &memberSession)
	if w = request("GET", "/api/v1/admin/users", nil, memberCookie, ""); w.Code != 403 {
		t.Fatal("ordinary user got admin API", w.Code)
	}
	if w = request("POST", "/api/v1/auth/login", login, nil, ""); w.Code != 400 {
		t.Fatal("captcha replay accepted", w.Code)
	}
	if w = request("PATCH", "/api/v1/admin/settings", contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "admin.path", Value: "/manage"}}}, adminCookie, csrf); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = request("GET", "/admin", nil, adminCookie, ""); w.Code != 404 {
		t.Fatal("old admin path still active", w.Code)
	}
	if w = request("GET", "/manage", nil, adminCookie, ""); w.Code != 200 {
		t.Fatal("new admin path unavailable", w.Code)
	}
	if w = request("PATCH", "/api/v1/admin/users/"+member.Data.ID, contracts.UserUpdate{Status: "disabled", Role: "user"}, adminCookie, csrf); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = request("GET", "/api/v1/auth/session", nil, memberCookie, ""); w.Code != 401 {
		t.Fatal("disabled session remained valid", w.Code)
	}
	if w = request("POST", "/api/v1/auth/logout", nil, adminCookie, csrf); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = request("GET", "/api/v1/admin/users", nil, adminCookie, ""); w.Code != 401 {
		t.Fatal("logged-out session remained valid", w.Code)
	}
}
