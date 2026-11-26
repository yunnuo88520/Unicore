// Author: yunnuo <ymz@ebox.vip>
// Description: Reconcile persisted page reach when code registration changes workspace ownership.
package platformsql

import (
	"context"
	"slices"
	"strings"

	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// Only invalid workspace bindings change. Labels, visibility, IDs and role/API
// grants survive; pages deleted by the operator are never recreated.
func (r *Repository) reconcileNavigationSurfaces(ctx context.Context) error {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	n, err := r.readNavigation(ctx, tx)
	if err != nil {
		return err
	}
	// readNavigation may return the shared immutable cache.
	n.Nodes = slices.Clone(n.Nodes)
	registered := map[string]contracts.NavigationPage{}
	for _, page := range platform.NavigationPages() {
		registered[page.ID] = page
	}
	sections := map[string]contracts.NavigationSection{}
	for _, section := range n.Sections {
		sections[section.ID] = section
	}
	byID := map[string]int{}
	for i, node := range n.Nodes {
		byID[node.ID] = i
	}
	defaults := platform.DefaultNavigation()
	changed := []string{}
	for i, node := range n.Nodes {
		page, ok := registered[text(node.RouteID)]
		if node.Type != "page" || !ok {
			continue
		}
		valid := []string{}
		for _, surface := range node.Surfaces {
			if slices.Contains(page.Surfaces, surface) {
				valid = append(valid, surface)
			}
		}
		if len(valid) == len(node.Surfaces) {
			continue
		}
		if len(valid) == 0 {
			valid = slices.Clone(page.Surfaces)
		}
		// Preserve an operator's hidden/disabled ancestor intent if relocation
		// needs to detach the page from that ancestor or section.
		hidden, disabled := !sections[node.SectionID].Visible, false
		seen := map[string]bool{}
		for parentID := text(node.ParentID); parentID != "" && !seen[parentID]; {
			seen[parentID] = true
			parent, exists := byID[parentID]
			if !exists {
				break
			}
			hidden = hidden || !n.Nodes[parent].Visible
			disabled = disabled || n.Nodes[parent].Disabled
			parentID = text(n.Nodes[parent].ParentID)
		}
		node.Surfaces = valid
		covers := func(surfaces []string) bool {
			for _, surface := range valid {
				if !slices.Contains(surfaces, surface) {
					return false
				}
			}
			return true
		}
		// An old user-only directory/section cannot own an administrator page.
		if !covers(sections[node.SectionID].Surfaces) {
			found := false
			for _, section := range n.Sections {
				if covers(section.Surfaces) {
					node.SectionID = section.ID
					found = true
					break
				}
			}
			if !found {
				for _, section := range defaults.Sections {
					if _, exists := sections[section.ID]; !exists && covers(section.Surfaces) {
						n.Sections = append(slices.Clone(n.Sections), section)
						sections[section.ID] = section
						node.SectionID = section.ID
						break
					}
				}
			}
		}
		if parent, exists := byID[text(node.ParentID)]; node.ParentID != nil &&
			(!exists || n.Nodes[parent].SectionID != node.SectionID || !covers(n.Nodes[parent].Surfaces)) {
			node.ParentID = nil
		}
		if hidden {
			node.Visible = false
		}
		if disabled {
			node.Disabled = true
		}
		n.Nodes[i] = node
		changed = append(changed, node.ID)
		for j, action := range n.Nodes {
			if action.Type == "action" && text(action.ParentID) == node.ID {
				action.SectionID = node.SectionID
				action.Surfaces = slices.Clone(valid)
				n.Nodes[j] = action
			}
		}
	}
	if len(changed) == 0 {
		return tx.Rollback()
	}
	if err = r.writeNavigation(ctx, tx, n); err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
		return err
	}
	if err = r.audit(audit.Target(ctx, "menus/workspace-registration", "nodes="+strings.Join(changed, ",")), tx, "system", "menus.updated"); err != nil {
		return err
	}
	return tx.Commit()
}
