// Author: yunnuo <ymz@ebox.vip>
// Description: Versioned navigation saves, one-time legacy materialization and independent role grant boundaries.
package platformsql

import (
	"context"
	"errors"
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
	// Both surfaces are present and every registered page route resolves.
	surfaceOf := map[string]string{}
	for _, section := range listed.Sections {
		surfaceOf[section.ID] = section.Surface
	}
	ids := map[string]bool{}
	for _, node := range listed.Nodes {
		if surfaceOf[node.SectionID] == "" || (node.Type != "action" && node.Label != "") {
			t.Fatal("seed violates the frontend model", node)
		}
		if ids["\x00"+node.ID+"\x00"+surfaceOf[node.SectionID]] {
			t.Fatal("duplicate node id within surface", node.ID)
		}
		ids["\x00"+node.ID+"\x00"+surfaceOf[node.SectionID]] = true
		if node.Type == "page" && node.RouteID != nil {
			if _, ok := platform.NavigationPage(*node.RouteID, surfaceOf[node.SectionID]); !ok {
				t.Fatal("unregistered default route", node.ID, *node.RouteID)
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
		return contracts.NavigationNode{ID: id, SectionID: "user:business", Type: "page", RouteID: &id, Visible: true, OpenMode: "same_tab", OperationIds: []string{}}
	}
	action := contracts.NavigationNode{ID: "notes:rename", SectionID: "user:business", Type: "action", ParentID: strPtr("user:notes"), Label: "重命名", Visible: true, OpenMode: "same_tab", Permission: strPtr("notes:update"), OperationIds: []string{"updateNote"}}
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
		// Actions must bind to real delegable operations of their realm.
		func() []contracts.NavigationNode {
			a := action
			a.OperationIds = []string{"createRole"}
			return []contracts.NavigationNode{page("notes"), a}
		}(),
		// Actions must hang under a page.
		func() []contracts.NavigationNode { a := action; a.ParentID = nil; return []contracts.NavigationNode{a} }(),
	}
	for _, nodes := range broken {
		if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: after.Version, Sections: after.Sections, Nodes: nodes}, admin.ID); !errors.Is(err, platform.ErrInput) {
			t.Fatal("broken tree accepted", err)
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
	files, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "文件员", Realm: &realm, ActionIds: &[]string{}, Permissions: []string{"files:access"}, MenuIds: &[]string{"user:files"}, OperationIds: &[]string{"listFiles", "fileAccess"}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !contains(files.OperationIds, "listFiles") || contains(files.OperationIds, "listNotes") {
		t.Fatal("custom role grants", files.OperationIds)
	}
	if len(files.MenuIds) != 1 || files.MenuIds[0] != "user:files" {
		t.Fatal("custom role menus", files.MenuIds)
	}

	// Operation grants are bounded by permission points: a files-only role can
	// never take a notes operation, and cross-realm or unknown ids are refused.
	if _, err = repo.UpdateRole(ctx, files.ID, contracts.RoleSaveInput{Name: "文件员", Permissions: []string{"files:access"}, OperationIds: &[]string{"listNotes"}}, admin.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("operation beyond permission bound", err)
	}
	if _, err = repo.UpdateRole(ctx, files.ID, contracts.RoleSaveInput{Name: "文件员", Permissions: []string{"files:access"}, OperationIds: &[]string{"listRoles"}}, admin.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("cross-realm operation grant", err)
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
	if len(projected.Nodes) != 1 || projected.Nodes[0].ID != "user:files" {
		t.Fatal("projection filter", projected.Nodes)
	}

	// Role assignment through the menu editor is super+roles:write only.
	super := admin
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes, RoleAssignments: &[]contracts.NavigationRoleAssignment{{RoleID: files.ID, MenuIds: []string{"user:overview"}, ActionIds: []string{}}}}, super.ID); err != nil {
		t.Fatal("super assignment refused", err)
	}
	after, err := repo.role(ctx, repo.Store.DB, files.ID)
	if err != nil || len(after.MenuIds) != 1 || after.MenuIds[0] != "user:overview" {
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

// TestLegacyOverrideSurfaceMerge pins the E2E finding: user-workspace legacy
// overrides must land on the user-surface node only. Bare ids repeat across
// surfaces, so an id-only merge would corrupt the administrator tree.
func TestLegacyOverrideSurfaceMerge(t *testing.T) {
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
	surfaceOf := map[string]string{}
	for _, section := range listed.Sections {
		surfaceOf[section.ID] = section.Surface
	}
	userNotes, adminNotes := -1, -1
	for i, node := range listed.Nodes {
		if node.RouteID == nil || *node.RouteID != "notes" {
			continue
		}
		switch surfaceOf[node.SectionID] {
		case "user":
			userNotes = i
		case "administrator":
			adminNotes = i
		}
	}
	if userNotes < 0 || adminNotes < 0 {
		t.Fatal("notes nodes missing after conversion", len(listed.Nodes))
	}
	if listed.Nodes[userNotes].Label != "随手记" || listed.Nodes[userNotes].Visible {
		t.Fatal("user override not merged", listed.Nodes[userNotes])
	}
	if listed.Nodes[adminNotes].Label != "" || !listed.Nodes[adminNotes].Visible {
		t.Fatal("administrator node corrupted by user override", listed.Nodes[adminNotes])
	}
	_ = admin
}
