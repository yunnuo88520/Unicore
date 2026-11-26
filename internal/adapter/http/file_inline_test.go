// Author: yunnuo <ymz@ebox.vip>
// Description: Inline file responses carry the exact CSP per media type; PDFs render unsandboxed, everything else stays sealed.
package httpadapter

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/runtime"
)

func TestFileContentInlineHeaders(t *testing.T) {
	ctx := t.Context()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	tokenBytes, _ := os.ReadFile(manager.TokenPath())
	if _, _, err := manager.Complete(ctx, strings.TrimSpace(string(tokenBytes)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Inline", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"}); err != nil {
		t.Fatal(err)
	}
	router := New(Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "development"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	service := manager.Files()
	if service == nil {
		t.Fatal("files service missing")
	}
	actor := files.Actor{ID: "installer", Realm: "administrator", Admin: true}
	upload := func(name, mimeType string, body []byte) files.Record {
		t.Helper()
		grant, err := service.Upload(ctx, actor, contracts.FileUploadInput{OriginalName: name, MimeType: mimeType, Size: len(body)})
		if err != nil {
			t.Fatal("upload", name, err)
		}
		if err := service.Receive(ctx, actor, grant.FileID, bytes.NewReader(body), int64(len(body))); err != nil {
			t.Fatal("receive", name, err)
		}
		if _, err := service.Complete(ctx, actor, grant.FileID); err != nil {
			t.Fatal("complete", name, err)
		}
		record, err := service.Repo.Get(ctx, grant.FileID)
		if err != nil {
			t.Fatal(err)
		}
		return record
	}
	pdf := upload("doc.pdf", "application/pdf", []byte("%PDF-1.4\n%%EOF\n"))
	text := upload("note.txt", "text/plain", []byte("hello"))
	get := func(url string) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", "http://localhost"+url, nil))
		return w
	}
	inline, err := service.CatalogAccess(ctx, actor, pdf.FileID, true)
	if err != nil {
		t.Fatal("pdf access", err)
	}
	w := get(inline.Url)
	if w.Code != http.StatusOK {
		t.Fatal("pdf inline status", w.Code, w.Body.String())
	}
	for check, want := range map[string]string{
		"Content-Type":            "application/pdf",
		"Content-Disposition":     "inline",
		"Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
		"X-Frame-Options":         "SAMEORIGIN",
		"X-Content-Type-Options":  "nosniff",
	} {
		if got := w.Header().Get(check); got != want {
			t.Fatalf("pdf inline %s = %q, want %q", check, got, want)
		}
	}
	plain, err := service.CatalogAccess(ctx, actor, text.FileID, true)
	if err != nil {
		t.Fatal("text access", err)
	}
	w = get(plain.Url)
	if got := w.Header().Get("Content-Security-Policy"); got != "default-src 'none'; sandbox" {
		t.Fatalf("text inline CSP = %q", got)
	}
	if got := w.Header().Get("X-Frame-Options"); got != "" {
		t.Fatalf("text inline X-Frame-Options = %q", got)
	}
	// Without the inline flag the PDF falls back to a sandboxed attachment.
	plain, err = service.CatalogAccess(ctx, actor, pdf.FileID, false)
	if err != nil {
		t.Fatal("pdf attachment access", err)
	}
	w = get(plain.Url)
	if got := w.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment") {
		t.Fatalf("pdf attachment disposition = %q", got)
	}
	if got := w.Header().Get("Content-Security-Policy"); got != "default-src 'none'; sandbox" {
		t.Fatalf("pdf attachment CSP = %q", got)
	}
	// The catalog carries the human-readable logical path for governance.
	adminCookie, _ := issueSession(t, manager, true, adminUser(t, manager))
	authed := func(path string) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "http://localhost"+path, nil)
		r.AddCookie(adminCookie)
		router.ServeHTTP(w, r)
		return w
	}
	list := authed("/api/v1/admin/file-catalog")
	if list.Code != http.StatusOK {
		t.Fatal("catalog list", list.Code, list.Body.String())
	}
	var payload struct {
		Data struct {
			Items []contracts.FileCatalogEntry `json:"items"`
		} `json:"data"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	paths := map[string]string{}
	for _, item := range payload.Data.Items {
		paths[item.File.FileID] = item.StoragePath
	}
	if paths[pdf.FileID] != "files/"+pdf.Key {
		t.Fatalf("pdf storage path = %q, want files/%s", paths[pdf.FileID], pdf.Key)
	}
	if paths[text.FileID] != "files/"+text.Key {
		t.Fatalf("text storage path = %q, want files/%s", paths[text.FileID], text.Key)
	}
}
