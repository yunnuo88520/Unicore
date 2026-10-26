// Author: yunnuo <ymz@ebox.vip>
// Description: Real profile/permission/CSRF/body boundaries, public asset MIME and restart persistence.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/yunnuo/unicore/assets/brand"
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

func TestBrandHTTP(t *testing.T) {
	for _, profile := range []contracts.Profile{"web-platform", "web-standalone"} {
		t.Run(string(profile), func(t *testing.T) {
			ctx := context.Background()
			directory := t.TempDir()
			manager, err := install.Open(ctx, install.Options{DataDir: directory})
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = manager.Close() }()
			token, _ := os.ReadFile(manager.TokenPath())
			_, admin, err := manager.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: profile, Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "品牌站点", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
			if err != nil {
				t.Fatal(err)
			}
			router := New(Config{Core: bootstrap.Core(), Install: manager, Assets: fstest.MapFS{"index.html": {Data: []byte("app")}, "site.webmanifest": {Data: []byte(`{"icons":[]}`)}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
			request := func(method, path string, input any, cookie, csrf string) *httptest.ResponseRecorder {
				raw, _ := json.Marshal(input)
				r := httptest.NewRequest(method, "http://localhost"+path, bytes.NewReader(raw))
				r.Header.Set("Content-Type", "application/json")
				r.Header.Set("X-CSRF-Token", csrf)
				if cookie != "" {
					r.AddCookie(&http.Cookie{Name: sessionCookie, Value: cookie})
				}
				w := httptest.NewRecorder()
				router.ServeHTTP(w, r)
				return w
			}
			expect := func(w *httptest.ResponseRecorder, status int) {
				t.Helper()
				if w.Code != status {
					t.Fatalf("want %d got %d: %s", status, w.Code, w.Body.String())
				}
			}
			path := "/api/v1/branding"
			cookie, csrf := "", ""
			input := contracts.BrandingInput{Slot: "logo", Content: base64.StdEncoding.EncodeToString(brand.EmailLogo)}
			if profile == "web-platform" {
				path = "/api/v1/admin/branding"
				_, _, identity, _ := manager.Services()
				session, raw, e := identity.Issue(ctx, admin, 1)
				if e != nil {
					t.Fatal(e)
				}
				cookie, csrf = raw, session.CsrfToken
				expect(request("GET", path, nil, "", ""), 401)
				expect(request("PUT", path, input, cookie, ""), 403)
				expect(request("PUT", "/api/v1/branding", input, "", ""), 404)
				member, e := identity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
				if e != nil {
					t.Fatal(e)
				}
				ms, mr, _ := identity.Issue(ctx, member, 1)
				expect(request("GET", path, nil, mr, ""), 403)
				expect(request("PUT", path, input, mr, ms.CsrfToken), 403)
			} else {
				expect(request("GET", "/api/v1/admin/branding", nil, "", ""), 404)
			}
			expect(request("PUT", path, map[string]string{"slot": "logo", "content": strings.Repeat("a", 400000)}, cookie, csrf), 413)
			w := request("PUT", path, input, cookie, csrf)
			expect(w, 200)
			var response contracts.BrandingResponse
			_ = json.Unmarshal(w.Body.Bytes(), &response)
			if !strings.HasPrefix(response.Data.Logo, "/brand-assets/") {
				t.Fatal(response)
			}
			asset := request("GET", response.Data.Logo, nil, "", "")
			expect(asset, 200)
			if asset.Header().Get("Content-Type") != "image/png" || asset.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("unsafe image headers")
			}
			expect(request("GET", "/brand-assets/not-a-file", nil, "", ""), 404)
			expect(request("GET", "/brand-assets/a/b", nil, "", ""), 404)
			w = request("GET", "/api/v1/bootstrap", nil, "", "")
			if !strings.Contains(w.Body.String(), response.Data.Logo) {
				t.Fatal("public bootstrap missing brand")
			}
			_, service, _, _ := manager.Services()
			_, err = service.Branding.Update(ctx, contracts.BrandingInput{Slot: "favicon", Content: input.Content}, admin.ID, false)
			if err != nil {
				t.Fatal(err)
			}
			w = request("GET", "/site.webmanifest", nil, "", "")
			expect(w, 200)
			if !strings.Contains(w.Body.String(), "品牌站点") || !strings.Contains(w.Body.String(), response.Data.Logo) {
				t.Fatal("manifest missing instance identity", w.Body.String())
			}
			expect(request("PUT", path, contracts.BrandingInput{Slot: "logo", Content: "bad"}, cookie, csrf), 400)
			expect(request("PATCH", strings.Replace(path, "branding", "settings", 1), contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "branding.logo", Value: ""}}}, cookie, csrf), 400)
			if err = manager.Close(); err != nil {
				t.Fatal(err)
			}
			manager, err = install.Open(ctx, install.Options{DataDir: directory})
			if err != nil {
				t.Fatal(err)
			}
			_, service, _, _ = manager.Services()
			snapshot, err := service.Branding.Snapshot(ctx, false)
			if err != nil || snapshot.Logo != response.Data.Logo {
				t.Fatal("restart lost image", snapshot, err)
			}
		})
	}
}
