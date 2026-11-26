//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
package platformsql

import (
	"reflect"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestNavigationRegistrationRelocatesPersistedManagementPage(t *testing.T) {
	for _, hidden := range []bool{false, true} {
		t.Run(map[bool]string{false: "visible", true: "hidden ancestor"}[hidden], func(t *testing.T) {
			ctx := t.Context()
			store, repo, admin := navigationFixture(t, ctx)
			listed, err := repo.ListMenuConfig(ctx)
			if err != nil {
				t.Fatal(err)
			}
			beforeRole, err := repo.role(ctx, store.DB, "user")
			if err != nil {
				t.Fatal(err)
			}
			// A previous build placed management under a user-only business group.
			legacy := contracts.Navigation{Version: listed.Version, Sections: listed.Sections, Nodes: append([]contracts.NavigationNode{}, listed.Nodes...)}
			legacy.Nodes = append(legacy.Nodes, contracts.NavigationNode{ID: "personal-tools", SectionID: "business", Type: "directory", Surfaces: []string{"user"}, Visible: !hidden, OpenMode: "same_tab", OperationIds: []string{}})
			for i := range legacy.Nodes {
				node := &legacy.Nodes[i]
				if text(node.RouteID) == "note-management" {
					node.Surfaces = []string{"user"}
					node.ParentID = strPtr("personal-tools")
					node.Label = "Custom note moderation"
				}
				if node.Type == "action" && text(node.ParentID) == "note-management" {
					node.Surfaces = []string{"user"}
				}
			}
			tx, err := store.DB.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			if err = repo.writeNavigation(ctx, tx, legacy); err != nil {
				t.Fatal(err)
			}
			if _, err = store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
				t.Fatal(err)
			}
			if err = tx.Commit(); err != nil {
				t.Fatal(err)
			}
			// Even before startup repair, a stale stored surface cannot leak the page.
			for _, node := range platform.NavigationFor(legacy, admin, "user").Nodes {
				if text(node.RouteID) == "note-management" || node.Type == "action" && text(node.ParentID) == "note-management" {
					t.Fatal("management leaked into user workspace", node)
				}
			}
			if err = repo.EnsureNavigation(ctx); err != nil {
				t.Fatal(err)
			}
			after, err := repo.ListMenuConfig(ctx)
			if err != nil {
				t.Fatal(err)
			}
			for _, node := range after.Nodes {
				if text(node.RouteID) == "note-management" {
					if !reflect.DeepEqual(node.Surfaces, []string{"administrator"}) || node.ParentID != nil || node.Label != "Custom note moderation" || node.Visible == hidden {
						t.Fatal("management relocation lost layout intent", node)
					}
				}
				if node.Type == "action" && text(node.ParentID) == "note-management" && !reflect.DeepEqual(node.Surfaces, []string{"administrator"}) {
					t.Fatal("action reach drift", node)
				}
			}
			if _, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: after.Version, Sections: after.Sections, Nodes: after.Nodes}, admin.ID); err != nil {
				t.Fatal("repaired tree cannot be saved", err)
			}
			afterRole, err := repo.role(ctx, store.DB, "user")
			if err != nil || !reflect.DeepEqual(beforeRole, afterRole) {
				t.Fatal("surface repair changed role grants", err)
			}
			if err = repo.EnsureNavigation(ctx); err != nil {
				t.Fatal(err)
			}
			stable, err := repo.ListMenuConfig(ctx)
			if err != nil || stable.Version != after.Version+1 {
				t.Fatal("repeated startup changed navigation", stable.Version, err)
			}
		})
	}
}
