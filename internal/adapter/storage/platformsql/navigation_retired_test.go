// Author: yunnuo <ymz@ebox.vip>
// Description: Startup upgrade removes only retired framework routes and preserves custom menus and grants.
package platformsql

import (
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"reflect"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestRetireAPIDocsNavigationUpgrade(t *testing.T) {
	ctx := t.Context()
	store, repo, admin := navigationFixture(t, ctx)
	exerciseRetireAPIDocsNavigation(t, ctx, store, repo, admin)
}

func exerciseRetireAPIDocsNavigation(t *testing.T, ctx context.Context, store *sqlstore.Store, repo *Repository, admin contracts.User) {
	t.Helper()
	if err := repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	initial, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, page := range initial.Pages {
		if page.ID == "api-docs" {
			t.Fatal("builtin remains assignable")
		}
	}
	for _, node := range initial.Nodes {
		if text(node.RouteID) == "api-docs" {
			t.Fatal("fresh instance seeded docs")
		}
	}
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: "Custom navigation", Permissions: []string{"notes:access"}, MenuIds: &[]string{"notes"}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Simulate the previous build's persisted JSON (the new validator must not
	// let an operator add the retired route). A renamed node still matches;
	// an unrelated business link named API docs must survive byte for byte.
	retired := contracts.NavigationNode{ID: "renamed-framework-reference", SectionID: "system", Surfaces: []string{"administrator"}, Type: "page", RouteID: strPtr("api-docs"), Visible: false, OpenMode: "same_tab", OperationIds: []string{}}
	custom := contracts.NavigationNode{ID: "api-docs", SectionID: "business", Surfaces: []string{"user"}, Type: "link", Label: "API docs", Url: strPtr("https://example.test/business-docs"), Visible: true, OpenMode: "new_tab", OperationIds: []string{}}
	child := custom
	child.ID = "retained-child"
	child.SectionID = "system"
	child.ParentID = &retired.ID
	for _, node := range []contracts.NavigationNode{retired, custom, child} {
		raw, _ := json.Marshal(node)
		if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_navigation_nodes(id,section_id,node_type,payload) VALUES(?,?,?,?)", node.ID, node.SectionID, node.Type, string(raw)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_role_menus(role_id,menu_id) VALUES(?,?)", role.ID, retired.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, store.DB, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	updated, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]contracts.NavigationNode{}
	for _, node := range updated.Nodes {
		byID[node.ID] = node
		if text(node.RouteID) == "api-docs" {
			t.Fatal("old route survived", node)
		}
	}
	if !reflect.DeepEqual(byID[custom.ID], custom) {
		t.Fatal("business docs changed", byID[custom.ID])
	}
	if byID[child.ID].ParentID != nil || byID[child.ID].Visible {
		t.Fatal("custom child lost or revealed", byID[child.ID])
	}
	for _, node := range initial.Nodes {
		if !reflect.DeepEqual(byID[node.ID], node) {
			t.Fatal("unrelated menu changed", node.ID)
		}
	}
	roles, err := repo.ListRoles(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, saved := range roles.Items {
		if saved.ID == role.ID && (!reflect.DeepEqual(saved.Permissions, role.Permissions) || !reflect.DeepEqual(saved.MenuIds, role.MenuIds) || !reflect.DeepEqual(saved.OperationIds, role.OperationIds)) {
			t.Fatal("unrelated authorization changed", saved)
		}
	}
	for _, surface := range []string{"user", "administrator"} {
		for _, node := range platform.NavigationFor(contracts.Navigation{Version: updated.Version, Sections: updated.Sections, Nodes: updated.Nodes}, admin, surface).Nodes {
			if text(node.RouteID) == "api-docs" {
				t.Fatal("workspace retained docs")
			}
		}
	}
	if err = repo.EnsureNavigation(ctx); err != nil {
		t.Fatal(err)
	}
	again, _ := repo.ListMenuConfig(ctx)
	if again.Version != updated.Version {
		t.Fatal("startup reconciliation is not idempotent")
	}
	retired.ID = "new-retired-binding"
	retired.Disabled = true
	if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: again.Version, Sections: again.Sections, Nodes: append(again.Nodes, retired)}, admin.ID); err != platform.ErrInput {
		t.Fatal("retired page can be recreated through a disabled node", err)
	}
}
