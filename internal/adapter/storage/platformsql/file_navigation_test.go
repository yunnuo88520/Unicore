// Author: yunnuo <ymz@ebox.vip>
// Description: New file governance joins old instances once, respects deletions and stays super-only.
package platformsql

import (
	"slices"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestFileNavigationUpgradeAndDeletion(t *testing.T) {
	ctx := t.Context()
	store, repo, admin := navigationFixture(t, ctx)
	list, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	withoutFiles := func(nodes []contracts.NavigationNode) []contracts.NavigationNode {
		return slices.DeleteFunc(slices.Clone(nodes), func(n contracts.NavigationNode) bool { return n.ID == "files" })
	}
	// Reproduce an installed tree and seed marker from before files existed.
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: list.Version, Sections: list.Sections, Nodes: withoutFiles(list.Nodes)}, admin.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, store.DB, "UPDATE unicore_system_settings SET setting_value=? WHERE setting_key=?", "ai-management,ai-access,ai-tools,ai-calls", aiSeedMarker); err != nil {
		t.Fatal(err)
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	list, err = repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	index := slices.IndexFunc(list.Nodes, func(n contracts.NavigationNode) bool { return n.ID == "files" })
	if index < 0 || list.Nodes[index].ParentID != nil || list.Nodes[index].SectionID != "system" || list.Nodes[index].Sort != 27 {
		t.Fatal("missing or incorrectly placed file menu", list.Nodes)
	}
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: list.Version, Sections: list.Sections, Nodes: withoutFiles(list.Nodes)}, admin.ID); err != nil {
		t.Fatal(err)
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	list, err = repo.ListMenuConfig(ctx)
	if err != nil || slices.ContainsFunc(list.Nodes, func(n contracts.NavigationNode) bool { return n.ID == "files" }) {
		t.Fatal("operator deletion resurrected", err)
	}
}

func TestFileNavigationRemainsSuperOnly(t *testing.T) {
	n := platform.DefaultNavigation()
	ids := []string{}
	for _, node := range n.Nodes {
		ids = append(ids, node.ID)
	}
	reader := contracts.User{ID: "reader", Roles: []string{"custom"}, Permissions: []string{"storage:read"}, MenuIds: &ids}
	view := platform.NavigationFor(n, reader, "administrator")
	if slices.ContainsFunc(view.Nodes, func(node contracts.NavigationNode) bool { return node.ID == "files" }) {
		t.Fatal("file governance projected to non-super")
	}
}
