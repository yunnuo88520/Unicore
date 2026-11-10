// Author: yunnuo <ymz@ebox.vip>
// Description: Role-editor payload regression: a member role granted the notes page, its buttons and API operations must publish notes.
package httpadapter

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
)

// TestRoleEditorNotesGrantPublishesNotes mirrors the role-editor save payload:
// the operator checks the notes page, the editor auto-follows its buttons and
// API operations and derives the implied permission points, so the saved role
// carries menu, action and operation grants plus the full notes point set.
// The member session must expose the derived union and the policy middleware
// must let POST /api/v1/notes through.
func TestRoleEditorNotesGrantPublishesNotes(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	_, _, identity, _ := manager.Services()

	// Exactly what role-editor.tsx submits for a checked notes page:
	// permissions are the derived points (route point + button points + every
	// checked operation's points), menus/actions/operations the auto-followed ids.
	payload := map[string]any{
		"name":          "运营",
		"realm":         "user",
		"data_scope":    "self",
		"permissions":   []string{"notes:access", "notes:create", "notes:update", "notes:delete"},
		"menu_ids":      []string{"notes"},
		"action_ids":    []string{"op:listNotes", "op:createNote", "op:updateNote", "op:deleteNote"},
		"operation_ids": []string{"listNotes", "createNote", "updateNote", "deleteNote"},
	}
	w := request("POST", "/api/v1/admin/roles", payload, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	roleID := created.Data.ID
	if !slices.Contains(created.Data.Permissions, "notes:create") {
		t.Fatal("saved role lost the implied create point", created.Data.Permissions)
	}
	if !slices.Contains(created.Data.OperationIds, "createNote") || !slices.Contains(created.Data.ActionIds, "op:createNote") {
		t.Fatal("saved role lost button or operation grants", created.Data.ActionIds, created.Data.OperationIds)
	}

	member, err := identity.Create(t.Context(), contracts.UserCreate{Username: "publisher", Email: "publisher@example.test", Password: "test-password-strong", RoleIds: &[]string{roleID}}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	memberCookie, memberCSRF := issueSession(t, manager, false, member)

	// The bootstrap session carries the effective union the member UI reads.
	w = request("GET", "/api/v1/bootstrap", nil, memberCookie, "")
	if w.Code != 200 {
		t.Fatal("member bootstrap", w.Code, w.Body.String())
	}
	var boot contracts.BootstrapResponse
	if err := json.Unmarshal(w.Body.Bytes(), &boot); err != nil {
		t.Fatal(err)
	}
	user := boot.Data.CurrentUser
	for _, point := range []string{"notes:access", "notes:create", "notes:update", "notes:delete"} {
		if !slices.Contains(user.Permissions, point) {
			t.Fatal("session permissions missing", point, user.Permissions)
		}
	}
	if user.OperationIds == nil || !slices.Contains(*user.OperationIds, "createNote") {
		t.Fatal("session operation grant missing createNote", user.OperationIds)
	}
	if user.ActionIds == nil || !slices.Contains(*user.ActionIds, "op:createNote") {
		t.Fatal("session action grant missing op:createNote", user.ActionIds)
	}
	// The notes page node and its create action must project into the member
	// navigation, or canAction hides the create button even with grants held.
	nodeIDs := map[string]bool{}
	for _, node := range boot.Data.Navigation.Nodes {
		nodeIDs[node.ID] = true
	}
	if !nodeIDs["notes"] || !nodeIDs["op:createNote"] {
		t.Fatal("member navigation missing notes page or create action")
	}

	// The policy middleware admits the member publish call.
	w = request("POST", "/api/v1/notes", contracts.NoteInput{Title: "第一篇", Body: "内容", Status: "open", AttachmentIds: &[]string{}}, memberCookie, memberCSRF)
	if w.Code != 200 {
		t.Fatal("member publish refused", w.Code, w.Body.String())
	}
	var note contracts.NoteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &note); err != nil || note.Data.ID == "" {
		t.Fatal("note payload", w.Body.String(), err)
	}
}
