// Author: yunnuo <ymz@ebox.vip>
// Description: Versioned navigation saves, one-time legacy materialization and independent role grant boundaries.
package platformsql

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/module"
	notesmodule "github.com/yunnuo/unicore/internal/modules/notes"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/migrations/runner"
	apispec "github.com/yunnuo/unicore/packages/contracts"
	"strings"
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
		// Actions still hang under pages only: a directory parent is refused.
		func() []contracts.NavigationNode {
			dir := contracts.NavigationNode{ID: "dir", SectionID: "business", Surfaces: []string{"user", "administrator"}, Type: "directory", Visible: true, OpenMode: "same_tab", OperationIds: []string{}}
			a := action
			a.ParentID = strPtr("dir")
			return []contracts.NavigationNode{page("notes"), dir, a}
		}(),
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

// TestNavigationParentTypesAndBounds pins the relaxed parent rule: every
// non-action node (directory, page or link) may parent another non-action
// node, while actions still hang under pages only; cycles and the depth
// limit stay refused.
func TestNavigationParentTypesAndBounds(t *testing.T) {
	ctx := context.Background()
	_, repo, admin := navigationFixture(t, ctx)

	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	section := contracts.NavigationSection{ID: "business", Surfaces: []string{"user", "administrator"}, Sort: 10, Visible: true, ShowTitle: true}
	pageNode := func(id, route, parent string) contracts.NavigationNode {
		node := contracts.NavigationNode{ID: id, SectionID: "business", Surfaces: []string{"user", "administrator"}, Type: "page", RouteID: &route, Visible: true, OpenMode: "same_tab", OperationIds: []string{}}
		if parent != "" {
			node.ParentID = strPtr(parent)
		}
		return node
	}
	linkNode := func(id, url, parent string) contracts.NavigationNode {
		node := contracts.NavigationNode{ID: id, SectionID: "business", Surfaces: []string{"user", "administrator"}, Type: "link", Url: &url, Visible: true, OpenMode: "same_tab", OperationIds: []string{}}
		if parent != "" {
			node.ParentID = strPtr(parent)
		}
		return node
	}
	directoryNode := func(id, parent string) contracts.NavigationNode {
		node := contracts.NavigationNode{ID: id, SectionID: "business", Surfaces: []string{"user", "administrator"}, Type: "directory", Visible: true, OpenMode: "same_tab", OperationIds: []string{}}
		if parent != "" {
			node.ParentID = strPtr(parent)
		}
		return node
	}
	version := listed.Version
	save := func(version int, nodes []contracts.NavigationNode) error {
		_, err := repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: version, Sections: []contracts.NavigationSection{section}, Nodes: nodes}, admin.ID)
		return err
	}

	// A page under a page, a page under a link and a directory under a page
	// all persist: any non-action node may parent another non-action node.
	valid := []contracts.NavigationNode{
		pageNode("overview", "overview", ""),
		pageNode("notes", "notes", "overview"),
		linkNode("link:help", "https://docs.example.test", "overview"),
		pageNode("account-sessions", "account-sessions", "link:help"),
		directoryNode("nested", "notes"),
	}
	if err = save(version, valid); err != nil {
		t.Fatal("page/link parents refused", err)
	}
	version++

	// Actions still hang under pages only: the page parent stays legal.
	actionParent := func(parent string) []contracts.NavigationNode {
		a := contracts.NavigationNode{ID: "op:renameNote", SectionID: "business", Surfaces: []string{"user", "administrator"}, Type: "action", ParentID: strPtr(parent), Label: "重命名", Visible: true, OpenMode: "same_tab", Permission: strPtr("notes:update"), OperationIds: []string{"updateNote"}}
		return append(append([]contracts.NavigationNode{}, valid...), a)
	}
	if err = save(version, actionParent("overview")); err != nil {
		t.Fatal("action under page refused", err)
	}
	version++

	// A link or directory parent is refused for an action node.
	for _, parent := range []string{"link:help", "nested"} {
		if err = save(version, actionParent(parent)); !errors.Is(err, platform.ErrInput) {
			t.Fatal("action parent accepted", parent, err)
		}
	}

	// A two node cycle stays refused.
	cycle := []contracts.NavigationNode{
		pageNode("c1", "overview", "c2"),
		pageNode("c2", "notes", "c1"),
	}
	if err = save(version, cycle); !errors.Is(err, platform.ErrInput) {
		t.Fatal("cycle accepted", err)
	}

	// The depth limit still caps a chain at maxMenuDepth levels.
	chain := []contracts.NavigationNode{pageNode("n1", "overview", "")}
	routes := []string{"notes", "account-sessions", "api-docs", "account", "account-security"}
	for index, route := range routes {
		chain = append(chain, pageNode(fmt.Sprintf("n%d", index+2), route, fmt.Sprintf("n%d", index+1)))
	}
	if err = save(version, chain); !errors.Is(err, platform.ErrInput) {
		t.Fatal("depth six accepted", err)
	}
	// Five levels stay legal.
	if err = save(version, chain[:len(chain)-1]); err != nil {
		t.Fatal("depth five refused", err)
	}
}

// legacyDualTreeNavigation mirrors internal/platform DefaultNavigation at the
// pre-ADR-0039 seed (commit 93fdd75): surface-scalar sections with
// user:/administrator: prefixed ids, the personal directory under
// admin:system, top-level personal pages on the user side and realm-matched
// action nodes without surfaces.
func legacyDualTreeNavigation() contracts.Navigation {
	pages := platform.NavigationPages()
	result := contracts.Navigation{
		Version: 1,
		Sections: []contracts.NavigationSection{
			{ID: "user:business", Sort: 10, Visible: true, ShowTitle: true},
			{ID: "user:personal", Sort: 20, Visible: true, ShowTitle: true},
			{ID: "admin:business", Sort: 10, Visible: true, ShowTitle: true},
			{ID: "admin:system", Sort: 20, Visible: true, ShowTitle: true},
		},
		Nodes: []contracts.NavigationNode{},
	}
	result.Nodes = append(result.Nodes,
		contracts.NavigationNode{ID: "administration", SectionID: "admin:business", Type: "directory", Icon: "Users", Sort: 20, Visible: true, OpenMode: "same_tab", OperationIds: []string{}},
		contracts.NavigationNode{ID: "settings", SectionID: "admin:system", Type: "directory", Icon: "Settings2", Sort: 20, Visible: true, OpenMode: "same_tab", OperationIds: []string{}},
		contracts.NavigationNode{ID: "personal", SectionID: "admin:system", Type: "directory", Icon: "UserRound", Sort: 30, Visible: true, OpenMode: "same_tab", OperationIds: []string{}},
	)
	sortCounter := 0
	for _, page := range pages {
		for _, surface := range page.Surfaces {
			if surface == "user" && page.Group == "administration" {
				continue
			}
			prefix := "admin"
			if surface == "user" {
				prefix = "user"
			}
			section := prefix + ":business"
			var parent string
			switch page.Group {
			case "personal":
				if surface == "administrator" {
					section = "admin:system"
					parent = "personal"
				} else {
					section = prefix + ":personal"
				}
			case "system", "administration":
				if surface == "administrator" {
					if page.Group == "administration" {
						parent = "administration"
					} else {
						section = "admin:system"
						parent = "settings"
					}
				}
			}
			sortCounter++
			node := contracts.NavigationNode{
				ID: page.ID, SectionID: section, Type: "page", RouteID: &page.ID,
				Sort: sortCounter * 10, Visible: true, OpenMode: "same_tab", OperationIds: []string{},
			}
			if parent != "" {
				node.ParentID = &parent
			}
			result.Nodes = append(result.Nodes, node)
		}
	}
	surfaceOf := map[string]string{
		"user:business": "user", "user:personal": "user",
		"admin:business": "administrator", "admin:system": "administrator",
	}
	for i := range result.Nodes {
		node := &result.Nodes[i]
		prefix := surfaceOf[node.SectionID] + ":"
		node.ID = prefix + node.ID
		if node.ParentID != nil {
			parent := prefix + *node.ParentID
			node.ParentID = &parent
		}
	}
	result.Nodes = append(result.Nodes, legacyDualActions(result, surfaceOf)...)
	return result
}

// legacyDualActions mirrors DefaultActions at the pre-ADR-0039 seed:
// realm-matched page binding, prefixed ids, no surfaces field.
func legacyDualActions(n contracts.Navigation, surfaceOf map[string]string) []contracts.NavigationNode {
	sections := map[string]string{}
	for _, s := range n.Sections {
		sections[s.ID] = surfaceOf[s.ID]
	}
	ops := apispec.Operations()
	keys := []string{}
	for k := range ops {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	result := []contracts.NavigationNode{}
	for _, key := range keys {
		op := ops[key]
		if op.Policy.UIPage == "" || op.Policy.SuperAdmin || len(op.Policy.Permissions) == 0 {
			continue
		}
		for _, page := range n.Nodes {
			if page.Type != "page" || page.RouteID == nil || *page.RouteID != op.Policy.UIPage || sections[page.SectionID] != op.Policy.IdentityRealm {
				continue
			}
			permissions := op.Policy.Permissions
			if op.Policy.PermissionMode != "any" {
				for _, permission := range permissions {
					if permission != "admin:access" {
						permissions = []string{permission}
						break
					}
				}
			}
			for i, permission := range permissions {
				id := op.Policy.IdentityRealm + ":op:" + op.ID
				if i > 0 {
					id += ":alt" + strconv.Itoa(i)
				}
				parent := page.ID
				p := permission
				result = append(result, contracts.NavigationNode{ID: id, SectionID: page.SectionID, Type: "action", ParentID: &parent, Permission: &p, Label: op.Summary, OperationIds: []string{op.ID}, Visible: true, OpenMode: "same_tab"})
			}
		}
	}
	return result
}

// TestLegacyRegionFoldAndActionPrune pins the one-time repair of instances
// upgraded from the pre-collapse dual tree: the converted three-region tree
// folds into the two-region shape, actions the catalogue no longer accepts
// are pruned with their grant rows, and the healed tree saves cleanly without
// widening any role beyond the folded container row.
func TestLegacyRegionFoldAndActionPrune(t *testing.T) {
	ctx := context.Background()
	store, repo, admin := navigationFixture(t, ctx)

	legacy := legacyDualTreeNavigation()
	// A stale action payload: unknown permission and an operation that left
	// the contract. The upgrade must prune it and its grant row.
	stale := contracts.NavigationNode{ID: "user:op:ghost", SectionID: "user:business", Type: "action", ParentID: strPtr("user:overview"), Permission: strPtr("ghost:missing"), OperationIds: []string{"removedOperation"}, Visible: true, OpenMode: "same_tab"}
	legacy.Nodes = append(legacy.Nodes, stale)
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = repo.writeNavigation(ctx, tx, legacy); err != nil {
		t.Fatal(err)
	}
	// A user-realm role holding the legacy personal-page grants plus one live
	// and one stale action grant, mirroring pre-upgrade rows.
	if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES('member','成员','user','self')"); err != nil {
		t.Fatal(err)
	}
	for _, grant := range []struct{ table, column, id string }{
		{"unicore_role_menus", "menu_id", "user:account"},
		{"unicore_role_menus", "menu_id", "user:account-security"},
		{"unicore_role_actions", "action_id", "user:op:ghost"},
		{"unicore_role_actions", "action_id", "user:op:listNotes"},
		{"unicore_role_operations", "operation_id", "listNotes"},
	} {
		if _, err = store.Exec(ctx, tx, "INSERT INTO "+grant.table+"(role_id,"+grant.column+") VALUES('member',?)", grant.id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET initialized=1, version=1 WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}

	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal("upgrade", err)
	}
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	sectionIDs := map[string]bool{}
	for _, section := range listed.Sections {
		sectionIDs[section.ID] = true
	}
	if len(listed.Sections) != 2 || !sectionIDs["business"] || !sectionIDs["system"] {
		t.Fatal("folded sections", listed.Sections)
	}
	nodes := map[string]contracts.NavigationNode{}
	for _, node := range listed.Nodes {
		if node.SectionID == "personal" {
			t.Fatal("personal section survivors", node)
		}
		nodes[node.ID] = node
	}
	container, ok := nodes["personal"]
	if !ok || container.Type != "directory" || container.SectionID != "business" || container.Sort != 2700 ||
		!contains(container.Surfaces, "user") || !contains(container.Surfaces, "administrator") {
		t.Fatal("folded container", container)
	}
	for _, id := range []string{"account", "account-security", "account-sessions"} {
		page, ok := nodes[id]
		if !ok || page.SectionID != "business" || page.ParentID == nil || *page.ParentID != "personal" {
			t.Fatal("folded page", id, page)
		}
	}
	if _, ok := nodes["op:ghost"]; ok {
		t.Fatal("stale action survived")
	}
	if _, ok := nodes["op:listNotes"]; !ok {
		t.Fatal("live action pruned")
	}

	// The healed tree saves: validateNavigation accepts the whole payload and
	// a second upgrade pass finds nothing left to repair.
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes}, admin.ID); err != nil {
		t.Fatal("healed tree refused", err)
	}
	version := listed.Version + 1
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	if again, err := repo.ListMenuConfig(ctx); err != nil || again.Version != version {
		t.Fatal("upgrade not idempotent", version, again.Version, err)
	}

	// Grants: the stale action row is gone, the live rows survive, and the
	// only addition is the folded container row that keeps the moved pages
	// reachable for the member role.
	role, err := repo.role(ctx, store.DB, "member")
	if err != nil {
		t.Fatal(err)
	}
	if !contains(role.MenuIds, "account") || !contains(role.MenuIds, "account-security") || !contains(role.MenuIds, "personal") {
		t.Fatal("member menu grants", role.MenuIds)
	}
	if len(role.MenuIds) != 3 {
		t.Fatal("widened member menus", role.MenuIds)
	}
	if len(role.ActionIds) != 1 || role.ActionIds[0] != "op:listNotes" {
		t.Fatal("member action grants", role.ActionIds)
	}
	if len(role.OperationIds) != 1 || role.OperationIds[0] != "listNotes" {
		t.Fatal("member operation grants", role.OperationIds)
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
	// The menu row projects the page; the granted listNotes operation plus the
	// held notes:access point derive the op:listNotes button at session
	// resolution, so the action node projects with it. The ungranted sibling
	// buttons stay invisible.
	if len(projected.Nodes) != 2 || projected.Nodes[0].ID != "notes" || projected.Nodes[1].ID != "op:listNotes" {
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
	legacyNodes := []string{"overview", "account-sessions", "notes", "account", "account-security"}
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
			"user":  {"overview": "business", "account-sessions": "business", "notes": "business", "account": "personal", "account-security": "personal"},
			"admin": {"overview": "business", "account-sessions": "business", "notes": "business", "account": "system", "account-security": "system"},
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

	// The startup conversion collapses the dual tree, folds the pre-collapse
	// personal region into business and rewrites the grants.
	if err := repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := len(listed.Sections); got != 2 {
		t.Fatal("sections collapsed", listed.Sections)
	}
	surfaces := map[string][]string{}
	for _, section := range listed.Sections {
		surfaces[section.ID] = section.Surfaces
	}
	for id, want := range map[string]int{"business": 2, "system": 1} {
		if len(surfaces[id]) != want {
			t.Fatal("section surfaces", id, surfaces[id])
		}
	}
	for _, node := range listed.Nodes {
		if node.ID == "account" && (node.SectionID != "business" || node.ParentID != nil) {
			t.Fatal("folded account page", node)
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

// TestEnsureMonitorNavigationUpgradeBoundaries covers the runtime-monitor
// introduction on persisted trees: fresh seeds only record the marker,
// repeated restarts stay idempotent, post-upgrade operator deletions are
// never resurrected, and a legacy tree receives the monitor directory with
// every other customization intact.
func TestEnsureMonitorNavigationUpgradeBoundaries(t *testing.T) {
	ctx := context.Background()
	store, repo, admin := navigationFixture(t, ctx)

	monitorIDs := map[string]bool{"monitor-center": true, "monitor": true, "monitor-services": true, "monitor-resources": true, "monitor-events": true}
	legacyIDs := map[string]bool{"monitor-center": true, "monitor": true, "monitor-services": true, "monitor-resources": true}
	count := func(list contracts.MenuList, ids map[string]bool) int {
		total := 0
		for _, node := range list.Nodes {
			if ids[node.ID] {
				total++
			}
		}
		return total
	}
	marker := func() string {
		var value string
		if err := store.Row(ctx, store.DB, "SELECT setting_value FROM unicore_system_settings WHERE setting_key='_navigation_monitor_seeded'").Scan(&value); err != nil {
			return ""
		}
		return value
	}
	markerCovers := func(ids ...string) bool {
		value := marker()
		for _, id := range ids {
			if !strings.Contains(","+value+",", ","+id+",") {
				return false
			}
		}
		return true
	}

	// Fresh install: the default seed already carries the monitor directory
	// with all five entries; the first ensure only records the per-node marker.
	if err := repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if count(listed, monitorIDs) != 5 || !markerCovers("monitor-center", "monitor", "monitor-services", "monitor-resources", "monitor-events") {
		t.Fatalf("fresh seed missing monitor nodes or marker: nodes=%d marker=%q", count(listed, monitorIDs), marker())
	}
	version := listed.Version
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	after, err := repo.ListMenuConfig(ctx)
	if err != nil || after.Version != version {
		t.Fatalf("repeated ensure must be idempotent: version %d -> %d err=%v", version, after.Version, err)
	}

	// Post-upgrade operator deletion: even a whole-directory deletion stays
	// deleted, because the marker remembers every node the tree once had.
	nodes := []contracts.NavigationNode{}
	for _, node := range after.Nodes {
		if !monitorIDs[node.ID] {
			nodes = append(nodes, node)
		}
	}
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: after.Version, Sections: after.Sections, Nodes: nodes}, admin.ID); err != nil {
		t.Fatal(err)
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	deleted, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if count(deleted, monitorIDs) != 0 {
		t.Fatalf("operator deletion resurrected by ensure: nodes=%d", count(deleted, monitorIDs))
	}

	// Legacy upgrade simulation: an instance seeded before the monitor shipped
	// has no marker; the ensure merges exactly the five nodes with seeded
	// defaults and leaves every operator customization (renamed label, custom
	// sort, hidden page) untouched.
	if _, err = store.Exec(ctx, store.DB, "DELETE FROM unicore_system_settings WHERE setting_key='_navigation_monitor_seeded'"); err != nil {
		t.Fatal(err)
	}
	legacy := deleted
	kept := []contracts.NavigationNode{}
	for _, node := range legacy.Nodes {
		if node.ID == "site" {
			node.Label = "站点配置"
			node.Sort = 777
		}
		if node.ID == "account-sessions" {
			node.Visible = false
		}
		kept = append(kept, node)
	}
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: legacy.Version, Sections: legacy.Sections, Nodes: kept}, admin.ID); err != nil {
		t.Fatal(err)
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	upgraded, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if count(upgraded, monitorIDs) != 5 {
		t.Fatalf("legacy tree missing monitor nodes after ensure: nodes=%d", count(upgraded, monitorIDs))
	}
	byID := map[string]contracts.NavigationNode{}
	for _, node := range upgraded.Nodes {
		byID[node.ID] = node
	}
	if byID["site"].Label != "站点配置" || byID["site"].Sort != 777 {
		t.Fatalf("operator rename/sort clobbered: %+v", byID["site"])
	}
	if byID["account-sessions"].Visible {
		t.Fatalf("operator visibility clobbered: %+v", byID["account-sessions"])
	}
	if byID["monitor-center"].Type != "directory" || byID["monitor"].ParentID == nil || *byID["monitor"].ParentID != "monitor-center" {
		t.Fatalf("monitor seed shape drifted: %+v %+v", byID["monitor-center"], byID["monitor"])
	}
	if byID["monitor-events"].ParentID == nil || *byID["monitor-events"].ParentID != "monitor-center" {
		t.Fatalf("events page must join the monitor directory: %+v", byID["monitor-events"])
	}
	// The merged nodes carry seeded defaults: empty labels fall back to the
	// frontend registry instead of persisting display names.
	if byID["monitor"].Label != "" {
		t.Fatalf("merged page must keep the empty label, got %q", byID["monitor"].Label)
	}

	// Legacy "1" marker upgrade: a P0 instance (marker value "1") that had
	// already deleted monitor-resources must not see it again, while the new
	// monitor-events page still joins.
	if _, err = store.Exec(ctx, store.DB, "UPDATE unicore_system_settings SET setting_value='1' WHERE setting_key='_navigation_monitor_seeded'"); err != nil {
		t.Fatal(err)
	}
	p0 := upgraded
	keptNodes := []contracts.NavigationNode{}
	for _, node := range p0.Nodes {
		if node.ID == "monitor-resources" {
			continue
		}
		keptNodes = append(keptNodes, node)
	}
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: p0.Version, Sections: p0.Sections, Nodes: keptNodes}, admin.ID); err != nil {
		t.Fatal(err)
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	p1, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if count(p1, legacyIDs) != 3 {
		t.Fatalf("legacy deletion resurrected by the per-node upgrade: nodes=%d", count(p1, legacyIDs))
	}
	if count(p1, monitorIDs) != 4 {
		t.Fatalf("P0 instance must gain monitor-events exactly once: nodes=%d", count(p1, monitorIDs))
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	again, err := repo.ListMenuConfig(ctx)
	if err != nil || count(again, monitorIDs) != 4 || again.Version != p1.Version {
		t.Fatalf("post-upgrade ensure must stay idempotent: v%d -> v%d err=%v", p1.Version, again.Version, err)
	}
}

func TestRetiredDemoNavigationPreservesBusinessChildren(t *testing.T) {
	ctx := t.Context()
	store, repo, _ := navigationFixture(t, ctx)
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	n := contracts.Navigation{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes}
	n.Nodes = append(n.Nodes,
		contracts.NavigationNode{ID: "old-lab", SectionID: "business", Type: "page", RouteID: strPtr("lab"), Visible: true, Surfaces: []string{"user", "administrator"}},
		contracts.NavigationNode{ID: "old-files", SectionID: "business", Type: "page", RouteID: strPtr("files"), ParentID: strPtr("old-lab"), Visible: true, Surfaces: []string{"administrator"}},
		contracts.NavigationNode{ID: "custom-help", SectionID: "business", Type: "link", ParentID: strPtr("old-files"), ActiveMenu: strPtr("old-files"), Url: strPtr("https://example.test/help"), Label: "Business help", Visible: true, Surfaces: []string{"administrator"}, OpenMode: "same_tab"},
		contracts.NavigationNode{ID: "old-link", SectionID: "business", Type: "link", Url: strPtr("/files?tab=ready#top"), Visible: true, Surfaces: []string{"administrator"}},
		contracts.NavigationNode{ID: "old-upload", SectionID: "business", Type: "action", ParentID: strPtr("old-files"), Permission: strPtr("files:upload"), OperationIds: []string{"createFileUpload"}, Surfaces: []string{"administrator"}},
	)
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = repo.writeNavigation(ctx, tx, n); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"old-lab", "old-files", "custom-help"} {
		if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_role_menus(role_id,menu_id) VALUES(?,?)", "user", id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_role_actions(role_id,action_id) VALUES(?,?)", "user", "old-upload"); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	after, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, node := range after.Nodes {
		if node.ID == "old-lab" || node.ID == "old-files" || node.ID == "old-upload" || node.ID == "old-link" {
			t.Fatal("retired node survived", node)
		}
		if node.ID == "custom-help" {
			found = true
			if node.ParentID != nil || node.ActiveMenu != nil || node.Label != "Business help" {
				t.Fatal("custom child changed", node)
			}
		}
	}
	if !found {
		t.Fatal("custom child was deleted")
	}
	if err = validateNavigation(contracts.Navigation{Sections: after.Sections, Nodes: after.Nodes}); err != nil {
		t.Fatal("retired tree is not editable", err)
	}
	var count int
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_role_menus WHERE menu_id IN (?,?)", "old-lab", "old-files").Scan(&count); err != nil || count != 0 {
		t.Fatal("dangling menu grant", count, err)
	}
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_role_actions WHERE action_id=?", "old-upload").Scan(&count); err != nil || count != 0 {
		t.Fatal("dangling action grant", count, err)
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	again, err := repo.ListMenuConfig(ctx)
	if err != nil || again.Version != after.Version {
		t.Fatal("retirement is not idempotent", again.Version, after.Version, err)
	}
}
