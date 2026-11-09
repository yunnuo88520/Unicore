// Author: yunnuo <ymz@ebox.vip>
// Description: Versioned navigation saves, one-time legacy materialization and independent role grant boundaries.
package platformsql

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/module"
	notesmodule "github.com/yunnuo/unicore/internal/modules/notes"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/migrations/runner"
)

// navigationFixture prepares an installed sqlite instance with the bootstrap
// administrator and returns the repository plus the actor id.
func navigationFixture(t *testing.T, ctx context.Context) (*sqlstore.Store, *Repository, contracts.User) {
	t.Helper()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "navigation.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
		t.Fatal(err)
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,?)", "web-platform", "navigation-test", time.Now().Unix()); err != nil {
		t.Fatal(err)
	}
	hash, err := platform.HashPassword("test-password-strong")
	if err != nil {
		t.Fatal(err)
	}
	admins := &Repository{Store: store, Administrators: true}
	admin, err := admins.Seed(ctx, tx, contracts.UserCreate{Username: "admin", Email: "admin@example.test", Role: "super_admin"}, hash)
	if err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return store, &Repository{Store: store}, admin
}

func init() { module.Register(notesmodule.Module) }

func TestNavigationBootstrapAndSave(t *testing.T) {
	ctx := context.Background()
	store, repo, admin := navigationFixture(t, ctx)
	_ = store

	listed, err := repo.ListMenuConfig(ctx)
	if err != nil || listed.Version != 1 || len(listed.Sections) == 0 || len(listed.Nodes) == 0 {
		t.Fatal("bootstrap navigation", listed.Version, len(listed.Sections), len(listed.Nodes), err)
	}
	// Both workspaces are present and every registered page route resolves.
	surfaceOf := map[string][]string{}
	for _, section := range listed.Sections {
		surfaceOf[section.ID] = section.Surfaces
	}
	ids := map[string]bool{}
	for _, node := range listed.Nodes {
		if len(surfaceOf[node.SectionID]) == 0 || (node.Type != "action" && node.Label != "") {
			t.Fatal("seed violates the frontend model", node)
		}
		if ids[node.ID] {
			t.Fatal("duplicate node id", node.ID)
		}
		ids[node.ID] = true
		if node.Type == "page" && node.RouteID != nil {
			for _, surface := range node.Surfaces {
				if _, ok := platform.NavigationPage(*node.RouteID, surface); !ok {
					t.Fatal("unregistered default route", node.ID, *node.RouteID, surface)
				}
			}
		}
	}

	// A stale version is refused wholesale and mutates nothing.
	stale := listed
	stale.Version = listed.Version - 1
	stale.Nodes = nil
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: stale.Version, Sections: stale.Sections, Nodes: stale.Nodes}, admin.ID); !errors.Is(err, platform.ErrConflict) {
		t.Fatal("stale version accepted", err)
	}

	// Validation bounds: actions need a page parent, a catalogue permission and
	// real delegable operations; non-action nodes never carry grants.
	page := func(id string) contracts.NavigationNode {
		return contracts.NavigationNode{ID: id, SectionID: "business", Surfaces: []string{"user", "administrator"}, Type: "page", RouteID: &id, Visible: true, OpenMode: "same_tab", OperationIds: []string{}}
	}
	action := contracts.NavigationNode{ID: "op:renameNote", SectionID: "business", Surfaces: []string{"user", "administrator"}, Type: "action", ParentID: strPtr("notes"), Label: "重命名", Visible: true, OpenMode: "same_tab", Permission: strPtr("notes:update"), OperationIds: []string{"updateNote"}}
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version, Sections: listed.Sections, Nodes: append(append([]contracts.NavigationNode{}, listed.Nodes...), action)}, admin.ID); err != nil {
		t.Fatal("valid action refused", err)
	}
	after, err := repo.ListMenuConfig(ctx)
	if err != nil || after.Version != listed.Version+1 {
		t.Fatal("version increment", after.Version, err)
	}
	broken := [][]contracts.NavigationNode{
		// Non-action nodes never carry a permission.
		func() []contracts.NavigationNode {
			p := page("notes")
			p.Permission = strPtr("notes:update")
			return []contracts.NavigationNode{p}
		}(),
		// Unknown page route is refused unless explicitly disabled.
		func() []contracts.NavigationNode { p := page("ghost"); return []contracts.NavigationNode{p} }(),
		// Actions must bind to real delegable operations.
		func() []contracts.NavigationNode {
			a := action
			a.OperationIds = []string{"createRole"}
			return []contracts.NavigationNode{page("notes"), a}
		}(),
		// Actions must hang under a page.
		func() []contracts.NavigationNode { a := action; a.ParentID = nil; return []contracts.NavigationNode{a} }(),
	}
	for index, nodes := range broken {
		if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: after.Version, Sections: after.Sections, Nodes: nodes}, admin.ID); !errors.Is(err, platform.ErrInput) {
			t.Fatal("broken tree accepted", index, err)
		}
	}

	// reset restores the registered defaults for both surfaces and stays
	// super-only: a menus:write-only operator cannot erase the tree.
	reset := contracts.MenuSaveInput{Version: after.Version, Sections: []contracts.NavigationSection{}, Nodes: []contracts.NavigationNode{}, Reset: boolPtr(true)}
	if _, err = repo.SaveNavigation(ctx, reset, admin.ID); err != nil {
		t.Fatal("super reset refused", err)
	}
	if listed, err = repo.ListMenuConfig(ctx); err != nil || listed.Version != after.Version+1 || len(listed.Nodes) == 0 {
		t.Fatal("reset result", listed.Version, err)
	}

	// A truly empty save is a real empty tree, not a reset.
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version, Sections: []contracts.NavigationSection{}, Nodes: []contracts.NavigationNode{}}, admin.ID); err != nil {
		t.Fatal("empty save refused", err)
	}
	if listed, err = repo.ListMenuConfig(ctx); err != nil || listed.Version != after.Version+2 || len(listed.Nodes) != 0 || len(listed.Sections) != 0 {
		t.Fatal("empty tree", listed.Version, len(listed.Nodes), err)
	}
}

func TestRoleGrantMaterializationAndBoundaries(t *testing.T) {
	ctx := context.Background()
	store, repo, admin := navigationFixture(t, ctx)
	_ = store

	// The one-time conversion runs on first read: the builtin user role
	// materializes the user surface items and exactly the operations its
	// permission points already unlocked.
	if _, err := repo.ListMenuConfig(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := repo.role(ctx, repo.Store.DB, "user")
	if err != nil || !user.AuthorizationInitialized || len(user.MenuIds) == 0 || len(user.OperationIds) == 0 || len(user.ActionIds) == 0 {
		t.Fatal("builtin materialization", user.AuthorizationInitialized, len(user.MenuIds), len(user.OperationIds), err)
	}
	for _, id := range user.OperationIds {
		op, ok := platform.Operation(id)
		if !ok || !platform.PermissionsAllow(user.Permissions, op.Permissions, op.PermissionMode) {
			t.Fatal("materialized operation exceeded permissions", id)
		}
	}

	// Roles created after the upgrade are explicit from the start: exactly the
	// submitted menus and operations, empty when omitted. Equivalence
	// materialization is a one-time upgrade fact, never a creation default.
	realm := "user"
	files, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "记录员", Realm: &realm, ActionIds: &[]string{}, Permissions: []string{"notes:access"}, MenuIds: &[]string{"notes"}, OperationIds: &[]string{"listNotes"}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !contains(files.OperationIds, "listNotes") || contains(files.OperationIds, "deleteNote") || contains(files.OperationIds, "createNote") {
		t.Fatal("custom role grants", files.OperationIds)
	}
	if len(files.MenuIds) != 1 || files.MenuIds[0] != "notes" {
		t.Fatal("custom role menus", files.MenuIds)
	}

	// Operation grants are bounded by permission points: a notes-reader role
	// can never take a mutation or a management operation.
	if _, err = repo.UpdateRole(ctx, files.ID, contracts.RoleSaveInput{Name: "记录员", Permissions: []string{"notes:access"}, OperationIds: &[]string{"deleteNote"}}, admin.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("operation beyond permission bound", err)
	}
	if _, err = repo.UpdateRole(ctx, files.ID, contracts.RoleSaveInput{Name: "记录员", Permissions: []string{"notes:access"}, OperationIds: &[]string{"listRoles"}}, admin.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("operation beyond permission bound", err)
	}

	// Menus never grant API capability: the projection filters visibility only.
	member, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "navmember", Email: "navmember@example.test", Password: "test-password-strong", Role: files.ID}, "hash-unused", admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	listed, listErr := repo.ListMenuConfig(ctx)
	if listErr != nil {
		t.Fatal(listErr)
	}
	projected := platform.NavigationFor(contracts.Navigation{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes}, member, "user")
	if len(projected.Nodes) != 1 || projected.Nodes[0].ID != "notes" {
		t.Fatal("projection filter", projected.Nodes)
	}

	// Role assignment through the menu editor is super+roles:write only.
	super := admin
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes, RoleAssignments: &[]contracts.NavigationRoleAssignment{{RoleID: files.ID, MenuIds: []string{"overview"}, ActionIds: []string{}}}}, super.ID); err != nil {
		t.Fatal("super assignment refused", err)
	}
	after, err := repo.role(ctx, repo.Store.DB, files.ID)
	if err != nil || len(after.MenuIds) != 1 || after.MenuIds[0] != "overview" {
		t.Fatal("assignment echo", after.MenuIds, err)
	}

	// An explicit empty authorization is a real state: the member loses every
	// navigation item, and the operation gate denies them too.
	if _, err = repo.UpdateRole(ctx, files.ID, contracts.RoleSaveInput{Name: "文件员", Permissions: []string{"files:access"}, MenuIds: &[]string{}, OperationIds: &[]string{}}, admin.ID); err != nil {
		t.Fatal("clear grants", err)
	}
	emptied, err := repo.role(ctx, repo.Store.DB, files.ID)
	if err != nil || len(emptied.MenuIds) != 0 || len(emptied.OperationIds) != 0 || !emptied.AuthorizationInitialized {
		t.Fatal("empty authorization", emptied.MenuIds, emptied.OperationIds, err)
	}
	refreshed, err := repo.FindAccount(ctx, member.Username)
	if err != nil {
		t.Fatal(err)
	}
	if projected = platform.NavigationFor(contracts.Navigation{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes}, refreshed.User, "user"); len(projected.Nodes) != 0 {
		t.Fatal("cleared member still sees items", projected.Nodes)
	}
	if platform.OperationAllowed(refreshed.User, "fileAccess") {
		t.Fatal("cleared member keeps operation grant")
	}
}

func strPtr(v string) *string { return &v }
func boolPtr(v bool) *bool    { return &v }

// TestLegacyOverrideMergesOnce pins the unified-tree semantics: a legacy
// user-workspace override merges onto the single shared notes node, which
// carries both surfaces after the conversion (ADR-0039).
func TestLegacyOverrideMergesOnce(t *testing.T) {
	ctx := context.Background()
	store, repo, admin := navigationFixture(t, ctx)

	// A user-side override written before the normalized upgrade: renamed and
	// hidden notes page, still present in unicore_menus.
	if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_menus(menu_key,label,group_key,sort,visible,type,updated_at) VALUES('notes','随手记','一级导航',50,0,'page',1)"); err != nil {
		t.Fatal(err)
	}
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	notes := []contracts.NavigationNode{}
	for _, node := range listed.Nodes {
		if node.RouteID != nil && *node.RouteID == "notes" {
			notes = append(notes, node)
		}
	}
	if len(notes) != 1 {
		t.Fatal("the shared tree keeps exactly one notes node", len(notes))
	}
	if notes[0].Label != "随手记" || notes[0].Visible {
		t.Fatal("legacy override not merged", notes[0])
	}
	if !contains(notes[0].Surfaces, "user") || !contains(notes[0].Surfaces, "administrator") {
		t.Fatal("shared node lost a surface", notes[0].Surfaces)
	}
	_ = admin
}

// TestSharedNavigationUpgrade pins the ADR-0039 one-time conversion: a stored
// workspace-prefixed dual tree collapses into the shared single tree, both
// variants of one page merge into a node carrying both surfaces, and the role
// grant rows lose their prefixes with duplicates removed.
func TestSharedNavigationUpgrade(t *testing.T) {
	ctx := context.Background()
	store, repo, admin := navigationFixture(t, ctx)
	_ = admin

	// A legacy tree serialized exactly the way the pre-ADR-0039 storage wrote
	// it: prefixed ids and scalar surfaces, with duplicated grants on both
	// workspace variants of the personal-center pages.
	legacySections := []struct{ id, surface string }{
		{"user:business", "user"}, {"user:personal", "user"},
		{"admin:business", "administrator"}, {"admin:system", "administrator"},
	}
	legacyNodes := []string{"overview", "lab", "notes", "account", "account-security"}
	if err := func() error {
		tx, err := store.DB.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()
		for _, section := range legacySections {
			payload := fmt.Sprintf(`{"id":%q,"surface":%q,"name":"","sort":10,"visible":true,"show_title":true}`, section.id, section.surface)
			if _, err := store.Exec(ctx, tx, "INSERT INTO unicore_navigation_sections(id,surface,payload) VALUES(?,?,?)", section.id, section.surface, payload); err != nil {
				return err
			}
		}
		// The legacy layout kept the administrator account pages inside the
		// admin:system region while members had their own personal region.
		sectionOf := map[string]map[string]string{
			"user":  {"overview": "business", "lab": "business", "notes": "business", "account": "personal", "account-security": "personal"},
			"admin": {"overview": "business", "lab": "business", "notes": "business", "account": "system", "account-security": "system"},
		}
		for _, surface := range []string{"user", "admin"} {
			for _, page := range legacyNodes {
				id := surface + ":" + page
				payload := fmt.Sprintf(`{"id":%q,"section_id":%q,"surfaces":[],"type":"page","route_id":%q,"label":"","icon":"Circle","sort":100,"visible":true,"open_mode":"same_tab","badge_text":"","badge_color":"","badge_dot":false,"operation_ids":[],"disabled":false}`, id, surface+":"+sectionOf[surface][page], page)
				if _, err := store.Exec(ctx, tx, "INSERT INTO unicore_navigation_nodes(id,section_id,node_type,payload) VALUES(?,?,?,?)", id, surface+":"+sectionOf[surface][page], "page", payload); err != nil {
					return err
				}
			}
		}
		if _, err := store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=4, initialized=1 WHERE id=1"); err != nil {
			return err
		}
		if _, err := store.Exec(ctx, tx, "INSERT INTO unicore_role_menus(role_id,menu_id) VALUES('user','user:notes'),('user','administrator:notes'),('user','user:account')"); err != nil {
			return err
		}
		if _, err := store.Exec(ctx, tx, "INSERT INTO unicore_role_actions(role_id,action_id) VALUES('user','user:op:createNote'),('user','administrator:op:createNote')"); err != nil {
			return err
		}
		return tx.Commit()
	}(); err != nil {
		t.Fatal(err)
	}

	// The startup conversion collapses the dual tree and rewrites the grants.
	if err := repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := len(listed.Sections); got != 3 {
		t.Fatal("sections collapsed", listed.Sections)
	}
	surfaces := map[string][]string{}
	for _, section := range listed.Sections {
		surfaces[section.ID] = section.Surfaces
	}
	for id, want := range map[string]int{"business": 2, "personal": 2, "system": 1} {
		if len(surfaces[id]) != want {
			t.Fatal("section surfaces", id, surfaces[id])
		}
	}
	notes := []contracts.NavigationNode{}
	for _, node := range listed.Nodes {
		if node.RouteID != nil && *node.RouteID == "notes" {
			notes = append(notes, node)
		}
	}
	if len(notes) != 1 || !contains(notes[0].Surfaces, "user") || !contains(notes[0].Surfaces, "administrator") {
		t.Fatal("notes variants merged", notes)
	}
	// Grant rows: deduplicated onto the shared ids.
	menuIDs, err := store.Rows(ctx, store.DB, "SELECT menu_id FROM unicore_role_menus WHERE role_id='user' ORDER BY menu_id")
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for menuIDs.Next() {
		var id string
		if err := menuIDs.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	menuIDs.Close()
	if len(ids) != 2 || ids[0] != "account" || ids[1] != "notes" {
		t.Fatal("menu grants rewritten", ids)
	}
	actionRows, err := store.Rows(ctx, store.DB, "SELECT action_id FROM unicore_role_actions WHERE role_id='user'")
	if err != nil {
		t.Fatal(err)
	}
	actionIDs := []string{}
	for actionRows.Next() {
		var id string
		if err := actionRows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		actionIDs = append(actionIDs, id)
	}
	actionRows.Close()
	if len(actionIDs) != 1 || actionIDs[0] != "op:createNote" {
		t.Fatal("action grants rewritten", actionIDs)
	}
}
