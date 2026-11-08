// Author: yunnuo <ymz@ebox.vip>
// Description: Button-level grants: note/file write operations 403 without their action points, restricted administrators reach the instance file list.
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
	"github.com/yunnuo/unicore/internal/module"
	notesmodule "github.com/yunnuo/unicore/internal/modules/notes"
	"github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
	"github.com/yunnuo/unicore/internal/runtime"
)

func init() { module.Register(notesmodule.Module) }

// actionRouter boots an installed web-platform instance with the shared request helper.
func actionRouter(t *testing.T) (*install.Manager, func(string, string, any, *http.Cookie, string) *httptest.ResponseRecorder) {
	t.Helper()
	ctx := t.Context()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = manager.Close() })
	tokenBytes, _ := os.ReadFile(manager.TokenPath())
	router := New(Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "development"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}, "admin.html": {Data: []byte("admin")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path string, input any, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
		t.Helper()
		raw, _ := json.Marshal(input)
		r := httptest.NewRequest(method, "http://localhost"+path, bytes.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Bootstrap-Token", strings.TrimSpace(string(tokenBytes)))
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
	return manager, request
}

func actionInstall(t *testing.T, request func(string, string, any, *http.Cookie, string) *httptest.ResponseRecorder) (adminCookie *http.Cookie, adminCSRF string) {
	t.Helper()
	input := contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Actions", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"}
	w := request("POST", "/api/v1/install/complete", input, nil, "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	adminCookie = w.Result().Cookies()[0]
	var boot contracts.BootstrapResponse
	if err := json.Unmarshal(request("GET", "/api/v1/admin/bootstrap", nil, adminCookie, "").Body.Bytes(), &boot); err != nil {
		t.Fatal(err)
	}
	return adminCookie, *boot.Data.CsrfToken
}

// issueSession mints a fresh cookie for a user/administrator; grants are baked
// into sessions, so callers re-issue after every role change.
func issueSession(t *testing.T, manager *install.Manager, administrator bool, user contracts.User) (*http.Cookie, string) {
	t.Helper()
	session, raw, err := manager.Identity(administrator).Issue(t.Context(), user, 1)
	if err != nil {
		t.Fatal(err)
	}
	name := sessionCookie
	if administrator {
		name = administratorSessionCookie
	}
	return &http.Cookie{Name: name, Value: raw}, session.CsrfToken
}

func TestButtonLevelPermissions(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	_, _, identity, _ := manager.Services()

	// A member whose role can read notes but create, edit or delete nothing;
	// file browsing without upload or delete.
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "笔记读者", "permissions": []string{"notes:access", "files:access"}}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	readerRole := created.Data.ID
	member, err := identity.Create(t.Context(), contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	if w := request("PATCH", "/api/v1/admin/users/"+member.ID, contracts.UserUpdate{Role: rolePtr(readerRole), Status: "active"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role assignment", w.Code, w.Body.String())
	}
	memberCookie, memberCSRF := issueSession(t, manager, false, member)

	// Read gates stay open, every write action without its point is refused.
	if w := request("GET", "/api/v1/notes", nil, memberCookie, ""); w.Code != 200 {
		t.Fatal("notes read refused", w.Code, w.Body.String())
	}
	if w := request("GET", "/api/v1/files", nil, memberCookie, ""); w.Code == 401 || w.Code == 403 {
		t.Fatal("files read refused", w.Code, w.Body.String())
	}
	forbidden := []struct {
		method, path string
		input        any
	}{
		{"POST", "/api/v1/notes", contracts.NoteInput{Title: "新笔记", Body: "内容", Status: "open"}},
		{"PUT", "/api/v1/notes/missing", contracts.NoteUpdate{Title: "改", Body: "内容", Status: "open"}},
		{"DELETE", "/api/v1/notes/missing", contracts.NoteVersion{Version: 1}},
		{"POST", "/api/v1/files/multipart", contracts.MultipartUploadInput{OriginalName: "a.txt", MimeType: "text/plain", Size: 3, Fingerprint: "f"}},
		{"DELETE", "/api/v1/files/missing", map[string]any{}},
	}
	for _, spec := range forbidden {
		w := request(spec.method, spec.path, spec.input, memberCookie, memberCSRF)
		if w.Code != 403 {
			t.Fatal("action without grant accepted", spec.method, spec.path, w.Code, w.Body.String())
		}
		var response contracts.ErrorResponse
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || response.Code != "PERMISSION_DENIED" {
			t.Fatal("expected PERMISSION_DENIED", spec.path, w.Body.String(), err)
		}
	}

	// Granting notes:create on the role reopens creation only; update and
	// delete stay gated by their own points.
	if w := request("PUT", "/api/v1/admin/roles/"+readerRole, map[string]any{"name": "笔记读者", "permissions": []string{"notes:access", "notes:create", "files:access"}}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role update", w.Code, w.Body.String())
	}
	memberCookie, memberCSRF = issueSession(t, manager, false, member)
	w = request("POST", "/api/v1/notes", contracts.NoteInput{Title: "新笔记", Body: "内容", Status: "open", AttachmentIds: &[]string{}}, memberCookie, memberCSRF)
	if w.Code != 200 {
		t.Fatal("notes:create grant not honoured", w.Code, w.Body.String())
	}
	var note contracts.NoteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &note); err != nil || note.Data.ID == "" {
		t.Fatal("note payload", w.Body.String(), err)
	}
	if w = request("PUT", "/api/v1/notes/"+note.Data.ID, contracts.NoteUpdate{Title: "改", Body: "内容", Status: "done"}, memberCookie, memberCSRF); w.Code != 403 {
		t.Fatal("notes:update accepted without grant", w.Code, w.Body.String())
	}
	if w = request("DELETE", "/api/v1/notes/"+note.Data.ID, contracts.NoteVersion{Version: 1}, memberCookie, memberCSRF); w.Code != 403 {
		t.Fatal("notes:delete accepted without grant", w.Code, w.Body.String())
	}
}

// adminUser returns the installed super_admin account for actor parameters.
func adminUser(t *testing.T, manager *install.Manager) contracts.User {
	t.Helper()
	admin, err := manager.Identity(true).Store.FindAccount(t.Context(), "admin")
	if err != nil || admin.User.ID == "" {
		t.Fatal("admin account missing", err)
	}
	return admin.User
}

func TestRestrictedAdministratorFiles(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	adminIdentity := manager.Identity(true)
	_, _, identity, _ := manager.Services()

	// One ready user file exists in the instance.
	member, err := identity.Create(t.Context(), contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	data := []byte("instance bytes")
	if w := request("POST", "/api/v1/files/uploads", contracts.FileUploadInput{OriginalName: "member.txt", MimeType: "text/plain", Size: len(data)}, nil, ""); w.Code != 401 {
		t.Fatal("anonymous upload gate", w.Code, w.Body.String())
	}
	service := manager.Files()
	if service == nil {
		t.Fatal("file service missing")
	}
	grant, err := service.Upload(t.Context(), files.Actor{ID: member.ID, Realm: "user"}, contracts.FileUploadInput{OriginalName: "member.txt", MimeType: "text/plain", Size: len(data)})
	if err != nil {
		t.Fatal(err)
	}
	if err = service.Receive(t.Context(), files.Actor{ID: member.ID, Realm: "user"}, grant.FileID, bytes.NewReader(data), int64(len(data))); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Complete(t.Context(), files.Actor{ID: member.ID, Realm: "user"}, grant.FileID); err != nil {
		t.Fatal(err)
	}

	// A restricted administrator with storage:read lists instance files; the
	// super_admin-retained write operations stay refused.
	restrictedRole := actionRole(t, request, adminCookie, adminCSRF, "文件运营", "administrator", []string{"storage:read"})
	restricted, err := adminIdentity.Create(t.Context(), contracts.UserCreate{Username: "filereader", Email: "filereader@example.test", Password: "test-password-strong", Role: restrictedRole}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	restrictedCookie, restrictedCSRF := issueSession(t, manager, true, restricted)
	w := request("GET", "/api/v1/admin/files", nil, restrictedCookie, "")
	if w.Code != 200 {
		t.Fatal("restricted file list", w.Code, w.Body.String())
	}
	var list contracts.FileListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || list.Data.Total != 1 || len(list.Data.Items) != 1 || list.Data.Items[0].FileID != grant.FileID {
		t.Fatal("instance file list not visible to storage:read", w.Body.String(), err)
	}
	if w = request("DELETE", "/api/v1/admin/files/"+grant.FileID, map[string]any{}, restrictedCookie, restrictedCSRF); w.Code != 403 {
		t.Fatal("retained storage:write accepted", w.Code, w.Body.String())
	}
	if w = request("GET", "/api/v1/admin/files/export.xlsx", nil, restrictedCookie, ""); w.Code != 200 {
		t.Fatal("storage:read export", w.Code, w.Body.String())
	}

	// Without storage:read the same realm stays out of the file surface.
	bareRole := actionRole(t, request, adminCookie, adminCSRF, "无文件", "administrator", []string{})
	bare, err := adminIdentity.Create(t.Context(), contracts.UserCreate{Username: "bareadmin", Email: "bareadmin@example.test", Password: "test-password-strong", Role: bareRole}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	bareCookie, _ := issueSession(t, manager, true, bare)
	if w = request("GET", "/api/v1/admin/files", nil, bareCookie, ""); w.Code != 403 {
		t.Fatal("ungranted file list", w.Code, w.Body.String())
	}
}

// actionRole creates a role and returns its generated id.
func actionRole(t *testing.T, request func(string, string, any, *http.Cookie, string) *httptest.ResponseRecorder, adminCookie *http.Cookie, csrf, name, realm string, permissions []string) string {
	t.Helper()
	body := map[string]any{"name": name, "permissions": permissions}
	if realm != "" {
		body["realm"] = realm
	}
	w := request("POST", "/api/v1/admin/roles", body, adminCookie, csrf)
	if w.Code != 200 {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	return created.Data.ID
}

// TestAnyModeAttachmentAccess proves the permissionMode=any contract on the
// file access issuance: a notes-only role signs an attached file through its
// readable note, while plain signing stays gated by files:access.
func TestAnyModeAttachmentAccess(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	_, _, identity, _ := manager.Services()

	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "笔记员", "permissions": []string{"notes:access"}}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	member, err := identity.Create(t.Context(), contracts.UserCreate{Username: "notewriter", Email: "notewriter@example.test", Password: "test-password-strong", Role: "user"}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	if w := request("PATCH", "/api/v1/admin/users/"+member.ID, contracts.UserUpdate{Role: rolePtr(created.Data.ID), Status: "active"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("role assignment", w.Code, w.Body.String())
	}

	// A user file attached to the member's own note.
	service := manager.Files()
	grant, err := service.Upload(t.Context(), files.Actor{ID: member.ID, Realm: "user"}, contracts.FileUploadInput{OriginalName: "note.txt", MimeType: "text/plain", Size: 5})
	if err != nil {
		t.Fatal(err)
	}
	if err = service.Receive(t.Context(), files.Actor{ID: member.ID, Realm: "user"}, grant.FileID, strings.NewReader("bytes"), 5); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Complete(t.Context(), files.Actor{ID: member.ID, Realm: "user"}, grant.FileID); err != nil {
		t.Fatal(err)
	}
	store, _, _, _ := manager.Services()
	notesRepo := &notessql.Repository{Store: store}
	note, err := notesRepo.Create(t.Context(), "user/"+member.ID, contracts.NoteInput{Title: "附件笔记", Body: "body", Status: "open", AttachmentIds: &[]string{grant.FileID}})
	if err != nil {
		t.Fatal(err)
	}

	memberCookie, memberCSRF := issueSession(t, manager, false, member)
	// Plain signing is refused: the role holds no files:access.
	if w := request("POST", "/api/v1/files/"+grant.FileID+"/access", map[string]any{}, memberCookie, memberCSRF); w.Code != 403 {
		t.Fatal("plain access without files grant", w.Code, w.Body.String())
	}
	// Attachment signing rides on the notes grant through the any mode.
	if w := request("POST", "/api/v1/files/"+grant.FileID+"/access?note_id="+note.ID, map[string]any{}, memberCookie, memberCSRF); w.Code != 200 {
		t.Fatal("attachment access with notes grant", w.Code, w.Body.String())
	}
}

// TestRowCapabilitiesRespectActionGrants pins the E2E finding: storage returns
// ownership facts, the HTTP layer merges the session's explicit action points,
// so members without notes:update/notes:delete or files:delete never see an
// enabled control their grant would refuse.
func TestRowCapabilitiesRespectActionGrants(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	store, _, identity, _ := manager.Services()

	// One notes-only reader and one files-only browser, each owning one row.
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "只读员", "permissions": []string{"notes:access"}}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("notes role create", w.Code, w.Body.String())
	}
	var notesRole contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &notesRole); err != nil || notesRole.Data.ID == "" {
		t.Fatal("notes role payload", w.Body.String(), err)
	}
	w = request("POST", "/api/v1/admin/roles", map[string]any{"name": "浏览员", "permissions": []string{"files:access"}}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("files role create", w.Code, w.Body.String())
	}
	var filesRole contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &filesRole); err != nil || filesRole.Data.ID == "" {
		t.Fatal("files role payload", w.Body.String(), err)
	}

	noteOwner, err := identity.Create(t.Context(), contracts.UserCreate{Username: "noteowner", Email: "noteowner@example.test", Password: "test-password-strong", Role: "user"}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	fileOwner, err := identity.Create(t.Context(), contracts.UserCreate{Username: "fileowner", Email: "fileowner@example.test", Password: "test-password-strong", Role: "user"}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	if w = request("PATCH", "/api/v1/admin/users/"+noteOwner.ID, contracts.UserUpdate{Role: rolePtr(notesRole.Data.ID), Status: "active"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("notes role assignment", w.Code, w.Body.String())
	}
	if w = request("PATCH", "/api/v1/admin/users/"+fileOwner.ID, contracts.UserUpdate{Role: rolePtr(filesRole.Data.ID), Status: "active"}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("files role assignment", w.Code, w.Body.String())
	}

	notesRepo := &notessql.Repository{Store: store}
	if _, err = notesRepo.Create(t.Context(), "user/"+noteOwner.ID, contracts.NoteInput{Title: "我的笔记", Body: "body", Status: "open"}); err != nil {
		t.Fatal(err)
	}
	service := manager.Files()
	grant, err := service.Upload(t.Context(), files.Actor{ID: fileOwner.ID, Realm: "user"}, contracts.FileUploadInput{OriginalName: "row.txt", MimeType: "text/plain", Size: 4})
	if err != nil {
		t.Fatal(err)
	}
	if err = service.Receive(t.Context(), files.Actor{ID: fileOwner.ID, Realm: "user"}, grant.FileID, strings.NewReader("row!"), 4); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Complete(t.Context(), files.Actor{ID: fileOwner.ID, Realm: "user"}, grant.FileID); err != nil {
		t.Fatal(err)
	}

	// Without the action points the rows render read-only even when owned.
	noteCookie, _ := issueSession(t, manager, false, noteOwner)
	w = request("GET", "/api/v1/notes", nil, noteCookie, "")
	if w.Code != 200 {
		t.Fatal("notes list", w.Code, w.Body.String())
	}
	var notes contracts.NoteListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &notes); err != nil || len(notes.Data.Items) != 1 {
		t.Fatal("notes payload", w.Body.String(), err)
	}
	if notes.Data.Items[0].Capabilities.Update || notes.Data.Items[0].Capabilities.Delete {
		t.Fatal("notes buttons without action grants", notes.Data.Items[0].Capabilities)
	}
	fileCookie, _ := issueSession(t, manager, false, fileOwner)
	w = request("GET", "/api/v1/files", nil, fileCookie, "")
	if w.Code != 200 {
		t.Fatal("files list", w.Code, w.Body.String())
	}
	var files contracts.FileListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &files); err != nil || len(files.Data.Items) != 1 {
		t.Fatal("files payload", w.Body.String(), err)
	}
	if files.Data.Items[0].Capabilities.Delete {
		t.Fatal("delete button without files:delete", files.Data.Items[0].Capabilities)
	}

	// Granting the points reopens exactly those controls on the owned rows.
	if w = request("PUT", "/api/v1/admin/roles/"+notesRole.Data.ID, map[string]any{"name": "只读员", "permissions": []string{"notes:access", "notes:update"}}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("notes role update", w.Code, w.Body.String())
	}
	if w = request("PUT", "/api/v1/admin/roles/"+filesRole.Data.ID, map[string]any{"name": "浏览员", "permissions": []string{"files:access", "files:delete"}}, adminCookie, adminCSRF); w.Code != 200 {
		t.Fatal("files role update", w.Code, w.Body.String())
	}
	noteCookie, _ = issueSession(t, manager, false, noteOwner)
	fileCookie, _ = issueSession(t, manager, false, fileOwner)
	w = request("GET", "/api/v1/notes", nil, noteCookie, "")
	if err := json.Unmarshal(w.Body.Bytes(), &notes); err != nil || !notes.Data.Items[0].Capabilities.Update || notes.Data.Items[0].Capabilities.Delete {
		t.Fatal("notes:update grant not honoured", w.Body.String(), err)
	}
	w = request("GET", "/api/v1/files", nil, fileCookie, "")
	if err := json.Unmarshal(w.Body.Bytes(), &files); err != nil || !files.Data.Items[0].Capabilities.Delete {
		t.Fatal("files:delete grant not honoured", w.Body.String(), err)
	}
}
