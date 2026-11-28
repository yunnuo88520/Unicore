// Author: yunnuo <ymz@ebox.vip>
// Description: Retire only the framework API reference binding without resetting operator navigation.
package platformsql

import (
	"context"
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
	for _, node := range n.Nodes {
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
	for _, node := range n.Nodes {
		if _, removed := retired[node.ID]; removed {
			continue
		}
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
