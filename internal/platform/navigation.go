// Author: yunnuo <ymz@ebox.vip>
// Description: Registered page facts and the frontend-isomorphic default navigation tree.
package platform

import (
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/module"
)

// NavigationPages mirrors the shared page registry: every page the frontend
// registers (routes.ts minus not-found) with its presentation group and
// surface availability. Backend authorization stays authoritative.
var baseNavigationPages = []contracts.NavigationPage{
	{ID: "overview", Surfaces: []string{"user", "administrator"}},
	{ID: "lab", Surfaces: []string{"user", "administrator"}},
	{ID: "files", Surfaces: []string{"administrator"}, Permission: "files:access"},
	{ID: "announcements", Surfaces: []string{"administrator"}, Permission: "announcements:read"},
	{ID: "api-docs", Surfaces: []string{"user", "administrator"}},
	{ID: "site", Surfaces: []string{"user", "administrator"}, Permission: "settings:read", Group: "system"},
	{ID: "storage", Surfaces: []string{"administrator"}, Permission: "storage:read", Group: "system"},
	{ID: "account-policy", Surfaces: []string{"administrator"}, Permission: "settings:read", Group: "system"},
	{ID: "mail", Surfaces: []string{"administrator"}, Permission: "settings:read", Group: "system"},
	{ID: "mail-templates", Surfaces: []string{"administrator"}, Permission: "settings:read", Group: "system"},
	{ID: "notification-channels", Surfaces: []string{"administrator"}, Permission: "settings:read", Group: "system"},
	{ID: "notification-templates", Surfaces: []string{"administrator"}, Permission: "settings:read", Group: "system"},
	{ID: "system-notifications", Surfaces: []string{"administrator"}, Permission: "settings:read", Group: "system"},
	{ID: "logs", Surfaces: []string{"administrator"}, Permission: "logs:read", Group: "system"},
	{ID: "edition", Surfaces: []string{"administrator"}, Permission: "updates:read", Group: "system"},
	{ID: "users", Surfaces: []string{"administrator"}, Permission: "users:read", Group: "administration"},
	{ID: "roles", Surfaces: []string{"administrator"}, Permission: "roles:read", Group: "administration"},
	{ID: "departments", Surfaces: []string{"administrator"}, Permission: "departments:read", Group: "administration"},
	{ID: "posts", Surfaces: []string{"administrator"}, Permission: "posts:read", Group: "administration"},
	{ID: "api-operations", Surfaces: []string{"administrator"}, Permission: "roles:read", Group: "administration"},
	{ID: "menus", Surfaces: []string{"administrator"}, Permission: "menus:write", Group: "administration"},
	{ID: "dictionaries", Surfaces: []string{"administrator"}, Permission: "dictionaries:read", Group: "administration"},
	{ID: "tasks", Surfaces: []string{"administrator"}, Permission: "tasks:read", Group: "administration"},
	{ID: "account", Surfaces: []string{"user", "administrator"}, Group: "personal"},
	{ID: "account-security", Surfaces: []string{"user", "administrator"}, Group: "personal"},
	{ID: "account-sessions", Surfaces: []string{"user", "administrator"}, Group: "personal"},
}

// NavigationPages aggregates built-in pages with registered module contributions.
func NavigationPages() []contracts.NavigationPage {
	return append(append([]contracts.NavigationPage{}, baseNavigationPages...), module.NavigationPages()...)
}

// defaultPageOrder mirrors packages/web-ui/src/navigation.ts defaultPageOrder:
// the shared stable display order both seeds and editors rely on.
var defaultPageOrder = []string{
	"overview", "lab", "users", "roles", "departments", "posts", "api-operations", "menus", "dictionaries",
	"announcements", "tasks", "files", "api-docs", "site", "storage", "account-policy", "mail", "mail-templates",
	"notification-channels", "notification-templates", "system-notifications", "logs", "edition", "account", "account-security", "account-sessions",
}

// navigationRank is the shared defaultRank: builtins keep the stable table
// order, module pages sort after them by their declared Order, unregistered
// pages sort last.
func navigationRank(id string) int {
	for index, candidate := range defaultPageOrder {
		if candidate == id {
			return index
		}
	}
	rank := len(defaultPageOrder)
	for _, item := range module.All() {
		for _, page := range item.Navigation {
			if page.ID == id {
				return rank + item.Order
			}
		}
	}
	return rank + 1000
}

// navigationIcon resolves built-in icons first, then module-declared icons.
func navigationIcon(id string) string {
	if icon, ok := navigationIcons[id]; ok {
		return icon
	}
	for _, item := range module.All() {
		for _, page := range item.Navigation {
			if page.ID == id {
				return item.Icon
			}
		}
	}
	return ""
}

// navigationIcons mirrors the frontend defaultIcons table so a seeded tree and
// a client-computed default render identically.
var navigationIcons = map[string]string{
	"overview": "LayoutDashboard", "lab": "FlaskConical", "files": "FolderOpen", "site": "Settings2", "storage": "Cloud",
	"users": "UserRound", "administrators": "UserCog", "announcements": "Megaphone", "account-policy": "ShieldCheck", "mail": "Mail", "mail-templates": "Mail",
	"notification-channels": "Webhook", "notification-templates": "FileText", "system-notifications": "Bell", "logs": "ScrollText", "edition": "PackageCheck",
	"roles": "ShieldCheck", "departments": "Network", "tasks": "ListChecks", "menus": "LayoutDashboard", "dictionaries": "FileText", "posts": "UserCog",
	"api-operations": "BookOpen", "account": "UserRound", "account-security": "ShieldCheck", "account-sessions": "Monitor", "api-docs": "BookOpen",
	// Seeded directories carry the same icons as the frontend defaultNavigation.
	"administration": "Users", "personal": "UserRound",
}

func NavigationPage(id, surface string) (contracts.NavigationPage, bool) {
	for _, p := range NavigationPages() {
		if p.ID == id {
			for _, s := range p.Surfaces {
				if s == surface {
					return p, true
				}
			}
		}
	}
	return contracts.NavigationPage{}, false
}

// DefaultNavigation seeds exactly the frontend defaultNavigation model
// (packages/web-ui/src/navigation.ts): one shared tree — sections and nodes
// declare which workspaces they render in, node ids are global, and the
// three grant namespaces (menus, actions, operations) stay independent.
// Page labels stay empty strings on purpose — display names fall back to the
// frontend route registry, and only operator overrides are ever persisted.
func DefaultNavigation() contracts.Navigation {
	result := contracts.Navigation{
		Version: 0,
		Sections: []contracts.NavigationSection{
			{ID: "business", Surfaces: []string{"user", "administrator"}, Sort: 10, Visible: true, ShowTitle: true},
			{ID: "personal", Surfaces: []string{"user", "administrator"}, Sort: 20, Visible: true, ShowTitle: true},
			{ID: "system", Surfaces: []string{"administrator"}, Sort: 30, Visible: true, ShowTitle: true},
		},
		Nodes: []contracts.NavigationNode{},
	}
	// The 超级管理员 directory lives in the shared business region; the
	// 系统管理 region keeps the console pages and 个人中心 is its own shared
	// region so the same account pages are granted exactly once.
	directory := func(id string, sort int) {
		result.Nodes = append(result.Nodes, contracts.NavigationNode{ID: id, SectionID: "business", Surfaces: []string{"administrator"}, Type: "directory", Icon: navigationIcon(id),
			Sort: sort, Visible: true, OpenMode: "same_tab", OperationIds: []string{}})
	}
	directory("administration", 20)
	for _, page := range NavigationPages() {
		section := "business"
		var parent string
		switch page.Group {
		case "personal":
			section = "personal"
		case "system":
			section = "system"
		case "administration":
			parent = "administration"
		}
		node := contracts.NavigationNode{
			ID: page.ID, SectionID: section, Surfaces: append([]string{}, page.Surfaces...), Type: "page", RouteID: &page.ID,
			Sort: navigationRank(page.ID) * 10, Visible: true, OpenMode: "same_tab", OperationIds: []string{},
		}
		if icon, ok := navigationIcons[page.ID]; ok {
			node.Icon = icon
		} else {
			node.Icon = "Circle"
		}
		if parent != "" {
			node.ParentID = &parent
		}
		result.Nodes = append(result.Nodes, node)
	}
	result.Nodes = append(result.Nodes, DefaultActions(result)...)
	return result
}

func contains(ids []string, id string) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}

func text(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// NavigationFor projects one workspace from the shared tree for one user:
// sections and nodes must declare the requested surface, hidden or disabled
// ancestors suppress their descendants, and a super administrator always keeps
// a recovery entry to the menu editor so a broken tree stays repairable.
func NavigationFor(n contracts.Navigation, user contracts.User, surface string) contracts.Navigation {
	result := contracts.Navigation{Version: n.Version, Sections: []contracts.NavigationSection{}, Nodes: []contracts.NavigationNode{}}
	sections := map[string]bool{}
	for _, s := range n.Sections {
		if s.Visible && contains(s.Surfaces, surface) {
			sections[s.ID] = true
			result.Sections = append(result.Sections, s)
		}
	}
	// Resolve parents strictly inside the projected workspace.
	nodes := map[string]contracts.NavigationNode{}
	for _, node := range n.Nodes {
		if sections[node.SectionID] && contains(node.Surfaces, surface) {
			nodes[node.ID] = node
		}
	}
	allowed := func(node contracts.NavigationNode) bool {
		if !node.Visible || node.Disabled {
			return false
		}
		if IsSuper(user) {
			return true
		}
		if node.Type == "action" {
			if !Has(user, text(node.Permission)) {
				return false
			}
			for _, id := range node.OperationIds {
				if !OperationAllowed(user, id) {
					return false
				}
			}
			return user.ActionIds != nil && contains(*user.ActionIds, node.ID)
		}
		return user.MenuIds != nil && contains(*user.MenuIds, node.ID)
	}
	projected := map[string]bool{}
	for _, node := range n.Nodes {
		if !sections[node.SectionID] || !contains(node.Surfaces, surface) || !allowed(node) {
			continue
		}
		valid := true
		current := node
		ancestors := []contracts.NavigationNode{}
		seen := map[string]bool{node.ID: true}
		for current.ParentID != nil && *current.ParentID != "" {
			parent, ok := nodes[*current.ParentID]
			if !ok || seen[parent.ID] || parent.SectionID != node.SectionID || !parent.Visible || parent.Disabled || (node.Type != "action" && !allowed(parent)) {
				valid = false
				break
			}
			seen[parent.ID] = true
			ancestors = append(ancestors, parent)
			current = parent
		}
		if valid {
			if !projected[node.ID] {
				result.Nodes = append(result.Nodes, node)
				projected[node.ID] = true
			}
			// Structural ancestors do not implicitly grant their menus.
			if node.Type == "action" {
				for _, parent := range ancestors {
					if !projected[parent.ID] {
						result.Nodes = append(result.Nodes, parent)
						projected[parent.ID] = true
					}
				}
			}
		}
	}
	if surface == "administrator" && IsSuper(user) {
		found := false
		for _, node := range result.Nodes {
			if node.RouteID != nil && *node.RouteID == "menus" {
				found = true
			}
		}
		if !found {
			result.Sections = append(result.Sections, contracts.NavigationSection{ID: "recovery", Surfaces: []string{"administrator"}, Sort: 40, Visible: true, ShowTitle: true})
			route := "menus"
			result.Nodes = append(result.Nodes, contracts.NavigationNode{ID: "menus", SectionID: "recovery", Surfaces: []string{"administrator"}, Type: "page", RouteID: &route, Visible: true, OpenMode: "same_tab", OperationIds: []string{}})
		}
	}
	return result
}
