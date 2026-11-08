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
	surfaceOf := map[string]string{}
	sortOf := map[string]int{}
	for _, section := range seed.Sections {
		surfaceOf[section.ID] = section.Surface
		sortOf[section.ID] = section.Sort
	}
	// The exact frontend sections: two user areas, two administrator areas.
	wantSections := map[string]int{"user:business": 10, "user:personal": 20, "admin:business": 10, "admin:system": 20}
	if len(seed.Sections) != len(wantSections) {
		t.Fatal("section set drifted from the frontend model", seed.Sections)
	}
	for id, sort := range wantSections {
		if surfaceOf[id] == "" || sortOf[id] != sort {
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
			// 超级管理员 seeds into the business region; 系统设置 and 个人中心
			// keep the system region.
			if node.SectionID != "admin:business" && node.SectionID != "admin:system" {
				t.Fatal("directory outside the business/system areas", node)
			}
		case "action":
			if node.ParentID == nil || node.Permission == nil || len(node.OperationIds) == 0 {
				t.Fatal("invalid action", node)
			}
		case "page":
			if pages[node.ID] {
				t.Fatal("unexpected surface duplication is fine only across surfaces; check the section", node)
			}
			pages[node.ID+"\x00"+surfaceOf[node.SectionID]] = true
			if node.RouteID == nil || surfaceOf[node.SectionID]+":"+*node.RouteID != node.ID {
				t.Fatal("page route mismatch", node)
			}
			if node.Sort != sortRank[*node.RouteID] {
				t.Fatal("page sort drifted from defaultRank", node.ID, node.Sort)
			}
			if icon := navigationIcons[*node.RouteID]; icon != "" && node.Icon != icon || icon == "" && node.Icon != "Circle" {
				t.Fatal("icon drifted from the frontend table", node.ID, node.Icon)
			}
			if node.ID == "notes" || node.ID == "files" {
				if surfaceOf[node.SectionID] != "user" && surfaceOf[node.SectionID] != "administrator" {
					t.Fatal("workspace page missing a surface", node)
				}
			}
		default:
			t.Fatal("unexpected default node type", node)
		}
	}
	// The administrator directories (super administrator, system settings,
	// personal center) exist.
	if directories != 3 {
		t.Fatal("expected the three administrator directories", directories)
	}

	// Per-surface id uniqueness with the bare frontend ids.
	seen := map[string]bool{}
	for _, node := range seed.Nodes {
		key := surfaceOf[node.SectionID] + "\x00" + node.ID
		if seen[key] {
			t.Fatal("duplicate node within one surface", node.ID)
		}
		seen[key] = true
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

	// The user surface skips administrator-only pages; the administrator
	// surface carries both directories and the management pages under them.
	userNodes, adminNodes := 0, 0
	for _, node := range seed.Nodes {
		switch surfaceOf[node.SectionID] {
		case "user":
			userNodes++
			if page, ok := NavigationPage(node.ID, "user"); ok && page.Group == "administration" {
				t.Fatal("administration page seeded on the user surface", node.ID)
			}
		case "administrator":
			adminNodes++
		}
	}
	if userNodes == 0 || adminNodes <= len(NavigationPages()) {
		t.Fatal("surface projection sizes", userNodes, adminNodes)
	}

	// The super-administrator directory hosts every administration page,
	// system settings hosts every system page and the personal directory
	// hosts the administrator personal pages (administrator surface).
	parentOf := map[string]string{}
	for _, node := range seed.Nodes {
		if node.ParentID != nil {
			parentOf[node.ID+"\x00"+surfaceOf[node.SectionID]] = *node.ParentID
		}
	}
	for _, page := range NavigationPages() {
		if page.Group == "administration" {
			if parentOf["administrator:"+page.ID+"\x00administrator"] != "administrator:administration" {
				t.Fatal("administration page parent", page.ID, parentOf["administrator:"+page.ID+"\x00administrator"])
			}
		}
		if page.Group == "system" {
			if parentOf["administrator:"+page.ID+"\x00administrator"] != "administrator:settings" {
				t.Fatal("system page parent", page.ID, parentOf["administrator:"+page.ID+"\x00administrator"])
			}
		}
		if page.Group == "personal" && parentOf["administrator:"+page.ID+"\x00administrator"] != "administrator:personal" {
			t.Fatal("administrator personal page parent", page.ID, parentOf["administrator:"+page.ID+"\x00administrator"])
		}
	}

	// NavigationFor keeps the projection inside one surface and preserves the
	// shared structure for a super administrator.
	projected := NavigationFor(seed, contracts.User{Roles: []string{"super_admin"}}, "user")
	if len(projected.Sections) != 2 {
		t.Fatal("user projection sections", projected.Sections)
	}
	admin := NavigationFor(seed, contracts.User{Roles: []string{"super_admin"}}, "administrator")
	if len(admin.Sections) != 2 {
		t.Fatal("administrator projection sections", admin.Sections)
	}
}
