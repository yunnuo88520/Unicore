// Author: yunnuo <ymz@ebox.vip>
// Description: Retire only the framework API reference binding without resetting operator navigation.
package platformsql

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
)

// This is startup seed reconciliation, like workspace registration changes:
// JSON payloads evolve without changing SQL schema or frozen Catalog bytes.
// Route identity, not the label or node ID, identifies the retired builtin.
// Business links (even named API docs) and all unrelated grants survive.
func (r *Repository) retireAPIDocsNavigation(ctx context.Context) error {
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
	retired := map[string]contracts.NavigationNode{}
	nodes := map[string]contracts.NavigationNode{}
	for _, node := range n.Nodes {
		nodes[node.ID] = node
		if node.Type == "page" && text(node.RouteID) == "api-docs" {
			retired[node.ID] = node
		}
	}
	if len(retired) == 0 {
		return tx.Rollback()
	}
	before, err := r.roleEditSnapshots(ctx, tx)
	if err != nil {
		return err
	}
	kept := make([]contracts.NavigationNode, 0, len(n.Nodes))
	carriers := map[string]string{}
	for _, node := range n.Nodes {
		if _, removed := retired[node.ID]; removed {
			continue
		}
		originalParent := text(node.ParentID)
		seen := map[string]bool{}
		for parent, removed := retired[text(node.ParentID)]; removed && !seen[parent.ID]; parent, removed = retired[text(node.ParentID)] {
			seen[parent.ID] = true
			node.ParentID = parent.ParentID
			// Detaching a custom child must not reveal hidden content.
			node.Visible = node.Visible && parent.Visible
			node.Disabled = node.Disabled || parent.Disabled
		}
		if _, removed := retired[text(node.ActiveMenu)]; removed {
			node.ActiveMenu = nil
		}
		if _, removed := retired[originalParent]; removed && node.Type == "action" {
			parent, exists := nodes[text(node.ParentID)]
			if !exists || parent.Type != "page" {
				// An action requires a page parent. Keep custom action IDs and
				// authorization bindings under a hidden, valid overview carrier;
				// an orphan or directory parent would block every future save.
				id := carriers[originalParent]
				if id == "" {
					for suffix := 1; ; suffix++ {
						id = fmt.Sprintf("retained-actions-%d", suffix)
						if _, taken := nodes[id]; !taken {
							break
						}
					}
					route := "overview"
					carrier := contracts.NavigationNode{ID: id, SectionID: node.SectionID, ParentID: node.ParentID, Type: "page", RouteID: &route, Surfaces: append([]string{}, retired[originalParent].Surfaces...), Sort: retired[originalParent].Sort, OpenMode: "same_tab", OperationIds: []string{}}
					nodes[id] = carrier
					kept = append(kept, carrier)
					carriers[originalParent] = id
				}
				node.ParentID = &id
			}
		}
		kept = append(kept, node)
	}
	n.Nodes = kept
	if err = r.writeNavigation(ctx, tx, n); err != nil {
		return err
	}
	for id := range retired {
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_menus WHERE menu_id=?", id); err != nil {
			return err
		}
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
		return err
	}
	if err = r.advanceChangedRoleVersions(ctx, tx, before); err != nil {
		return err
	}
	ids := []string{}
	for id := range retired {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	if err = r.audit(audit.Target(ctx, "menus/retire-api-docs", "removed="+strings.Join(ids, ",")), tx, "system", "menus.updated"); err != nil {
		return err
	}
	return tx.Commit()
}
