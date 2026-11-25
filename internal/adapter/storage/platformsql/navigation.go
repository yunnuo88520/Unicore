// Author: yunnuo <ymz@ebox.vip>
// Description: Versioned normalized navigation with transactional replacement and forward-compatible top-ups.
package platformsql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// maxMenuDepth bounds nesting inside the shared tree: a top-level node is
// depth 1.
const maxMenuDepth = 5

// validMenuURL accepts absolute http(s) URLs and in-site relative paths
// starting with a single slash; anything else (other schemes, protocol-relative
// hosts, whitespace or control characters) is refused.
func validMenuURL(raw string) bool {
	if raw == "" || len(raw) > 2048 || strings.ContainsFunc(raw, func(r rune) bool { return r <= ' ' || r == '\x7f' }) {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil {
		return false
	}
	if strings.HasPrefix(raw, "/") {
		// A double slash is a protocol-relative host reference, not a path.
		return !strings.HasPrefix(raw, "//") && parsed.Scheme == "" && parsed.Host == ""
	}
	return (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}

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
	// Session resolution re-reads the tree on every authenticated request; the
	// version row is the invalidation source, so a matching cached copy skips
	// the full table scan and JSON decode. Callers treat the result as
	// read-only (projection builds fresh slices).
	r.navMu.Lock()
	if r.navHas && r.navVersion == result.Version {
		cached := r.navCache
		r.navMu.Unlock()
		return cached, nil
	}
	r.navMu.Unlock()
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
	r.navMu.Lock()
	r.navCache = result
	r.navVersion = result.Version
	r.navHas = true
	r.navMu.Unlock()
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
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_navigation_sections(id,surface,payload) VALUES(?,?,?)", s.ID, strings.Join(s.Surfaces, ","), string(raw)); err != nil {
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

// EnsureNavigation seeds the shared tree on first boot and tops it up for
// newer builds: action nodes the current contract catalogue derives but the
// persisted tree lacks become grantable, and the monitor and AI-management
// regions join trees seeded before those capabilities existed. There are no
// legacy conversions: an instance is either freshly seeded from the current
// default or already carries the shared tree, and revoked grants stay revoked
// while new operations stay denied until granted explicitly.
func (r *Repository) EnsureNavigation(ctx context.Context) error {
	if err := r.initializeNavigation(ctx); err != nil {
		return err
	}
	if err := r.backfillRegisteredActions(ctx); err != nil {
		return err
	}
	if err := r.ensureMonitorNavigation(ctx); err != nil {
		return err
	}
	return r.ensureAINavigation(ctx)
}

// monitorSeedOrder lists the runtime monitor entries in seed order; later
// releases append new ids (P1 added monitor-events), and the persisted marker
// records which ids a tree has ever received so operator deletions survive
// restarts while genuinely new entries still join.
var monitorSeedOrder = []string{"monitor-center", "monitor", "monitor-services", "monitor-resources", "monitor-events"}

const monitorSeedMarker = "_navigation_monitor_seeded"

// aiSeedOrder lists the AI-management entries in seed order; the top-up adds
// nodes a tree seeded before the MCP capability lacks, mirroring the monitor
// seed contract.
var aiSeedOrder = []string{"ai-management", "ai-access", "ai-tools", "ai-calls"}

const aiSeedMarker = "_navigation_ai_seeded"

// ensureMonitorNavigation introduces the runtime monitor entries on instances
// whose persisted tree predates them. Missing nodes join with their seeded
// defaults (empty labels, default sorts), every operator customization stays
// untouched, and the marker lists the node ids this tree has ever received —
// so a monitor node an operator deleted is never resurrected on restart,
// while ids added by later releases (absent from the marker) still join.
// The legacy "1" marker means every pre-P1 entry was already handled.
// Pre-monitor deletions of unrelated pages stay deleted because only these
// ids are ever considered.
func (r *Repository) ensureMonitorNavigation(ctx context.Context) error {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	var seeded string
	if err = r.Store.Row(ctx, tx, "SELECT setting_value FROM unicore_system_settings WHERE setting_key=?", monitorSeedMarker).Scan(&seeded); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	markerExists := err == nil
	received := map[string]bool{}
	if seeded == "1" {
		// Legacy marker: the P0 merge already ran for every pre-P1 entry.
		for _, id := range monitorSeedOrder[:4] {
			received[id] = true
		}
	} else if seeded != "" {
		for _, id := range strings.Split(seeded, ",") {
			received[id] = true
		}
	}
	n, err := r.readNavigation(ctx, tx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return tx.Rollback()
		}
		return err
	}
	existing := map[string]bool{}
	for _, node := range n.Nodes {
		existing[node.ID] = true
	}
	missing := []contracts.NavigationNode{}
	added := []string{}
	for _, node := range platform.DefaultNavigation().Nodes {
		if !slices.Contains(monitorSeedOrder, node.ID) || existing[node.ID] || received[node.ID] {
			continue
		}
		missing = append(missing, node)
		added = append(added, node.ID)
	}
	for _, id := range monitorSeedOrder {
		if existing[id] {
			received[id] = true
		}
	}
	if len(missing) > 0 {
		n.Nodes = append(n.Nodes, missing...)
		if err = r.writeNavigation(ctx, tx, n); err != nil {
			return err
		}
		if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
			return err
		}
		if err = r.audit(audit.Target(ctx, "menus/monitor-seed", "nodes="+strings.Join(added, ",")), tx, "system", "menus.updated"); err != nil {
			return err
		}
	}
	receivedList := make([]string, 0, len(received))
	for _, id := range monitorSeedOrder {
		if received[id] {
			receivedList = append(receivedList, id)
		}
	}
	// The installation lock serializes the earlier existence check and this
	// write. Use portable SQL, including when an unchanged MySQL UPDATE reports
	// zero affected rows on a repeated startup.
	if markerExists {
		_, err = r.Store.Exec(ctx, tx, "UPDATE unicore_system_settings SET setting_value=? WHERE setting_key=?", strings.Join(receivedList, ","), monitorSeedMarker)
	} else {
		_, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES(?,?)", monitorSeedMarker, strings.Join(receivedList, ","))
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

// ensureAINavigation tops persisted trees up with the AI-management directory
// and pages: idempotent by marker plus existence, audited, and version-bumped
// so editors holding stale snapshots refresh.
func (r *Repository) ensureAINavigation(ctx context.Context) error {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	var seeded string
	if err = r.Store.Row(ctx, tx, "SELECT setting_value FROM unicore_system_settings WHERE setting_key=?", aiSeedMarker).Scan(&seeded); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	markerExists := err == nil
	received := map[string]bool{}
	for _, id := range strings.Split(seeded, ",") {
		if id != "" {
			received[id] = true
		}
	}
	n, err := r.readNavigation(ctx, tx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return tx.Rollback()
		}
		return err
	}
	existing := map[string]bool{}
	for _, node := range n.Nodes {
		existing[node.ID] = true
	}
	missing := []contracts.NavigationNode{}
	added := []string{}
	for _, node := range platform.DefaultNavigation().Nodes {
		if !slices.Contains(aiSeedOrder, node.ID) || existing[node.ID] || received[node.ID] {
			continue
		}
		missing = append(missing, node)
		added = append(added, node.ID)
	}
	for _, id := range aiSeedOrder {
		if existing[id] {
			received[id] = true
		}
	}
	if len(missing) > 0 {
		n.Nodes = append(n.Nodes, missing...)
		if err = r.writeNavigation(ctx, tx, n); err != nil {
			return err
		}
		if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
			return err
		}
		if err = r.audit(audit.Target(ctx, "menus/ai-seed", "nodes="+strings.Join(added, ",")), tx, "system", "menus.updated"); err != nil {
			return err
		}
	}
	receivedList := make([]string, 0, len(received))
	for _, id := range aiSeedOrder {
		if received[id] {
			receivedList = append(receivedList, id)
		}
	}
	if markerExists {
		_, err = r.Store.Exec(ctx, tx, "UPDATE unicore_system_settings SET setting_value=? WHERE setting_key=?", strings.Join(receivedList, ","), aiSeedMarker)
	} else {
		_, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES(?,?)", aiSeedMarker, strings.Join(receivedList, ","))
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) backfillRegisteredActions(ctx context.Context) error {
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
		if errors.Is(err, sql.ErrNoRows) {
			return tx.Rollback()
		}
		return err
	}
	existing := map[string]bool{}
	for _, node := range n.Nodes {
		existing[node.ID] = true
	}
	missing := []contracts.NavigationNode{}
	ids := []string{}
	for _, action := range platform.DefaultActions(n) {
		if existing[action.ID] {
			continue
		}
		missing = append(missing, action)
		ids = append(ids, action.ID)
	}
	if len(missing) == 0 {
		return tx.Rollback()
	}
	n.Nodes = append(n.Nodes, missing...)
	if err = r.writeNavigation(ctx, tx, n); err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
		return err
	}
	if err = r.audit(audit.Target(ctx, "menus/backfill", "actions="+strings.Join(ids, ",")), tx, "system", "menus.updated"); err != nil {
		return err
	}
	return tx.Commit()
}

// initializeNavigation seeds the registered default tree exactly once, before
// any operator override exists, and writes the builtin user role's default
// visibility: every user-surface menu plus the action nodes its seeded points
// and operation grants already cover. This default reach is explicit stored
// state written once at first boot; custom roles start empty, and no later
// startup widens any role (ADR-0050).
func (r *Repository) initializeNavigation(ctx context.Context) error {
	if initialized, err := r.navigationInitialized(ctx, r.Store.DB); err != nil || initialized {
		return err
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
	n := platform.DefaultNavigation()
	if err = r.writeNavigation(ctx, tx, n); err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET initialized=1,version=1 WHERE id=1"); err != nil {
		return err
	}
	permissions, err := r.rolePermissionList(ctx, tx, "user")
	if err != nil {
		return err
	}
	operations := r.roleIDSet(ctx, tx, "user")
	menus, actions := []string{}, []string{}
	for _, node := range n.Nodes {
		if !contains(node.Surfaces, "user") {
			continue
		}
		if node.Type == "action" {
			if node.Permission != nil && contains(permissions, *node.Permission) {
				covered := len(node.OperationIds) > 0
				for _, id := range node.OperationIds {
					if !operations[id] {
						covered = false
					}
				}
				if covered {
					actions = append(actions, node.ID)
				}
			}
			continue
		}
		menus = append(menus, node.ID)
	}
	for _, id := range menus {
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_role_menus(role_id,menu_id) SELECT 'user',? WHERE NOT EXISTS (SELECT 1 FROM unicore_role_menus WHERE role_id='user' AND menu_id=?)", id, id); err != nil {
			return err
		}
	}
	for _, id := range actions {
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_role_actions(role_id,action_id) SELECT 'user',? WHERE NOT EXISTS (SELECT 1 FROM unicore_role_actions WHERE role_id='user' AND action_id=?)", id, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// rolePermissionList reads a role's stored permission points.
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

// roleIDSet reads a role's operation grant ids into a set; a read failure
// yields an empty set, which only shrinks the seeded default reach.
func (r *Repository) roleIDSet(ctx context.Context, tx *sql.Tx, roleID string) map[string]bool {
	rows, err := r.Store.Rows(ctx, tx, "SELECT operation_id FROM unicore_role_operations WHERE role_id=?", roleID)
	set := map[string]bool{}
	if err != nil {
		return set
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return set
		}
		set[id] = true
	}
	return set
}

// ListMenuConfig returns the versioned shared tree with the registered page
// facts; the editor consumes sections, nodes and version.
func (r *Repository) ListMenuConfig(ctx context.Context) (contracts.MenuList, error) {
	if err := r.initializeNavigation(ctx); err != nil {
		return contracts.MenuList{}, err
	}
	n, err := r.readNavigation(ctx, r.Store.DB)
	if err != nil {
		return contracts.MenuList{}, err
	}
	return contracts.MenuList{Version: n.Version, Sections: n.Sections, Nodes: n.Nodes, Pages: platform.NavigationPages()}, nil
}

// validateNavigation checks a complete replacement tree: unique global ids,
// surfaces declared on sections and nodes, registered page routes for every
// declared surface, link targets, action grants bound to catalogue
// permissions and real operations, acyclic nesting and the depth limit.
// Parents are type-aware: actions hang under pages only and every other
// node nests under any non-action node. Missing catalogue entries may survive
// only through an unchanged binding already persisted by an earlier build.
func validateNavigation(n, previous contracts.Navigation) error {
	previousNodes := make(map[string]contracts.NavigationNode, len(previous.Nodes))
	for _, node := range previous.Nodes {
		previousNodes[node.ID] = node
	}
	pages := map[string]bool{}
	for _, page := range platform.NavigationPages() {
		pages[page.ID] = true
	}
	sections := map[string]bool{}
	for _, s := range n.Sections {
		if s.ID == "" || len(s.ID) > 64 || len(s.Name) > 240 || s.Sort < 0 || len(s.Surfaces) == 0 {
			return platform.ErrInput
		}
		for _, surface := range s.Surfaces {
			if surface != "user" && surface != "administrator" {
				return platform.ErrInput
			}
		}
		if _, taken := sections[s.ID]; taken {
			return platform.ErrInput
		}
		sections[s.ID] = true
	}
	// Node ids are globally unique in the shared tree; parents resolve within
	// the same section.
	nodes := map[string]contracts.NavigationNode{}
	for _, node := range n.Nodes {
		if !sections[node.SectionID] || node.ID == "" || len(node.ID) > 64 || node.Sort < 0 || len(node.Label) > 240 || len(node.Icon) > 64 || len(node.BadgeText) > 160 || len(node.BadgeColor) > 32 {
			return platform.ErrInput
		}
		if _, taken := nodes[node.ID]; taken {
			return platform.ErrInput
		}
		if len(node.Surfaces) == 0 {
			return platform.ErrInput
		}
		for _, surface := range node.Surfaces {
			if surface != "user" && surface != "administrator" {
				return platform.ErrInput
			}
		}
		nodes[node.ID] = node
		if node.OpenMode != "same_tab" && node.OpenMode != "new_tab" {
			return platform.ErrInput
		}
		old, exists := previousNodes[node.ID]
		preserved := exists && sameNavigationBinding(old, node)
		switch node.Type {
		case "directory":
			if text(node.RouteID) != "" || text(node.Url) != "" || text(node.Permission) != "" {
				return platform.ErrInput
			}
		case "page":
			registered := 0
			for _, surface := range node.Surfaces {
				if _, ok := platform.NavigationPage(text(node.RouteID), surface); ok {
					registered++
				}
			}
			// Every declared surface must be registered for the page: a menu may
			// not widen a page's reach beyond its registration, so declaring an
			// unregistered extra workspace (a business page pulled into the
			// administrator console) refuses the whole payload. An explicitly
			// disabled node may reference any page so operators can repair or
			// drop it instead of losing configuration.
			// A removed module can leave stored routes absent from this build.
			// Keep their original binding, but never widen a registered page's
			// declared surfaces or introduce an unavailable active route.
			if registered != len(node.Surfaces) && !node.Disabled && (pages[text(node.RouteID)] || !preserved || old.Disabled) {
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
			if (!platform.CatalogPermission(permission) && !preserved) || permission == "" || node.ParentID == nil || *node.ParentID == "" || len(node.OperationIds) == 0 {
				return platform.ErrInput
			}
			for _, id := range node.OperationIds {
				op, ok := platform.Operation(id)
				if !ok && preserved {
					continue
				}
				if !ok || !op.Grantable || !contains(op.Permissions, permission) {
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
		current := node
		seen := map[string]bool{node.ID: true}
		for depth := 1; current.ParentID != nil && *current.ParentID != ""; depth++ {
			parent, ok := nodes[*current.ParentID]
			if !ok || parent.SectionID != node.SectionID || seen[parent.ID] || depth >= maxMenuDepth {
				return platform.ErrInput
			}
			// Actions always attach to a page row; every other node may nest
			// under any non-action node (directory, page or link).
			if current.Type == "action" {
				if parent.Type != "page" {
					return platform.ErrInput
				}
			} else if parent.Type == "action" {
				return platform.ErrInput
			}
			seen[parent.ID] = true
			current = parent
		}
		if node.ActiveMenu != nil && *node.ActiveMenu != "" {
			target, ok := nodes[*node.ActiveMenu]
			if !ok || target.SectionID != node.SectionID || target.Type == "action" {
				return platform.ErrInput
			}
		}
	}
	return nil
}

// sameNavigationBinding identifies retained catalogue references. Layout fields
// may change, but node type, route, surfaces and action authorization targets
// must stay the same; an unavailable action also keeps its original parent.
func sameNavigationBinding(a, b contracts.NavigationNode) bool {
	return a.Type == b.Type && text(a.RouteID) == text(b.RouteID) &&
		slices.Equal(slices.Sorted(slices.Values(a.Surfaces)), slices.Sorted(slices.Values(b.Surfaces))) &&
		sameActionBinding(a, b) && (a.Type != "action" || text(a.ParentID) == text(b.ParentID))
}

// SaveNavigation replaces the tree under optimistic version control. The
// cascade of guards: menu editing needs menus:write; restoring defaults or
// touching role assignments needs super_admin (assignments additionally
// roles:write). Tree edits can rebind an existing action ID without replacing
// role grant rows; projections derive points from its current binding, while
// DataScope still uses stored role permissions (pending decision D25, C).
func (r *Repository) SaveNavigation(ctx context.Context, input contracts.MenuSaveInput, actor string) (contracts.MenuList, error) {
	if err := r.initializeNavigation(ctx); err != nil {
		return contracts.MenuList{}, err
	}
	n := contracts.Navigation{Version: input.Version, Sections: input.Sections, Nodes: input.Nodes}
	reset := input.Reset != nil && *input.Reset
	if reset {
		n = platform.DefaultNavigation()
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.MenuList{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.MenuList{}, err
	}
	roleSnapshots, err := r.roleEditSnapshots(ctx, tx)
	if err != nil {
		return contracts.MenuList{}, err
	}
	admin, err := r.actor(ctx, tx, actor, "menus:write")
	if err != nil {
		return contracts.MenuList{}, err
	}
	// Compare against trusted persisted state under the same installation lock
	// as the replacement; caller-supplied ids never establish a legacy binding.
	previous, err := r.readNavigation(ctx, tx)
	if err != nil {
		return contracts.MenuList{}, err
	}
	if err = validateNavigation(n, previous); err != nil {
		return contracts.MenuList{}, err
	}
	if reset && !platform.IsSuper(admin) {
		return contracts.MenuList{}, platform.ErrForbidden
	}
	if input.RoleAssignments != nil && (!platform.IsSuper(admin) || !platform.Has(admin, "roles:write")) {
		return contracts.MenuList{}, platform.ErrForbidden
	}
	// Rebinding the permission or operations of an action that already carries
	// grant rows changes the effective permissions of every role holding them:
	// that is an authorization change and requires roles:write, exactly like
	// the role editor (pending decision D25, C). Pure layout work, new actions
	// and orphan pruning stay on menus:write, and no grant is ever widened to
	// satisfy the editor.
	if !platform.IsSuper(admin) {
		changed, err := r.authorizedActionRebinds(ctx, tx, n)
		if err != nil {
			return contracts.MenuList{}, err
		}
		if changed && !platform.Has(admin, "roles:write") {
			return contracts.MenuList{}, platform.ErrForbidden
		}
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
	// Tree edits can remove nodes or re-type them. Grant rows pointing at IDs
	// that are no longer menu or action nodes are orphans: they would silently
	// resurrect a grant if an operator ever re-adds a node with the same ID,
	// and they stale every role editor without a version bump. Remove them
	// before the snapshot diff so advanceChangedRoleVersions bumps exactly the
	// roles whose stored authorization actually changed; a tree edit that
	// orphans nothing keeps bumping nothing.
	if err = r.pruneOrphanedGrants(ctx, tx, n); err != nil {
		return contracts.MenuList{}, err
	}
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
		// Only members of changed roles lose their shared sessions.
		for _, assignment := range *input.RoleAssignments {
			if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id IN (SELECT user_id FROM unicore_user_roles WHERE role_id=?)", assignment.RoleID); err != nil {
				return contracts.MenuList{}, err
			}
		}
	}
	if err = r.audit(audit.Target(ctx, "menus/", fmt.Sprintf("version=%d; sections=%d; nodes=%d; assignments=%d", input.Version+1, len(n.Sections), len(n.Nodes), len(derefAssignments(input.RoleAssignments)))), tx, actor, "menus.updated"); err != nil {
		return contracts.MenuList{}, err
	}
	if err = r.advanceChangedRoleVersions(ctx, tx, roleSnapshots); err != nil {
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

// pruneOrphanedGrants drops role grant rows that reference node IDs the new
// tree no longer contains with the expected type. Re-pointed action nodes keep
// their rows when the ID and action type remain. Those rows are not necessarily
// inert: deriveGrantedPermissions reads the current action binding and can add
// points absent from stored role permissions; DataScope still uses the latter.
// This pruning only checks node existence/type, not role permission bounds.
func (r *Repository) pruneOrphanedGrants(ctx context.Context, tx *sql.Tx, n contracts.Navigation) error {
	menus, actions := map[string]bool{}, map[string]bool{}
	for _, node := range n.Nodes {
		if node.Type == "action" {
			actions[node.ID] = true
		} else {
			menus[node.ID] = true
		}
	}
	for _, set := range []struct {
		table, column string
		valid         map[string]bool
	}{
		{"unicore_role_menus", "menu_id", menus},
		{"unicore_role_actions", "action_id", actions},
	} {
		rows, err := r.Store.Rows(ctx, tx, "SELECT DISTINCT "+set.column+" FROM "+set.table)
		if err != nil {
			return err
		}
		var orphaned []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			if !set.valid[id] {
				orphaned = append(orphaned, id)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()
		for _, id := range orphaned {
			if _, err := r.Store.Exec(ctx, tx, "DELETE FROM "+set.table+" WHERE "+set.column+"=?", id); err != nil {
				return err
			}
		}
	}
	return nil
}

// authorizedActionRebinds reports whether the incoming tree changes the
// permission or operation bindings of an action that already carries role
// grant rows. Grant rows authorize by action id and derive their effective
// points from the action's current binding, so rebinding one is an
// authorization change (pending decision D25, C) and needs roles:write.
// Every lookup failure fails closed: a partial grant or stored-node read must
// never let the guard conclude "no rebind" and wave the save through.
func (r *Repository) authorizedActionRebinds(ctx context.Context, tx *sql.Tx, n contracts.Navigation) (bool, error) {
	granted := map[string]bool{}
	rows, err := r.Store.Rows(ctx, tx, "SELECT DISTINCT action_id FROM unicore_role_actions")
	if err != nil {
		return false, err
	}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return false, err
		}
		granted[id] = true
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return false, err
	}
	rows.Close()
	if len(granted) == 0 {
		return false, nil
	}
	stored := map[string]contracts.NavigationNode{}
	srows, err := r.Store.Rows(ctx, tx, "SELECT payload FROM unicore_navigation_nodes WHERE node_type='action'")
	if err != nil {
		return false, err
	}
	for srows.Next() {
		var payload string
		var node contracts.NavigationNode
		if err = srows.Scan(&payload); err != nil {
			srows.Close()
			return false, err
		}
		if err = json.Unmarshal([]byte(payload), &node); err != nil {
			srows.Close()
			return false, err
		}
		stored[node.ID] = node
	}
	if err = srows.Err(); err != nil {
		srows.Close()
		return false, err
	}
	srows.Close()
	for _, node := range n.Nodes {
		if node.Type != "action" || !granted[node.ID] {
			continue
		}
		prev, ok := stored[node.ID]
		if !ok {
			// A grant row without a stored action binding cannot be compared:
			// treating it as fresh would silently skip the guard, so refuse
			// the save until the inconsistency is repaired.
			return false, fmt.Errorf("authorized action %s has no stored binding to compare", node.ID)
		}
		if !sameActionBinding(prev, node) {
			return true, nil
		}
	}
	return false, nil
}

// sameActionBinding compares the authorization-relevant fields of two action
// nodes: the granted permission and the operation set. Labels, placement and
// visibility are layout and stay on menus:write. The operation sets compare
// unordered: resubmitting the same operations in a different order is a
// layout-grade edit, not a rebind.
func sameActionBinding(a, b contracts.NavigationNode) bool {
	if (a.Permission == nil) != (b.Permission == nil) {
		return false
	}
	if a.Permission != nil && *a.Permission != *b.Permission {
		return false
	}
	return slices.Equal(slices.Sorted(slices.Values(a.OperationIds)), slices.Sorted(slices.Values(b.OperationIds)))
}
