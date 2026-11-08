// Author: yunnuo <ymz@ebox.vip>
// Description: User-realm data scope integration: realm isolation, scoped peer reads, attachment-bound file signing.
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
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/filesql"
	"github.com/yunnuo/unicore/internal/adapter/storage/notessql"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/runtime"
)

// TestUserRealmScopeReadsAndSigns covers the data-scope surface over real HTTP:
// an all-scope member sees peer user-realm rows but never administrator or
// local rows, can sign peer and attachment files, and every issuance re-checks
// the current scope.
func TestUserRealmScopeReadsAndSigns(t *testing.T) {
	ctx := t.Context()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	tokenBytes, _ := os.ReadFile(manager.TokenPath())
	_, admin, err := manager.Complete(ctx, strings.TrimSpace(string(tokenBytes)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Scope", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	store, _, identity, _ := manager.Services()
	member, err := identity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	peer, err := identity.Create(ctx, contracts.UserCreate{Username: "peer", Email: "peer@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	router := New(Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "development"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	session := func(administrator bool, user contracts.User) (*http.Cookie, string) {
		s, raw, err := manager.Identity(administrator).Issue(ctx, user, 1)
		if err != nil {
			t.Fatal(err)
		}
		name := sessionCookie
		if administrator {
			name = administratorSessionCookie
		}
		return &http.Cookie{Name: name, Value: raw}, s.CsrfToken
	}
	request := func(method, path string, input any, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
		t.Helper()
		raw, _ := json.Marshal(input)
		r := httptest.NewRequest(method, "http://localhost"+path, strings.NewReader(string(raw)))
		r.Header.Set("Content-Type", "application/json")
		if csrf != "" {
			r.Header.Set("X-CSRF-Token", csrf)
		}
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	adminCookie, adminCSRF := session(true, admin)
	seed := filesql.Repository{Store: store}
	now := int(time.Now().Unix())
	newFile := func(id, creator, realm string) {
		t.Helper()
		if err := seed.Create(ctx, files.Record{FileEntry: contracts.FileEntry{FileID: id, OriginalName: id + ".txt", StorageType: "local", LocationID: "local", MimeType: "text/plain", Size: len(id), CreatorID: creator, CreatorRealm: realm, CreatedAt: now, State: "ready"}, Purpose: "user"}, nil); err != nil {
			t.Fatal(id, err)
		}
	}
	newFile("file-member", member.ID, "user")
	newFile("file-peer", peer.ID, "user")
	// The attachment goes through the real upload flow so the signed download
	// can read actual bytes.
	attachment := []byte("attached-bytes")
	peerActor := files.Actor{ID: peer.ID, Realm: "user"}
	upload, err := manager.Files().Upload(ctx, peerActor, contracts.FileUploadInput{OriginalName: "attached.txt", MimeType: "text/plain", Size: len(attachment)})
	if err != nil {
		t.Fatal("attachment upload", err)
	}
	if err = manager.Files().Receive(ctx, peerActor, upload.FileID, bytes.NewReader(attachment), int64(len(attachment))); err != nil {
		t.Fatal("attachment receive", err)
	}
	if _, err = manager.Files().Complete(ctx, peerActor, upload.FileID); err != nil {
		t.Fatal("attachment complete", err)
	}
	newFile("file-admin", admin.ID, "administrator")
	// The member note rides on HTTP; the peer note is seeded with one
	// attachment so the attachment-bound signing path has a real relation.
	memberCookie, memberCSRF := session(false, member)
	if w := request("POST", "/api/v1/notes", contracts.NoteInput{Title: "member note", Body: "member body", Status: "open"}, memberCookie, memberCSRF); w.Code != 200 {
		t.Fatal("member note", w.Code, w.Body.String())
	}
	notesRepo := &notessql.Repository{Store: store}
	peerNote, err := notesRepo.Create(ctx, "user/"+peer.ID, contracts.NoteInput{Title: "peer note", Body: "peer body", Status: "open", AttachmentIds: &[]string{upload.FileID}})
	if err != nil {
		t.Fatal("peer note", err)
	}
	if w := request("POST", "/api/v1/admin/notes", contracts.NoteInput{Title: "administrator note", Body: "administrator-secret", Status: "open"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("administrator note", w.Code, w.Body.String())
	}
	// Widen the member to an all-scope role; assignment revokes earlier
	// sessions, so the cookie is re-issued afterwards.
	if w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "scope-all", "permissions": []string{"notes:access", "notes:update", "notes:delete", "files:access", "files:delete"}, "data_scope": "all"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var roles contracts.RoleListResponse
	if err := json.Unmarshal(request("GET", "/api/v1/admin/roles", nil, adminCookie, "").Body.Bytes(), &roles); err != nil {
		t.Fatal(err)
	}
	scopeAll := ""
	for _, item := range roles.Data.Items {
		if item.Name == "scope-all" {
			scopeAll = item.ID
		}
	}
	if scopeAll == "" {
		t.Fatal("scope-all role missing")
	}
	if w := request("PATCH", "/api/v1/admin/users/"+member.ID, contracts.UserUpdate{Role: rolePtr(scopeAll), Status: "active"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role assign", w.Code, w.Body.String())
	}
	memberCookie, memberCSRF = session(false, member)

	var noteList contracts.NoteListResponse
	if err := json.Unmarshal(request("GET", "/api/v1/notes", nil, memberCookie, "").Body.Bytes(), &noteList); err != nil || noteList.Code != "OK" {
		t.Fatal("notes list", noteList.Code, err)
	}
	if len(noteList.Data.Items) != 3 {
		t.Fatal("all scope must show both user-realm notes only", len(noteList.Data.Items))
	}
	for _, item := range noteList.Data.Items {
		own := item.Title == "member note"
		if own != (item.Capabilities.Update && item.Capabilities.Delete) {
			t.Fatal("note capabilities must follow ownership", item.Title, item.Capabilities)
		}
	}
	var fileList contracts.FileListResponse
	if err := json.Unmarshal(request("GET", "/api/v1/files", nil, memberCookie, "").Body.Bytes(), &fileList); err != nil || fileList.Code != "OK" {
		t.Fatal("files list", fileList.Code, err)
	}
	filesSeen := map[string]contracts.FileCapabilities{}
	for _, item := range fileList.Data.Items {
		filesSeen[item.FileID] = item.Capabilities
	}
	if _, ok := filesSeen["file-admin"]; ok {
		t.Fatal("administrator realm file leaked into user list")
	}
	if !filesSeen["file-peer"].Download || filesSeen["file-peer"].Delete {
		t.Fatal("scoped peer file must be downloadable but not deletable", filesSeen["file-peer"])
	}
	if !filesSeen["file-member"].Download || !filesSeen["file-member"].Delete {
		t.Fatal("own file capabilities", filesSeen["file-member"])
	}
	sign := func(path string) *httptest.ResponseRecorder {
		t.Helper()
		return request("POST", path, map[string]any{}, memberCookie, memberCSRF)
	}
	// Fresh scope revalidation: the widened member may sign the peer file and
	// the attachment of the readable peer note.
	if w := sign("/api/v1/files/file-peer/access"); w.Code != 200 {
		t.Fatal("peer file access", w.Code, w.Body.String())
	}
	var access contracts.FileAccessResponse
	if err := json.Unmarshal(sign("/api/v1/files/"+upload.FileID+"/access?note_id="+peerNote.ID).Body.Bytes(), &access); err != nil || access.Code != "OK" {
		t.Fatal("attachment access", access.Code, err)
	}
	download := request("GET", access.Data.Url, nil, memberCookie, "")
	if download.Code != 200 || download.Body.String() != "attached-bytes" {
		t.Fatal("signed attachment download", download.Code, download.Body.String())
	}
	// The attachment path never opens unrelated files: the file must belong to
	// the referenced readable note, and administrator rows stay unreachable.
	if w := sign("/api/v1/files/file-peer/access?note_id=" + peerNote.ID); w.Code != 404 {
		t.Fatal("unrelated attachment accepted", w.Code, w.Body.String())
	}
	if w := sign("/api/v1/files/file-admin/access"); w.Code != 404 {
		t.Fatal("cross-realm file access accepted", w.Code, w.Body.String())
	}
	// Narrowing the role back to self restores personal visibility on the
	// next request without reusing the widened grant.
	if w := request("PATCH", "/api/v1/admin/users/"+member.ID, contracts.UserUpdate{Role: rolePtr("user"), Status: "active"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role narrow", w.Code, w.Body.String())
	}
	memberCookie, memberCSRF = session(false, member)
	if err := json.Unmarshal(request("GET", "/api/v1/notes", nil, memberCookie, "").Body.Bytes(), &noteList); err != nil {
		t.Fatal(err)
	}
	if len(noteList.Data.Items) != 1 || noteList.Data.Items[0].Title != "member note" {
		t.Fatal("narrowed scope still lists peer rows", noteList.Data)
	}
	if w := sign("/api/v1/files/file-peer/access"); w.Code != 404 {
		t.Fatal("narrowed scope still signs peer file", w.Code, w.Body.String())
	}
}
