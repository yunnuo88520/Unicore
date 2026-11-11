// Author: yunnuo <ymz@ebox.vip>
// Description: Legacy role-row self-heal: complete grants with missing permission points resolve a working member session.
package httpadapter

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/contracts"
)

// TestLegacyRoleRowSelfHealsAtSessionResolution reproduces role rows saved by
// the legacy tab editor: unicore_role_permissions is empty (or missing the
// implied points) while the menu, action and operation grant rows are
// complete. Session resolution must union the stored points with the points
// derived from the grants, so the member can publish notes without a
// re-save; APIs outside the grants stay forbidden.
func TestLegacyRoleRowSelfHealsAtSessionResolution(t *testing.T) {
	manager, request := actionRouter(t)
	actionInstall(t, request)
	store, _, identity, _ := manager.Services()

	// The old-editor row shape: grant rows complete, permission points absent.
	// One operation reference is deliberately unknown to prove invalid grant
	// references are ignored instead of poisoning the session.
	for _, statement := range []string{
		"INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES('legacy-role','旧版运营','user','self')",
		"INSERT INTO unicore_role_authorizations(role_id,initialized) VALUES('legacy-role',1)",
		"INSERT INTO unicore_role_menus(role_id,menu_id) VALUES('legacy-role','overview'),('legacy-role','notes')",
		"INSERT INTO unicore_role_actions(role_id,action_id) VALUES('legacy-role','op:listNotes'),('legacy-role','op:createNote')",
		"INSERT INTO unicore_role_operations(role_id,operation_id) VALUES('legacy-role','listNotes'),('legacy-role','createNote'),('legacy-role','vanishedOperation')",
	} {
		if _, err := store.DB.Exec(statement); err != nil {
			t.Fatal("legacy row", statement, err)
		}
	}

	member, err := identity.Create(t.Context(), contracts.UserCreate{Username: "legacy-member", Email: "legacy@example.test", Password: "test-password-strong", RoleIds: &[]string{"legacy-role"}}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	// The created account already carries the derived union: the stored rows
	// hold no notes points at all, so both can only come from derivation.
	for _, point := range []string{"notes:access", "notes:create"} {
		if !slices.Contains(member.Permissions, point) {
			t.Fatal("derived point missing on create", point, member.Permissions)
		}
	}
	for _, absent := range []string{"notes:delete", "users:read", "admin:access"} {
		if slices.Contains(member.Permissions, absent) {
			t.Fatal("derivation over-granted", absent, member.Permissions)
		}
	}

	memberCookie, memberCSRF := issueSession(t, manager, false, member)
	w := request("GET", "/api/v1/bootstrap", nil, memberCookie, "")
	if w.Code != 200 {
		t.Fatal("member bootstrap", w.Code, w.Body.String())
	}
	var boot contracts.BootstrapResponse
	if err := json.Unmarshal(w.Body.Bytes(), &boot); err != nil {
		t.Fatal(err)
	}
	user := boot.Data.CurrentUser
	if !slices.Contains(user.Roles, "legacy-role") {
		t.Fatal("legacy role not on session", user.Roles)
	}
	for _, point := range []string{"notes:access", "notes:create"} {
		if !slices.Contains(user.Permissions, point) {
			t.Fatal("session permissions missing derived point", point, user.Permissions)
		}
	}
	if slices.Contains(user.Permissions, "notes:delete") {
		t.Fatal("session derived an ungranted point", user.Permissions)
	}

	// The granted publish path goes through the real policy middleware.
	w = request("POST", "/api/v1/notes", contracts.NoteInput{Title: "旧角色也能发", Body: "自愈后的第一篇", Status: "open", AttachmentIds: &[]string{}}, memberCookie, memberCSRF)
	if w.Code != 200 {
		t.Fatal("legacy member publish refused", w.Code, w.Body.String())
	}
	var note contracts.NoteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &note); err != nil || note.Data.ID == "" {
		t.Fatal("note payload", w.Body.String(), err)
	}

	// Controls: an ungranted write on the same resource and the management
	// surface both stay forbidden — derivation never widened the boundary.
	if w = request("PUT", "/api/v1/notes/"+note.Data.ID, contracts.NoteUpdate{Title: "改", Body: "内容", Status: "open"}, memberCookie, memberCSRF); w.Code != 403 {
		t.Fatal("ungranted note update accepted", w.Code, w.Body.String())
	}
	if w = request("GET", "/api/v1/admin/users", nil, memberCookie, ""); w.Code != 401 && w.Code != 403 {
		t.Fatal("management surface reached by member", w.Code, w.Body.String())
	}
}

// TestLegacyTreeBackfillRestoresButtons reproduces the deployed legacy shape
// that outlived several editor generations: the persisted tree was seeded
// before the notes buttons were registered, so it carries no op:*Note action
// nodes at all, and the role rows hold the menu and operation grants with the
// permission points but no action rows — the legacy tab editor dropped those
// whenever the stored points did not cover them. The API grants pass the
// policy middleware, yet canAction can never render the button: the tree has
// no action node and the session has no action id. A restart-equivalent
// EnsureNavigation backfills the registered action nodes, session resolution
// derives the button ids from the operation grants, and the member publishes.
func TestLegacyTreeBackfillRestoresButtons(t *testing.T) {
	manager, request := actionRouter(t)
	actionInstall(t, request)
	store, _, identity, _ := manager.Services()
	repo, ok := identity.Store.(*platformsql.Repository)
	if !ok {
		t.Fatal("platform identity store is not the sql repository")
	}

	// The legacy tree: every notes button the current build registers is
	// missing (both workspaces), like a tree seeded by an older release.
	for _, id := range []string{"op:listNotes", "op:createNote", "op:updateNote", "op:deleteNote", "op:adminListNotes", "op:adminCreateNote", "op:adminUpdateNote", "op:adminDeleteNote"} {
		if _, err := store.DB.Exec("DELETE FROM unicore_navigation_nodes WHERE id=?", id); err != nil {
			t.Fatal("drop action node", id, err)
		}
	}
	// The legacy role rows: menus and operations granted, permission points
	// present, action rows absent. One unknown operation reference proves the
	// derivation ignores what the catalogue refuses.
	for _, statement := range []string{
		"INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES('legacy-op','旧版运营','user','self')",
		"INSERT INTO unicore_role_authorizations(role_id,initialized) VALUES('legacy-op',1)",
		"INSERT INTO unicore_role_menus(role_id,menu_id) VALUES('legacy-op','overview'),('legacy-op','notes')",
		"INSERT INTO unicore_role_permissions(role_id,permission_id) VALUES('legacy-op','notes:access'),('legacy-op','notes:create')",
		"INSERT INTO unicore_role_operations(role_id,operation_id) VALUES('legacy-op','listNotes'),('legacy-op','createNote'),('legacy-op','vanishedOperation')",
	} {
		if _, err := store.DB.Exec(statement); err != nil {
			t.Fatal("legacy row", statement, err)
		}
	}

	// A restart runs the same EnsureNavigation: the backfill re-adds the
	// registered action nodes onto the persisted pages.
	if err := repo.EnsureNavigation(t.Context()); err != nil {
		t.Fatal("ensure navigation", err)
	}
	listed, err := repo.ListMenuConfig(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	nodes := map[string]contracts.NavigationNode{}
	for _, node := range listed.Nodes {
		nodes[node.ID] = node
	}
	for _, id := range []string{"op:listNotes", "op:createNote", "op:adminCreateNote"} {
		node, ok := nodes[id]
		if !ok || node.Type != "action" || node.ParentID == nil || *node.ParentID != "notes" {
			t.Fatal("backfilled action node", id, node)
		}
	}
	// A second pass is a no-op: the tree already carries every registered
	// action, so the version stops moving.
	version := listed.Version
	if err = repo.EnsureNavigation(t.Context()); err != nil {
		t.Fatal(err)
	}
	if again, err := repo.ListMenuConfig(t.Context()); err != nil || again.Version != version {
		t.Fatal("backfill not idempotent", version, again.Version, err)
	}

	member, err := identity.Create(t.Context(), contracts.UserCreate{Username: "legacy-op-member", Email: "legacy-op@example.test", Password: "test-password-strong", RoleIds: &[]string{"legacy-op"}}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	if member.ActionIds == nil || !slices.Contains(*member.ActionIds, "op:createNote") {
		t.Fatal("session action id not derived from the operation grant", member.ActionIds)
	}
	if slices.Contains(*member.ActionIds, "op:updateNote") {
		t.Fatal("derivation over-granted an ungranted operation button", *member.ActionIds)
	}

	memberCookie, memberCSRF := issueSession(t, manager, false, member)
	w := request("GET", "/api/v1/bootstrap", nil, memberCookie, "")
	if w.Code != 200 {
		t.Fatal("member bootstrap", w.Code, w.Body.String())
	}
	var boot contracts.BootstrapResponse
	if err = json.Unmarshal(w.Body.Bytes(), &boot); err != nil {
		t.Fatal(err)
	}
	nodeIDs := map[string]bool{}
	for _, node := range boot.Data.Navigation.Nodes {
		nodeIDs[node.ID] = true
	}
	if !nodeIDs["notes"] || !nodeIDs["op:createNote"] {
		t.Fatal("member navigation missing the notes page or its create button")
	}
	user := boot.Data.CurrentUser
	if user.ActionIds == nil || !slices.Contains(*user.ActionIds, "op:createNote") {
		t.Fatal("bootstrap action id not derived", user.ActionIds)
	}

	// The publish path the member UI drives end to end.
	w = request("POST", "/api/v1/notes", contracts.NoteInput{Title: "回填后第一篇", Body: "按钮回来了", Status: "open", AttachmentIds: &[]string{}}, memberCookie, memberCSRF)
	if w.Code != 200 {
		t.Fatal("legacy member publish refused", w.Code, w.Body.String())
	}
	var note contracts.NoteResponse
	if err = json.Unmarshal(w.Body.Bytes(), &note); err != nil || note.Data.ID == "" {
		t.Fatal("note payload", w.Body.String(), err)
	}
	// The ungranted operations stay forbidden, button or not.
	if w = request("PUT", "/api/v1/notes/"+note.Data.ID, contracts.NoteUpdate{Title: "改", Body: "内容", Status: "open"}, memberCookie, memberCSRF); w.Code != 403 {
		t.Fatal("ungranted note update accepted", w.Code, w.Body.String())
	}
}
