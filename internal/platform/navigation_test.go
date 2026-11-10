// Author: yunnuo <ymz@ebox.vip>
// Description: Go seed isomorphism with the frontend defaultNavigation model.
package platform

import (
	"os"
	"regexp"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
)

// frontendPageOrder extracts the authoritative defaultPageOrder from the
// shared frontend navigation model, so seed drift on either side fails here
// instead of surfacing as wrong sidebars.
func frontendPageOrder(t *testing.T) []string {
	t.Helper()
	raw, err := os.ReadFile("../../packages/web-ui/src/navigation.ts")
	if err != nil {
		t.Skipf("frontend navigation model unavailable: %v", err)
	}
	// The frontend splits the order into the builtin table plus per-module
	// `order: [...]` contributions; both sides must agree on both parts.
	match := regexp.MustCompile(`builtinPageOrder: string\[\] = \[([\s\S]*?)\];`).FindSubmatch(raw)
	if match == nil {
		t.Fatal("builtinPageOrder not found in the frontend model")
	}
	var pages []string
	for _, quoted := range regexp.MustCompile(`'([^']+)'`).FindAllSubmatch(match[1], -1) {
		pages = append(pages, string(quoted[1]))
	}
	for _, orderMatch := range regexp.MustCompile(`order: \[([^\]]*)\]`).FindAllSubmatch(raw, -1) {
		for _, quoted := range regexp.MustCompile(`'([^']+)'`).FindAllSubmatch(orderMatch[1], -1) {
			pages = append(pages, string(quoted[1]))
		}
	}
	if len(pages) == 0 {
		t.Fatal("frontend defaultPageOrder is empty")
	}
	return pages
}

func TestDefaultNavigationIsomorphicWithFrontend(t *testing.T) {
	seed := DefaultNavigation()
	surfacesOf := map[string][]string{}
	sortOf := map[string]int{}
	for _, section := range seed.Sections {
		surfacesOf[section.ID] = section.Surfaces
		sortOf[section.ID] = section.Sort
	}
	// The exact frontend sections: one shared tree with three regions.
	wantSections := map[string]int{"business": 10, "system": 30}
	if len(seed.Sections) != len(wantSections) {
		t.Fatal("section set drifted from the frontend model", seed.Sections)
	}
	for id, sort := range wantSections {
		if len(surfacesOf[id]) == 0 || sortOf[id] != sort {
			t.Fatal("missing or changed section", id, sortOf[id])
		}
	}

	// Every node label stays empty: display names are frontend fallbacks, and
	// only operator overrides may persist a label.
	pages := map[string]bool{}
	sortRank := map[string]int{}
	for index, id := range defaultPageOrder {
		sortRank[id] = index * 10
	}
	directories := 0
	for _, node := range seed.Nodes {
		if node.Type != "action" && node.Label != "" {
			t.Fatal("seeded node carries a label", node.ID, node.Label)
		}
		switch node.Type {
		case "directory":
			directories++
			// 系统设置 and 超级管理员 both seed into the administrator-only
			// system region (settings first) and 个人中心 is shared across
			// workspaces at the tail of business.
			want := map[string]string{"administration": "system", "settings": "system", "personal": "business"}
			if want[node.ID] != node.SectionID {
				t.Fatal("directory region drifted", node)
			}
		case "action":
			if node.ParentID == nil || node.Permission == nil || len(node.OperationIds) == 0 {
				t.Fatal("invalid action", node)
			}
		case "page":
			if pages[node.ID] {
				t.Fatal("duplicate page node", node.ID)
			}
			pages[node.ID] = true
			if node.RouteID == nil || *node.RouteID != node.ID {
				t.Fatal("page route mismatch", node)
			}
			// api-docs is the top-level tail of the system region instead of a
			// directory child, so it carries its own fixed sort.
			wantSort := sortRank[*node.RouteID]
			if *node.RouteID == "api-docs" {
				wantSort = 30
			}
			if node.Sort != wantSort {
				t.Fatal("page sort drifted from defaultRank", node.ID, node.Sort)
			}
			if icon := navigationIcons[*node.RouteID]; icon != "" && node.Icon != icon || icon == "" && node.Icon != "Circle" {
				t.Fatal("icon drifted from the frontend table", node.ID, node.Icon)
			}
			if page, ok := NavigationPage(*node.RouteID, "user"); ok && len(node.Surfaces) != len(page.Surfaces) {
				t.Fatal("node surfaces drifted from the registry", node.ID, node.Surfaces)
			}
		default:
			t.Fatal("unexpected default node type", node)
		}
	}
	// The API reference stays an administrator-only top-level system entry:
	// members never see it and no directory owns it.
	for _, node := range seed.Nodes {
		if node.ID != "api-docs" {
			continue
		}
		if node.SectionID != "system" || node.ParentID != nil || node.Sort != 30 ||
			!contains(node.Surfaces, "administrator") || contains(node.Surfaces, "user") {
			t.Fatal("api-docs drifted from the administrator-only system top level", node)
		}
	}
	// The 超级管理员 directory hosts every administration page; personal and
	// system pages sit directly in their shared regions.
	parentOf := map[string]string{}
	for _, node := range seed.Nodes {
		if node.ParentID != nil {
			parentOf[node.ID] = *node.ParentID
		}
	}
	for _, page := range NavigationPages() {
		switch page.Group {
		case "administration":
			if parentOf[page.ID] != "administration" {
				t.Fatal("administration page parent", page.ID, parentOf[page.ID])
			}
		case "system":
			if parentOf[page.ID] != "settings" {
				t.Fatal("system page parent", page.ID, parentOf[page.ID])
			}
		case "personal":
			if parentOf[page.ID] != "personal" {
				t.Fatal("personal page parent", page.ID, parentOf[page.ID])
			}
		}
	}
	// The three directories and the single action namespace.
	if directories != 3 {
		t.Fatal("expected the three directories", directories)
	}

	// Registry parity with the exported frontend page order: same set, and the
	// shared order array matches the frontend byte for byte.
	registry := map[string]bool{}
	for _, page := range NavigationPages() {
		registry[page.ID] = true
	}
	frontendOrder := frontendPageOrder(t)
	for _, id := range frontendOrder {
		if !registry[id] {
			t.Fatal("frontend page missing from the Go registry", id)
		}
	}
	for id := range registry {
		if !contains(defaultPageOrder, id) && !contains(frontendOrder, id) {
			t.Fatal("Go registry page missing from the frontend order", id)
		}
	}

	// NavigationFor keeps the projection inside one workspace: the member view
	// shows the shared regions without the administrator-only entries, the
	// administrator view carries both directories and console pages.
	member := NavigationFor(seed, contracts.User{Roles: []string{"super_admin"}}, "user")
	if len(member.Sections) != 1 {
		t.Fatal("user projection sections", member.Sections)
	}
	for _, node := range member.Nodes {
		if !contains(node.Surfaces, "user") {
			t.Fatal("user projection leaked an administrator-only node", node.ID)
		}
	}
	admin := NavigationFor(seed, contracts.User{Roles: []string{"super_admin"}}, "administrator")
	if len(admin.Sections) != 2 {
		t.Fatal("administrator projection sections", admin.Sections)
	}
	// The 超级管理员 directory rides the system region: the business top level
	// keeps only shared/business entries, and system hosts both admin directories.
	for _, node := range member.Nodes {
		if node.ID == "administration" {
			t.Fatal("administration directory leaked into the member projection", node)
		}
	}
	adminTopLevel := map[string]string{}
	for _, node := range admin.Nodes {
		if node.ParentID == nil || *node.ParentID == "" {
			adminTopLevel[node.ID] = node.SectionID
		}
	}
	if adminTopLevel["administration"] != "system" || adminTopLevel["settings"] != "system" || adminTopLevel["personal"] != "business" {
		t.Fatal("administrator top-level regions drifted", adminTopLevel)
	}
	// A page registered on both surfaces is granted once and appears in both
	// projections under the same id.
	if _, ok := pages["account"]; ok {
		memberIDs := map[string]bool{}
		for _, node := range member.Nodes {
			memberIDs[node.ID] = true
		}
		adminIDs := map[string]bool{}
		for _, node := range admin.Nodes {
			adminIDs[node.ID] = true
		}
		if !memberIDs["account"] || !adminIDs["account"] {
			t.Fatal("dual-surface page missing from a projection")
		}
	}
}
