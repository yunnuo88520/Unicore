// Author: yunnuo <ymz@ebox.vip>
// Description: Versioned normalized navigation with transactional replacement, legacy recovery conversion and one-time role materialization.
package platformsql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func text(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
func contains(ids []string, id string) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}

// readNavigation loads the persisted sections and nodes inside the caller's
// runner. Payloads are stored as JSON so schema evolution stays a contract
// concern instead of a column migration.
func (r *Repository) readNavigation(ctx context.Context, q sqlstore.Runner) (contracts.Navigation, error) {
	result := contracts.Navigation{Sections: []contracts.NavigationSection{}, Nodes: []contracts.NavigationNode{}}
	if err := r.Store.Row(ctx, q, "SELECT version FROM unicore_navigation_state WHERE id=1").Scan(&result.Version); err != nil {
		return result, err
	}
	for _, table := range []string{"sections", "nodes"} {
		rows, err := r.Store.Rows(ctx, q, "SELECT payload FROM unicore_navigation_"+table+" ORDER BY id")
		if err != nil {
			return result, err
		}
		err = func() error {
			defer rows.Close()
			for rows.Next() {
				var raw string
				if err := rows.Scan(&raw); err != nil {
					return err
				}
				if table == "sections" {
					var entry contracts.NavigationSection
					if err := json.Unmarshal([]byte(raw), &entry); err != nil {
						return err
					}
					result.Sections = append(result.Sections, entry)
					continue
				}
				var entry contracts.NavigationNode
				if err := json.Unmarshal([]byte(raw), &entry); err != nil {
					return err
				}
				result.Nodes = append(result.Nodes, entry)
			}
			return rows.Err()
		}()
		if err != nil {
			return result, err
		}
	}
	return result, nil
}

func (r *Repository) writeNavigation(ctx context.Context, tx *sql.Tx, n contracts.Navigation) error {
	for _, table := range []string{"nodes", "sections"} {
		if _, err := r.Store.Exec(ctx, tx, "DELETE FROM unicore_navigation_"+table); err != nil {
			return err
		}
	}
	for _, s := range n.Sections {
		raw, err := json.Marshal(s)
		if err != nil {
			return err
		}
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_navigation_sections(id,surface,payload) VALUES(?,?,?)", s.ID, s.Surface, string(raw)); err != nil {
			return err
		}
	}
	for _, s := range n.Nodes {
		raw, err := json.Marshal(s)
		if err != nil {
			return err
		}
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_navigation_nodes(id,section_id,node_type,payload) VALUES(?,?,?,?)", s.ID, s.SectionID, s.Type, string(raw)); err != nil {
			return err
		}
	}
	return nil
}

// navigationInitialized reports whether the one-time conversion already ran.
func (r *Repository) navigationInitialized(ctx context.Context, q sqlstore.Runner) (bool, error) {
	var initialized int
	if err := r.Store.Row(ctx, q, "SELECT initialized FROM unicore_navigation_state WHERE id=1").Scan(&initialized); err != nil {
		return false, err
	}
	return initialized != 0, nil
}

// EnsureNavigation runs the one-time conversion at startup: legacy menu
// overrides become normalized nodes and every role still lacking explicit
// authorizations is materialized with exact equivalents of its current reach
// (ADR-0036). Later starts see initialized=1 and change nothing, so revoked
// grants stay revoked and new operations stay denied until granted.
func (r *Repository) EnsureNavigation(ctx context.Context) error {
	return r.initializeNavigation(ctx)
}

// initializeNavigation performs the one-time upgrade conversion: legacy
// unicore_menus overrides become user-surface nodes (unknown keys stay
// disabled for repair), the registered defaults fill both surfaces, and every
// pre-existing role is materialized into explicit equivalent grants exactly
// once. Later saves never re-run it, so new permission points and operations
// are not silently expanded into old roles.
func (r *Repository) initializeNavigation(ctx context.Context) error {
	if initialized, err := r.navigationInitialized(ctx, r.Store.DB); err != nil || initialized {
		return err
	}
	legacy, err := r.listLegacyMenuConfig(ctx)
	if err != nil {
		return err
	}
	n := platform.DefaultNavigation()
	// Legacy overrides only ever described the user workspace; the
	// administrator surface keeps its registered defaults.
	sectionOf := map[string]string{}
	for _, s := range n.Sections {
		if s.Surface == "user" {
			sectionOf[s.ID] = s.ID
		}
	}
	children := map[string]bool{}
	for _, e := range legacy.Items {
		if e.ParentKey != nil && *e.ParentKey != "" {
			children[*e.ParentKey] = true
		}
	}
	// The merge index only holds user-surface nodes: legacy overrides are user
	// workspace facts, and node ids are bare route ids reused across surfaces,
	// so an id-only index would let the later administrator nodes win and
	// corrupt the admin tree with user-side overrides.
	index := map[string]int{}
	for i, node := range n.Nodes {
		if sectionOf[node.SectionID] == "" {
			continue
		}
		index[node.ID] = i
	}
	for _, e := range legacy.Items {
		id := e.MenuKey
		position, known := index[id]
		if e.Type != "link" && !known {
			if _, registered := platform.NavigationPage(e.MenuKey, "user"); registered {
				// A registered page with an override row: merge the operator
				// facts onto the default node below.
			} else {
				// Unknown keys are kept disabled so operators can repair or
				// drop them instead of silently losing configuration.
				group := e.GroupKey
				if group == "" {
					group = "workspace"
				}
				section := "user:business"
				if _, ok := sectionOf[section]; !ok {
					n.Sections = append(n.Sections, contracts.NavigationSection{ID: section, Surface: "user", Name: group, Visible: true, ShowTitle: true})
					sectionOf[section] = section
				}
				disabled := true
				node := contracts.NavigationNode{ID: id, SectionID: section, Label: e.Label, Sort: e.Sort, Visible: false, Type: "page", RouteID: &e.MenuKey, OpenMode: "same_tab", OperationIds: []string{}, Disabled: disabled}
				if p := e.ParentKey; p != nil && *p != "" {
					parent := *p
					node.ParentID = &parent
				}
				n.Nodes = append(n.Nodes, node)
				index[id] = len(n.Nodes) - 1
				continue
			}
		}
		if e.Type == "link" && !known {
			group := e.GroupKey
			if group == "" {
				group = "workspace"
			}
			section := "user:business"
			if _, ok := sectionOf[section]; !ok {
				n.Sections = append(n.Sections, contracts.NavigationSection{ID: section, Surface: "user", Name: group, Visible: true, ShowTitle: true})
				sectionOf[section] = section
			}
			url := ""
			if e.Url != nil {
				url = *e.Url
			}
			node := contracts.NavigationNode{ID: id, SectionID: section, Label: e.Label, Sort: e.Sort, Visible: e.Visible, Type: "link", Url: &url, OpenMode: "same_tab", OperationIds: []string{}}
			if p := e.ParentKey; p != nil && *p != "" {
				parent := *p
				node.ParentID = &parent
			}
			n.Nodes = append(n.Nodes, node)
			index[id] = len(n.Nodes) - 1
			continue
		}
		// Registered page override: merge operator facts onto the default node.
		node := n.Nodes[position]
		if e.Label != "" {
			node.Label = e.Label
		}
		node.Sort = e.Sort
		node.Visible = e.Visible
		if e.ParentKey != nil && *e.ParentKey != "" {
			parent := *e.ParentKey
			node.ParentID = &parent
		}
		if children[e.MenuKey] {
			// A page that carries children becomes a directory plus a target
			// leaf, mirroring the normalized model where pages cannot nest.
			leaf := node
			leaf.ID = id + ":target"
			leaf.ParentID = &id
			n.Nodes = append(n.Nodes, leaf)
			index[leaf.ID] = len(n.Nodes) - 1
			node.Type = "directory"
			node.RouteID = nil
			node.Url = nil
		}
		n.Nodes[position] = node
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	if initialized, err := r.navigationInitialized(ctx, tx); err != nil || initialized {
		return err
	}
	if err = r.writeNavigation(ctx, tx, n); err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET initialized=1,version=1 WHERE id=1"); err != nil {
		return err
	}
	if err = r.materializeRoleAuthorizations(ctx, tx, n); err != nil {
		return err
	}
	return tx.Commit()
}

// materializeRoleAuthorizations gives every legacy role explicit equivalents of
// what it could already do: all non-action navigation items of its own surface
// and the API operations its current permission points already unlocked. Empty
// stays empty from now on; nothing here widens a role.
func (r *Repository) materializeRoleAuthorizations(ctx context.Context, tx *sql.Tx, n contracts.Navigation) error {
	surfaceOfNode := map[string]string{}
	for _, s := range n.Sections {
		surfaceOfNode[s.ID] = s.Surface
	}
	rows, err := r.Store.Rows(ctx, tx, "SELECT id,realm FROM unicore_roles WHERE id<>'super_admin'")
	if err != nil {
		return err
	}
	type legacy struct{ id, realm string }
	roles := []legacy{}
	err = func() error {
		defer rows.Close()
		for rows.Next() {
			var role legacy
			if err := rows.Scan(&role.id, &role.realm); err != nil {
				return err
			}
			roles = append(roles, role)
		}
		return rows.Err()
	}()
	if err != nil {
		return err
	}
	for _, role := range roles {
		initialized, err := r.roleAuthorizationInitialized(ctx, tx, role.id)
		if err != nil {
			return err
		}
		if initialized {
			continue
		}
		permissions, err := r.rolePermissionList(ctx, tx, role.id)
		if err != nil {
			return err
		}
		menuIds := []string{}
		for _, node := range n.Nodes {
			if node.Type == "action" || surfaceOfNode[node.SectionID] != role.realm {
				continue
			}
			menuIds = append(menuIds, node.ID)
		}
		if err = r.saveRoleAuthorization(ctx, tx, role.id, role.realm, permissions, menuIds, []string{}, platform.MaterializedOperations(role.realm, permissions), n); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) roleAuthorizationInitialized(ctx context.Context, q sqlstore.Runner, roleID string) (bool, error) {
	var initialized int
	err := r.Store.Row(ctx, q, "SELECT initialized FROM unicore_role_authorizations WHERE role_id=?", roleID).Scan(&initialized)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return initialized != 0, err
}

func (r *Repository) rolePermissionList(ctx context.Context, q sqlstore.Runner, roleID string) ([]string, error) {
	rows, err := r.Store.Rows(ctx, q, "SELECT permission_id FROM unicore_role_permissions WHERE role_id=?", roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []string{}
	for rows.Next() {
		var permission string
		if err = rows.Scan(&permission); err != nil {
			return nil, err
		}
		result = append(result, permission)
	}
	return result, rows.Err()
}

// ListMenuConfig returns the versioned navigation plus the retained legacy
// rows; the legacy items stay the recovery record until the old column set is
// retired.
func (r *Repository) ListMenuConfig(ctx context.Context) (contracts.MenuList, error) {
	if err := r.initializeNavigation(ctx); err != nil {
		return contracts.MenuList{}, err
	}
	n, err := r.readNavigation(ctx, r.Store.DB)
	if err != nil {
		return contracts.MenuList{}, err
	}
	legacy, err := r.listLegacyMenuConfig(ctx)
	if err != nil {
		return contracts.MenuList{}, err
	}
	return contracts.MenuList{Items: legacy.Items, Version: n.Version, Sections: n.Sections, Nodes: n.Nodes, Pages: platform.NavigationPages}, nil
}

// validateNavigation checks a complete replacement tree: unique ids, sections
// of a known surface, registered page routes per surface, link targets, action
// grants bound to catalogue permissions and real operations, acyclic nesting
// and the depth limit.
func validateNavigation(n contracts.Navigation) error {
	sections := map[string]string{}
	for _, s := range n.Sections {
		if s.ID == "" || len(s.ID) > 64 || len(s.Name) > 240 || s.Sort < 0 || (s.Surface != "user" && s.Surface != "administrator") {
			return platform.ErrInput
		}
		if _, taken := sections[s.ID]; taken {
			return platform.ErrInput
		}
		sections[s.ID] = s.Surface
	}
	// Node ids are bare route ids shared across surfaces (frontend model), so
	// uniqueness and parent resolution are scoped per surface.
	type nodeKey struct{ surface, id string }
	nodes := map[nodeKey]contracts.NavigationNode{}
	for _, node := range n.Nodes {
		surface, ok := sections[node.SectionID]
		if !ok || node.ID == "" || len(node.ID) > 64 || node.Sort < 0 || len(node.Label) > 240 || len(node.Icon) > 64 || len(node.BadgeText) > 160 || len(node.BadgeColor) > 32 {
			return platform.ErrInput
		}
		key := nodeKey{surface, node.ID}
		if _, taken := nodes[key]; taken {
			return platform.ErrInput
		}
		nodes[key] = node
		if node.OpenMode != "same_tab" && node.OpenMode != "new_tab" {
			return platform.ErrInput
		}
		switch node.Type {
		case "directory":
			if text(node.RouteID) != "" || text(node.Url) != "" || text(node.Permission) != "" {
				return platform.ErrInput
			}
		case "page":
			if _, registered := platform.NavigationPage(text(node.RouteID), surface); !registered && !node.Disabled {
				return platform.ErrInput
			}
			if text(node.Url) != "" {
				return platform.ErrInput
			}
		case "link":
			if !validMenuURL(text(node.Url)) || text(node.RouteID) != "" {
				return platform.ErrInput
			}
		case "action":
			permission := text(node.Permission)
			if !platform.CatalogPermission(permission) || node.ParentID == nil || *node.ParentID == "" || len(node.OperationIds) == 0 {
				return platform.ErrInput
			}
			for _, id := range node.OperationIds {
				op, ok := platform.Operation(id)
				if !ok || !op.Grantable || op.Realm != surface || !contains(op.Permissions, permission) {
					return platform.ErrInput
				}
			}
		default:
			return platform.ErrInput
		}
		if node.Type != "action" && (len(node.OperationIds) > 0 || text(node.Permission) != "") {
			return platform.ErrInput
		}
	}
	for _, node := range n.Nodes {
		surface := sections[node.SectionID]
		current := node
		seen := map[string]bool{node.ID: true}
		for depth := 1; current.ParentID != nil && *current.ParentID != ""; depth++ {
			parent, ok := nodes[nodeKey{surface, *current.ParentID}]
			if !ok || parent.SectionID != node.SectionID || seen[parent.ID] || depth >= maxMenuDepth {
				return platform.ErrInput
			}
			if current.Type == "action" {
				if parent.Type != "page" {
					return platform.ErrInput
				}
			} else if parent.Type != "directory" {
				return platform.ErrInput
			}
			seen[parent.ID] = true
			current = parent
		}
		if node.ActiveMenu != nil && *node.ActiveMenu != "" {
			target, ok := nodes[nodeKey{surface, *node.ActiveMenu}]
			if !ok || sections[target.SectionID] != surface || target.Type == "action" {
				return platform.ErrInput
			}
		}
	}
	return nil
}

// SaveNavigation replaces the tree under optimistic version control. The
// cascade of guards: menu editing needs menus:write; restoring defaults or
// touching role assignments needs super_admin (assignments additionally
// roles:write), so a pure menus:write operator can never widen authorizations.
func (r *Repository) SaveNavigation(ctx context.Context, input contracts.MenuSaveInput, actor string) (contracts.MenuList, error) {
	if err := r.initializeNavigation(ctx); err != nil {
		return contracts.MenuList{}, err
	}
	n := contracts.Navigation{Version: input.Version, Sections: input.Sections, Nodes: input.Nodes}
	reset := input.Reset != nil && *input.Reset
	if reset {
		n = platform.DefaultNavigation()
	}
	if err := validateNavigation(n); err != nil {
		return contracts.MenuList{}, err
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.MenuList{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.MenuList{}, err
	}
	admin, err := r.actor(ctx, tx, actor, "menus:write")
	if err != nil {
		return contracts.MenuList{}, err
	}
	if reset && !platform.IsSuper(admin) {
		return contracts.MenuList{}, platform.ErrForbidden
	}
	if input.RoleAssignments != nil && (!platform.IsSuper(admin) || !platform.Has(admin, "roles:write")) {
		return contracts.MenuList{}, platform.ErrForbidden
	}
	result, err := r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1 AND version=?", input.Version)
	if err != nil {
		return contracts.MenuList{}, err
	}
	if affected, err := result.RowsAffected(); err == nil && affected != 1 {
		return contracts.MenuList{}, platform.ErrConflict
	}
	if err = r.writeNavigation(ctx, tx, n); err != nil {
		return contracts.MenuList{}, err
	}
	// Only assignment-bearing saves change authorizations; a pure tree edit or
	// reset re-presents the same grants, so live sessions stay valid.
	if input.RoleAssignments != nil {
		for _, assignment := range *input.RoleAssignments {
			role, err := r.role(ctx, tx, assignment.RoleID)
			if err != nil {
				return contracts.MenuList{}, err
			}
			if role.ID == "super_admin" {
				return contracts.MenuList{}, platform.ErrForbidden
			}
			if err = r.saveRoleAuthorization(ctx, tx, role.ID, role.Realm, role.Permissions, assignment.MenuIds, assignment.ActionIds, role.OperationIds, n); err != nil {
				return contracts.MenuList{}, err
			}
		}
		// Grant-affecting saves revoke live sessions so stale envelopes cannot
		// keep exercising removed buttons or menus.
		for _, table := range []string{"unicore_sessions", "unicore_administrator_sessions"} {
			if _, err = r.Store.Exec(ctx, tx, "DELETE FROM "+table); err != nil {
				return contracts.MenuList{}, err
			}
		}
	}
	if err = r.audit(audit.Target(ctx, "menus/", fmt.Sprintf("version=%d; sections=%d; nodes=%d; assignments=%d", input.Version+1, len(n.Sections), len(n.Nodes), len(derefAssignments(input.RoleAssignments)))), tx, actor, "menus.updated"); err != nil {
		return contracts.MenuList{}, err
	}
	if err = tx.Commit(); err != nil {
		return contracts.MenuList{}, err
	}
	return r.ListMenuConfig(ctx)
}

func derefAssignments(assignments *[]contracts.NavigationRoleAssignment) []contracts.NavigationRoleAssignment {
	if assignments == nil {
		return nil
	}
	return *assignments
}
