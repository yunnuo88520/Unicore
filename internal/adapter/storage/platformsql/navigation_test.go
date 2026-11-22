// Author: yunnuo <ymz@ebox.vip>
// Description: Versioned navigation saves, forward-compatible top-ups and independent role grant boundaries.
package platformsql

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/module"
	notesmodule "github.com/yunnuo/unicore/internal/modules/notes"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/migrations/runner"
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
		// Registered surfaces are the ceiling: the node's declared surfaces must
		// stay within what the page registered (baseNavigationPages + modules).
		surfaces := []string{"administrator"}
		switch route {
		case "overview":
			surfaces = []string{"user", "administrator"}
		case "notes":
			surfaces = []string{"user"}
		}
		node := contracts.NavigationNode{ID: id, SectionID: "business", Surfaces: surfaces, Type: "page", RouteID: &route, Visible: true, OpenMode: "same_tab", OperationIds: []string{}}
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
		pageNode("tasks", "tasks", "link:help"),
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
	routes := []string{"tasks", "api-docs", "edition", "site", "dictionaries"}
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

func strPtr(v string) *string { return &v }
func boolPtr(v bool) *bool    { return &v }

// TestLegacyOverrideMergesOnce pins the unified-tree semantics: a legacy
// user-workspace override merges onto the single shared notes node, which
// carries both surfaces after the conversion (ADR-0039).
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
		if node.ID == "notes" {
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
	if byID["notes"].Visible {
		t.Fatalf("operator visibility clobbered: %+v", byID["notes"])
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

func TestNavigationRoleSnapshotVersions(t *testing.T) {
	ctx := t.Context()
	store, repo, owner := navigationFixture(t, ctx)
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var page contracts.NavigationNode
	for _, node := range listed.Nodes {
		if node.Type == "page" && node.RouteID != nil && *node.RouteID == "users" {
			page = node
			break
		}
	}
	if page.ID == "" {
		t.Fatal("missing users page")
	}
	const actionID = "test:snapshot-branch"
	withAction := append(slices.Clone(listed.Nodes), contracts.NavigationNode{
		ID: actionID, SectionID: page.SectionID, ParentID: &page.ID,
		Surfaces: []string{"administrator"}, Type: "action", Label: "Snapshot branch",
		Visible: true, OpenMode: "same_tab", Permission: strPtr("users:read"),
		OperationIds: []string{"roleOptions"},
	})
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version, Sections: listed.Sections, Nodes: withAction}, owner.ID); err != nil {
		t.Fatal("save action", err)
	}
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{
		Name: "Snapshot holder", Permissions: []string{"users:read"},
		MenuIds: &[]string{}, ActionIds: &[]string{actionID},
		OperationIds: &[]string{"roleOptions"}, DataScope: strPtr(platform.ScopeAll),
	}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Removing the granted node orphans its grant rows: the prune must stale
	// exactly the affected role editor, and a save that orphans nothing keeps
	// bumping nothing.
	withoutAction := slices.DeleteFunc(slices.Clone(withAction), func(node contracts.NavigationNode) bool { return node.ID == actionID })
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version + 1, Sections: listed.Sections, Nodes: withoutAction}, owner.ID); err != nil {
		t.Fatal("prune save", err)
	}
	after, err := repo.role(ctx, store.DB, role.ID)
	if err != nil || after.Version != role.Version+1 || len(after.ActionIds) != 0 {
		t.Fatalf("orphan prune version: %+v %v", after, err)
	}
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version + 2, Sections: listed.Sections, Nodes: withoutAction}, owner.ID); err != nil {
		t.Fatal("no-op save", err)
	}
	if got := *currentRoleVersion(t, ctx, repo, role.ID); got != after.Version {
		t.Fatalf("grant-free save advanced %d", got)
	}
}

func TestNavigationSurfacesStayWithinRegistration(t *testing.T) {
	ctx := context.Background()
	_, repo, admin := navigationFixture(t, ctx)

	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	section := contracts.NavigationSection{ID: "business", Surfaces: []string{"user", "administrator"}, Sort: 10, Visible: true, ShowTitle: true}
	version := listed.Version
	route := "notes"
	page := contracts.NavigationNode{ID: "notes", SectionID: "business", Surfaces: []string{"user"}, Type: "page", RouteID: &route, Visible: true, OpenMode: "same_tab", OperationIds: []string{}}
	save := func(nodes []contracts.NavigationNode) error {
		_, err := repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: version, Sections: []contracts.NavigationSection{section}, Nodes: nodes}, admin.ID)
		return err
	}

	// A business page registered for the user workspace saves with that surface.
	if err = save([]contracts.NavigationNode{page}); err != nil {
		t.Fatal("registered surface refused", err)
	}

	// Declaring the administrator workspace for it exceeds the registration: the
	// whole payload is refused, and the administrator identity running the save
	// does not lift the page-scope boundary.
	version++
	adminReach := page
	adminReach.Surfaces = []string{"user", "administrator"}
	if err = save([]contracts.NavigationNode{adminReach}); !errors.Is(err, platform.ErrInput) {
		t.Fatal("unregistered administrator surface accepted", err)
	}
	version++
	adminOnly := page
	adminOnly.Surfaces = []string{"administrator"}
	if err = save([]contracts.NavigationNode{adminOnly}); !errors.Is(err, platform.ErrInput) {
		t.Fatal("administrator-only declaration for a user page accepted", err)
	}

}
