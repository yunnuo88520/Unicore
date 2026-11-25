// Author: yunnuo <ymz@ebox.vip>
// Description: Preserve stored unavailable menu bindings without accepting new invalid authorization targets.
package platformsql

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestNavigationUnavailableCatalogueBindings(t *testing.T) {
	ctx := t.Context()
	store, repo, admin := navigationFixture(t, ctx)
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	// Simulate a persisted tree from a build that registered a now absent module.
	page := contracts.NavigationNode{ID: "retired-page", SectionID: "business", Type: "page", RouteID: strPtr("retired"), Surfaces: []string{"user"}, Visible: true, OpenMode: "same_tab", OperationIds: []string{}}
	action := contracts.NavigationNode{ID: "retired-action", SectionID: "business", Type: "action", ParentID: &page.ID, Permission: strPtr("retired:read"), OperationIds: []string{"readRetired"}, Surfaces: []string{"user"}, Visible: true, OpenMode: "same_tab"}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err = repo.writeNavigation(ctx, tx, contracts.Navigation{Sections: listed.Sections, Nodes: append(listed.Nodes, page, action)}); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		"UPDATE unicore_navigation_state SET version=version+1 WHERE id=1",
		"INSERT INTO unicore_role_menus(role_id,menu_id) VALUES('user','retired-page')",
		"INSERT INTO unicore_role_actions(role_id,action_id) VALUES('user','retired-action')",
	} {
		if _, err = store.Exec(ctx, tx, statement); err != nil {
			t.Fatal(err)
		}
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	before, err := repo.role(ctx, store.DB, "user")
	if err != nil {
		t.Fatal(err)
	}
	listed, err = repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	input := contracts.MenuSaveInput{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes}
	// Copy the HTTP payload: readNavigation's cached slices are read-only.
	clone := func() contracts.MenuSaveInput {
		t.Helper()
		raw, err := json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
		var copy contracts.MenuSaveInput
		if err = json.Unmarshal(raw, &copy); err != nil {
			t.Fatal(err)
		}
		return copy
	}
	changed := clone()
	for i := range changed.Nodes {
		if changed.Nodes[i].ID == "menus" {
			changed.Nodes[i].Label = "Layout edit with an unavailable module"
		}
	}
	saved, err := repo.SaveNavigation(ctx, changed, admin.ID)
	if err != nil {
		t.Fatalf("stored unavailable bindings blocked layout save: %v", err)
	}
	input = contracts.MenuSaveInput{Version: saved.Version, Sections: saved.Sections, Nodes: saved.Nodes}
	after, err := repo.role(ctx, store.DB, "user")
	if err != nil || !reflect.DeepEqual(before, after) {
		t.Fatalf("layout save changed role state: before=%+v after=%+v err=%v", before, after, err)
	}
	for _, test := range []struct {
		name string
		edit func(*contracts.MenuSaveInput)
	}{
		{"new page", func(n *contracts.MenuSaveInput) { p := page; p.ID = "new-retired-page"; n.Nodes = append(n.Nodes, p) }},
		{"new action", func(n *contracts.MenuSaveInput) {
			a := action
			a.ID = "new-retired-action"
			n.Nodes = append(n.Nodes, a)
		}},
		{"changed route", func(n *contracts.MenuSaveInput) {
			for i := range n.Nodes {
				if n.Nodes[i].ID == page.ID {
					n.Nodes[i].RouteID = strPtr("another-retired")
				}
			}
		}},
		{"changed permission", func(n *contracts.MenuSaveInput) {
			for i := range n.Nodes {
				if n.Nodes[i].ID == action.ID {
					n.Nodes[i].Permission = strPtr("retired:write")
				}
			}
		}},
		{"changed operation", func(n *contracts.MenuSaveInput) {
			for i := range n.Nodes {
				if n.Nodes[i].ID == action.ID {
					n.Nodes[i].OperationIds = []string{"writeRetired"}
				}
			}
		}},
		{"changed action parent", func(n *contracts.MenuSaveInput) {
			for i := range n.Nodes {
				if n.Nodes[i].ID == action.ID {
					n.Nodes[i].ParentID = strPtr("overview")
				}
			}
		}},
		{"expanded page surfaces", func(n *contracts.MenuSaveInput) {
			for i := range n.Nodes {
				if n.Nodes[i].ID == page.ID {
					n.Nodes[i].Surfaces = []string{"user", "administrator"}
				}
			}
		}},
		{"expanded action surfaces", func(n *contracts.MenuSaveInput) {
			for i := range n.Nodes {
				if n.Nodes[i].ID == action.ID {
					n.Nodes[i].Surfaces = []string{"user", "administrator"}
				}
			}
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			invalid := clone()
			test.edit(&invalid)
			if _, err := repo.SaveNavigation(ctx, invalid, admin.ID); !errors.Is(err, platform.ErrInput) {
				t.Fatalf("invalid binding accepted: %v", err)
			}
			current, err := repo.ListMenuConfig(ctx)
			if err != nil || current.Version != input.Version {
				t.Fatalf("rejected save changed navigation: version=%d err=%v", current.Version, err)
			}
		})
	}
	// Disabled unknown pages are intentionally allowed for repair. A first save
	// of such a page must not make a second save eligible to enable it.
	disabled := page
	disabled.ID = "disabled-unknown"
	disabled.Disabled = true
	draft := clone()
	draft.Nodes = append(draft.Nodes, disabled)
	saved, err = repo.SaveNavigation(ctx, draft, admin.ID)
	if err != nil {
		t.Fatal("disabled repair page", err)
	}
	input = contracts.MenuSaveInput{Version: saved.Version, Sections: saved.Sections, Nodes: saved.Nodes}
	draft = clone()
	for i := range draft.Nodes {
		if draft.Nodes[i].ID == disabled.ID {
			draft.Nodes[i].Disabled = false
		}
	}
	if _, err = repo.SaveNavigation(ctx, draft, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("disabled unknown page could be enabled through a second save", err)
	}
}

func TestNavigationStoredBindingsDoNotOverrideCurrentCatalogue(t *testing.T) {
	section := contracts.NavigationSection{ID: "business", Surfaces: []string{"user", "administrator"}, Visible: true}
	page := contracts.NavigationNode{ID: "page", SectionID: section.ID, Type: "page", RouteID: strPtr("overview"), Surfaces: []string{"user"}, Visible: true, OpenMode: "same_tab"}
	action := contracts.NavigationNode{ID: "action", SectionID: section.ID, Type: "action", ParentID: &page.ID, Permission: strPtr("users:update"), OperationIds: []string{"listUsers"}, Surfaces: []string{"user"}, Visible: true, OpenMode: "same_tab"}
	for _, test := range []struct {
		name  string
		nodes []contracts.NavigationNode
	}{
		{"registered route on wrong surface", []contracts.NavigationNode{func() contracts.NavigationNode { p := page; p.RouteID = strPtr("menus"); return p }()}},
		{"registered operation outside permission", []contracts.NavigationNode{page, action}},
		{"registered reserved operation", []contracts.NavigationNode{page, func() contracts.NavigationNode {
			a := action
			a.Permission = strPtr("roles:write")
			a.OperationIds = []string{"createRole"}
			return a
		}()}},
		{"unavailable route with cycle", []contracts.NavigationNode{func() contracts.NavigationNode {
			p := page
			p.RouteID = strPtr("retired")
			p.ParentID = &p.ID
			return p
		}()}},
	} {
		t.Run(test.name, func(t *testing.T) {
			n := contracts.Navigation{Sections: []contracts.NavigationSection{section}, Nodes: test.nodes}
			if err := validateNavigation(n, n); !errors.Is(err, platform.ErrInput) {
				t.Fatalf("stored invalid binding bypassed current catalogue or structure checks: %v", err)
			}
		})
	}
}
