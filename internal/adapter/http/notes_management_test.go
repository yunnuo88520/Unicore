//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
package httpadapter

import (
	"net/http"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestNoteManagementSeparatesPersonalViewAndDelegation(t *testing.T) {
	f := newTokenHTTP(t)
	createNote := func(raw, title string) contracts.NoteEntry {
		return tokenData[contracts.NoteEntry](t, f.request(http.MethodPost, "/notes", contracts.NoteInput{Title: title, Body: "Private body", Status: "open"}, "", raw, true), 200)
	}
	createNote(f.adminRaw, "Admin private")
	memberNote := createNote(f.userRaw, "Member private")
	const memberName = "Note author nickname"
	tokenData[contracts.AccountProfile](t, f.request(http.MethodPatch, "/account/profile", contracts.ProfileInput{DisplayName: memberName}, "", f.userRaw, true), 200)
	path := "/admin/notes/management"
	for _, item := range []struct {
		raw    string
		status int
	}{{"", 401}, {f.userRaw, 403}} {
		if w := f.request(http.MethodGet, path, nil, "", item.raw, false); w.Code != item.status {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if w := f.request(http.MethodGet, "/notes?view=mine", nil, "", f.adminRaw, false); w.Code != 200 || !strings.Contains(w.Body.String(), "Admin private") || strings.Contains(w.Body.String(), "Member private") {
		t.Fatal("personal view", w.Code, w.Body.String())
	}
	check := func(raw, query string, count int) []contracts.NoteManagementEntry {
		t.Helper()
		w := f.request(http.MethodGet, path+query, nil, "", raw, false)
		data := tokenData[contracts.NoteManagementList](t, w, 200)
		if data.Total != count || len(data.Items) != count || strings.Contains(w.Body.String(), `"body"`) ||
			strings.Contains(w.Body.String(), "Private body") || strings.Contains(w.Body.String(), "attachment_ids") || strings.Contains(w.Body.String(), f.user.Email) {
			t.Fatal(w.Code, w.Body.String())
		}
		return data.Items
	}
	check(f.adminRaw, "", 2)
	for _, query := range []string{"?owner_id=" + f.user.ID + "&status=open", "?search=author+nickname", "?search=Member+private", "?search=" + f.user.Username} {
		row := check(f.adminRaw, query, 1)[0]
		if row.OwnerName != memberName || row.OwnerUsername != f.user.Username || row.Title != memberNote.Title || !row.CanUpdate || !row.CanDelete || !row.CanPreview || !row.CanEdit {
			t.Fatal("wrong management projection", row)
		}
	}
	role, err := f.identity.Store.CreateRole(t.Context(), contracts.RoleSaveInput{
		Name: "Note operator", Permissions: []string{"notes:manage:read"}, OperationIds: &[]string{"listNoteManagement"},
	}, f.admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	operator, err := f.identity.Create(t.Context(), contracts.UserCreate{Username: "noteoperator", Email: "noteoperator@example.test", Password: "fixture-password-strong", RoleIds: &[]string{"user", role.ID}}, f.admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, raw, err := f.identity.Issue(t.Context(), operator, 24)
	if err != nil {
		t.Fatal(err)
	}
	operatorNote := createNote(raw, "Operator private")
	row := check(raw, "", 1)[0]
	if row.OwnerID != operator.ID || row.OwnerName != operator.Username || row.CanUpdate || row.CanDelete || row.CanPreview || row.CanEdit {
		t.Fatal("wrong read-only projection", row)
	}
	check(raw, "?owner_id="+f.user.ID, 0)
	if w := f.request(http.MethodGet, "/admin/notes", nil, "", raw, false); w.Code != 403 {
		t.Fatal("management must not grant the legacy content API", w.Code, w.Body.String())
	}
	memberPath := path + "/" + f.user.ID + "/" + memberNote.ID
	operatorPath := path + "/" + operator.ID + "/" + operatorNote.ID
	tokenData[any](t, f.request(http.MethodGet, memberPath, nil, "", "", false), 401)
	tokenData[any](t, f.request(http.MethodGet, memberPath, nil, "", f.userRaw, false), 403)
	tokenData[any](t, f.request(http.MethodGet, operatorPath, nil, "", raw, false), 403)
	preview := f.request(http.MethodGet, memberPath, nil, "", f.adminRaw, false)
	detail := tokenData[contracts.ManagedNoteDetail](t, preview, 200)
	if detail.Body != "Private body" || detail.Version != memberNote.Version || strings.Contains(preview.Body.String(), "attachment_ids") || preview.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("wrong detail projection", preview.Body.String())
	}
	status := contracts.NoteManagementStatusInput{Status: "done", Version: memberNote.Version}
	version := contracts.NoteVersion{Version: memberNote.Version}
	for _, test := range []struct {
		method, target, cookie string
		body                   any
		csrf                   bool
		want                   int
	}{
		{http.MethodPatch, memberPath, "", status, false, 401},
		{http.MethodPatch, memberPath, f.userRaw, status, true, 403},
		{http.MethodPatch, memberPath, f.adminRaw, status, false, 403},
		{http.MethodPatch, operatorPath, raw, status, true, 403},
		{http.MethodDelete, memberPath, raw, version, true, 403},
		{http.MethodPatch, path + "/" + f.admin.ID + "/" + memberNote.ID, f.adminRaw, status, true, 404},
		{http.MethodPatch, memberPath, f.adminRaw, status, true, 200},
		{http.MethodPatch, memberPath, f.adminRaw, status, true, 409},
		{http.MethodDelete, memberPath, f.adminRaw, version, true, 409},
	} {
		tokenData[contracts.ActionResult](t, f.request(test.method, test.target, test.body, "", test.cookie, test.csrf), test.want)
	}
	personal := func() []contracts.NoteEntry {
		return tokenData[contracts.NoteList](t, f.request(http.MethodGet, "/notes?view=mine", nil, "", f.userRaw, false), 200).Items
	}
	if rows := personal(); len(rows) != 1 || rows[0].Status != "done" || rows[0].Body != "Private body" || rows[0].Version != memberNote.Version+1 {
		t.Fatal("personal note after management update", rows)
	}
	edit := contracts.ManagedNoteEditInput{Title: "  Edited title  ", Body: "Edited body", Version: memberNote.Version + 1}
	tokenData[any](t, f.request(http.MethodPut, operatorPath, edit, "", raw, true), 403)
	tokenData[any](t, f.request(http.MethodPut, memberPath, edit, "", f.adminRaw, false), 403)
	tokenData[contracts.ActionResult](t, f.request(http.MethodPut, memberPath, edit, "", f.adminRaw, true), 200)
	tokenData[any](t, f.request(http.MethodPut, memberPath, edit, "", f.adminRaw, true), 409)
	if rows := personal(); len(rows) != 1 || rows[0].Title != "Edited title" || rows[0].Body != "Edited body" || rows[0].Status != "done" || rows[0].Version != memberNote.Version+2 {
		t.Fatal("personal note after content edit", rows)
	}
	tokenData[contracts.ActionResult](t, f.request(http.MethodDelete, memberPath, contracts.NoteVersion{Version: memberNote.Version + 2}, "", f.adminRaw, true), 200)
	tokenData[any](t, f.request(http.MethodGet, memberPath, nil, "", f.adminRaw, false), 404)
	if rows := personal(); len(rows) != 0 {
		t.Fatal("deleted note remains in personal list", rows)
	}
	check(f.adminRaw, "", 2)
	store, _, _, _ := f.manager.Services()
	var deletedAt int
	if err := store.Row(t.Context(), store.DB, "SELECT deleted_at FROM unicore_example_notes WHERE scope_key=? AND id=?", "user/"+f.user.ID, memberNote.ID).Scan(&deletedAt); err != nil || deletedAt == 0 {
		t.Fatalf("management did not retain the note tombstone: deleted_at=%d error=%v", deletedAt, err)
	}
}

func TestNoteManagementContentScopeAndTokenRole(t *testing.T) {
	f := newTokenHTTP(t)
	ctx := t.Context()
	self, all := platform.ScopeSelf, platform.ScopeAll
	role := func(name string, scope *string, points, operations []string) contracts.Role {
		t.Helper()
		role, err := f.identity.Store.CreateRole(ctx, contracts.RoleSaveInput{Name: name, Permissions: points, OperationIds: &operations, DataScope: scope}, f.admin.ID)
		if err != nil {
			t.Fatal(err)
		}
		return role
	}
	preview := role("Own note content", &self, []string{"notes:manage:read", "notes:manage:preview", "notes:manage:edit"}, []string{"listNoteManagement", "previewManagedNote", "editManagedNote"})
	wideRead := role("Global note list", &all, []string{"notes:manage:read"}, []string{"listNoteManagement"})
	roles := []string{"user", preview.ID, wideRead.ID}
	actor, err := f.identity.Create(ctx, contracts.UserCreate{Username: "notereviewer", Email: "notereviewer@example.test", Password: "fixture-password-strong", RoleIds: &roles}, f.admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, cookie, err := f.identity.Issue(ctx, actor, 24)
	if err != nil {
		t.Fatal(err)
	}
	add := func(raw, title string) contracts.NoteEntry {
		return tokenData[contracts.NoteEntry](t, f.request(http.MethodPost, "/notes", contracts.NoteInput{Title: title, Body: "Scoped content", Status: "open"}, "", raw, true), 200)
	}
	own, foreign := add(cookie, "Own note"), add(f.userRaw, "Another note")
	path := "/admin/notes/management"
	rows := tokenData[contracts.NoteManagementList](t, f.request(http.MethodGet, path, nil, "", cookie, false), 200)
	if rows.Total != 2 {
		t.Fatal(rows)
	}
	for _, row := range rows.Items {
		if own := row.OwnerID == actor.ID; row.CanPreview != own || row.CanEdit != own {
			t.Fatal("incorrect content visibility", row)
		}
	}
	ownPath, foreignPath := path+"/"+actor.ID+"/"+own.ID, path+"/"+f.user.ID+"/"+foreign.ID
	tokenData[contracts.ManagedNoteDetail](t, f.request(http.MethodGet, ownPath, nil, "", cookie, false), 200)
	tokenData[any](t, f.request(http.MethodGet, foreignPath, nil, "", cookie, false), 404)
	input := contracts.ManagedNoteEditInput{Title: "Edited", Body: "Edited content", Version: own.Version}
	tokenData[any](t, f.request(http.MethodPut, foreignPath, input, "", cookie, true), 404)
	tokenData[contracts.ActionResult](t, f.request(http.MethodPut, ownPath, input, "", cookie, true), 200)
	pat := tokenData[contracts.PersonalTokenCreated](t, f.request(http.MethodPost, "/account/tokens", contracts.PersonalTokenInput{Name: "List only", RoleID: wideRead.ID, ExpiresInDays: 7}, "", cookie, true), 200)
	tokenData[any](t, f.request(http.MethodGet, ownPath, nil, pat.Token, "", false), 403)
	tokenData[any](t, f.request(http.MethodPut, ownPath, input, pat.Token, "", false), 403)
}
