// Author: yunnuo <ymz@ebox.vip>
// Description: Atomic reverse menu assignments merge current role grants and revoke only affected sessions.
package platformsql

import (
	"context"
	"reflect"
	"sort"
	"strings"

	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	apispec "github.com/yunnuo/unicore/packages/contracts"
)

// AssignMenuRoles patches one menu membership, never a stale role snapshot.
// The installation lock serializes role/tree writes. The caller compares both
// the navigation version and the observed role membership of this node.
// Adding a page includes ancestors and read APIs; removing it only revokes the
// menu. API/action grants remain independent and are edited in the role editor.
func (r *Repository) AssignMenuRoles(ctx context.Context, nodeID string, input contracts.MenuRoleAssignmentInput, actor string) (contracts.RoleList, error) {
	if err := r.initializeNavigation(ctx); err != nil {
		return contracts.RoleList{}, err
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.RoleList{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.RoleList{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "roles:write"); err != nil {
		return contracts.RoleList{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "menus:write"); err != nil {
		return contracts.RoleList{}, err
	}
	nav, err := r.readNavigation(ctx, tx)
	if err != nil {
		return contracts.RoleList{}, err
	}
	if nav.Version != input.Version {
		return contracts.RoleList{}, platform.ErrConflict
	}
	nodes := map[string]contracts.NavigationNode{}
	for _, node := range nav.Nodes {
		nodes[node.ID] = node
	}
	node, ok := nodes[nodeID]
	if !ok || node.Type == "action" {
		return contracts.RoleList{}, platform.ErrInput
	}
	rows, err := r.Store.Rows(ctx, tx, "SELECT id FROM unicore_roles WHERE id<>'super_admin' ORDER BY id")
	if err != nil {
		return contracts.RoleList{}, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return contracts.RoleList{}, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return contracts.RoleList{}, err
	}
	roles := []contracts.Role{}
	current := []string{}
	known := map[string]bool{}
	for _, id := range ids {
		role, err := r.role(ctx, tx, id)
		if err != nil {
			return contracts.RoleList{}, err
		}
		roles = append(roles, role)
		known[id] = true
		if contains(role.MenuIds, nodeID) {
			current = append(current, id)
		}
	}
	expected := append([]string{}, input.ExpectedRoleIds...)
	sort.Strings(expected)
	if !reflect.DeepEqual(current, expected) {
		return contracts.RoleList{}, platform.ErrConflict
	}
	selected := map[string]bool{}
	for _, id := range input.RoleIds {
		if !known[id] || selected[id] {
			return contracts.RoleList{}, platform.ErrInput
		}
		selected[id] = true
	}
	for _, role := range roles {
		before := contains(role.MenuIds, nodeID)
		if before == selected[role.ID] {
			continue
		}
		if selected[role.ID] {
			seen := map[string]bool{}
			for cursor := node; !seen[cursor.ID]; {
				seen[cursor.ID] = true
				if !contains(role.MenuIds, cursor.ID) {
					role.MenuIds = append(role.MenuIds, cursor.ID)
				}
				if cursor.ParentID == nil {
					break
				}
				parent, ok := nodes[*cursor.ParentID]
				if !ok {
					break
				}
				cursor = parent
			}
			if node.Type == "page" && node.RouteID != nil {
				surface := "administrator"
				if contains(node.Surfaces, "user") {
					surface = "user"
				}
				for _, page := range platform.NavigationPages() {
					if page.ID == *node.RouteID && page.Permission != "" {
						if platform.SuperOnlyPermission(page.Permission) {
							return contracts.RoleList{}, platform.ErrForbidden
						}
						if !contains(role.Permissions, page.Permission) {
							role.Permissions = append(role.Permissions, page.Permission)
						}
					}
				}
				for _, op := range apispec.Operations() {
					meta, ok := platform.Operation(op.ID)
					if !ok || !meta.Grantable || meta.Method != "GET" || op.Policy.UIPage != *node.RouteID || meta.Realm != surface {
						continue
					}
					// Read helpers must fit existing points plus the page point; a GET
					// import template must not introduce users:create, for example.
					if platform.ValidOperationGrant(role.Realm, role.Permissions, op.ID) && !contains(role.OperationIds, op.ID) {
						role.OperationIds = append(role.OperationIds, op.ID)
					}
				}
			}
		} else {
			kept := []string{}
			for _, id := range role.MenuIds {
				if id != nodeID {
					kept = append(kept, id)
				}
			}
			role.MenuIds = kept
		}
		if role.ID == "user" {
			for _, point := range role.Permissions {
				if !platform.AssignablePermission(point) {
					return contracts.RoleList{}, platform.ErrForbidden
				}
			}
		}
		if err = validateGrants(role.Realm, role.Permissions); err != nil {
			return contracts.RoleList{}, err
		}
		if err = r.writeRolePermissions(ctx, tx, role.ID, role.Permissions); err != nil {
			return contracts.RoleList{}, err
		}
		if err = r.saveRoleAuthorization(ctx, tx, role.ID, role.Realm, role.Permissions, role.MenuIds, role.ActionIds, role.OperationIds, nav); err != nil {
			return contracts.RoleList{}, err
		}
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id IN (SELECT user_id FROM unicore_user_roles WHERE role_id=?)", role.ID); err != nil {
			return contracts.RoleList{}, err
		}
	}
	if err = r.audit(audit.Target(ctx, "menu/"+nodeID, "role_ids="+strings.Join(input.RoleIds, ",")), tx, actor, "roles.updated"); err != nil {
		return contracts.RoleList{}, err
	}
	if err = tx.Commit(); err != nil {
		return contracts.RoleList{}, err
	}
	return r.ListRoles(ctx)
}
