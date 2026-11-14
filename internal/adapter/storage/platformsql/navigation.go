// Author: yunnuo <ymz@ebox.vip>
// Description: Versioned normalized navigation with transactional replacement, legacy recovery conversion and one-time role materialization.
package platformsql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

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

// EnsureNavigation runs the one-time conversions at startup: legacy menu
// overrides become normalized nodes, every role still lacking explicit
// authorizations is materialized with exact equivalents of its current reach
// (ADR-0036), the workspace-prefixed dual tree collapses into the shared
// single tree with surface declarations (ADR-0039), and the converted
// three-region shape folds into the current two-region tree while actions the
// catalogue no longer accepts are pruned. Conversions only ever run once:
// revoked grants stay revoked and new operations stay denied until granted.
// Afterwards the tree is topped up with action nodes the current contract
// catalogue derives but the persisted tree lacks, so buttons registered by a
// newer build become grantable on an instance seeded by an older one, and the
// retired personal-center region (its surfaces moved into the account menus'
// settings modal) is removed from trees that still carry it.
func (r *Repository) EnsureNavigation(ctx context.Context) error {
	if err := r.initializeNavigation(ctx); err != nil {
		return err
	}
	if err := r.upgradeSharedNavigation(ctx); err != nil {
		return err
	}
	if err := r.retirePersonalNavigation(ctx); err != nil {
		return err
	}
	if err := r.retireDemoNavigation(ctx); err != nil {
		return err
	}
	if err := r.backfillRegisteredActions(ctx); err != nil {
		return err
	}
	return r.ensureMonitorNavigation(ctx)
}

// retirePersonalNavigation removes the seeded 个人中心 directory and its four
// account page nodes from persisted trees: the personal center now opens from
// the account menus' settings modal and keeps no navigation presence. It runs
// after the legacy fold so a tree converted this startup is cleaned in the
// same pass, re-parents anything an operator hung below the directory, and
// clears the matching role grants; a tree without the region rolls back
// untouched, so the heal stays idempotent by re-detection instead of a marker.
func (r *Repository) retirePersonalNavigation(ctx context.Context) error {
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
	removed := map[string]contracts.NavigationNode{}
	for _, node := range n.Nodes {
		if node.Type == "directory" && node.ID == "personal" ||
			node.Type == "page" && slices.Contains(retiredPersonalPages, text(node.RouteID)) {
			removed[node.ID] = node
		}
	}
	for _, node := range n.Nodes {
		if node.Type == "action" {
			if _, retired := removed[text(node.ParentID)]; retired {
				removed[node.ID] = node
			}
		}
	}
	kept := []contracts.NavigationNode{}
	changed := false
	for _, node := range n.Nodes {
		if _, retired := removed[node.ID]; retired {
			changed = true
			continue
		}
		if _, retired := removed[text(node.ActiveMenu)]; retired {
			node.ActiveMenu = nil
		}
		seen := map[string]bool{}
		for parent, retired := removed[text(node.ParentID)]; retired; parent, retired = removed[text(node.ParentID)] {
			if seen[parent.ID] {
				node.ParentID = nil
				break
			}
			seen[parent.ID] = true
			node.ParentID = parent.ParentID
		}
		kept = append(kept, node)
	}
	// Grant rows: the removed node ids, plus the retired ids themselves — a
	// tree that already lost the nodes can still carry dangling rows. A
	// grant-only cleanup bumps the version once, then goes quiet forever.
	targets := map[string]bool{"personal": true}
	for _, id := range retiredPersonalPages {
		targets[id] = true
	}
	for id := range removed {
		targets[id] = true
	}
	if !changed {
		for id := range targets {
			result, err := r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_menus WHERE menu_id=?", id)
			if err != nil {
				return err
			}
			if affected, err := result.RowsAffected(); err == nil && affected > 0 {
				changed = true
			}
			result, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_actions WHERE action_id=?", id)
			if err != nil {
				return err
			}
			if affected, err := result.RowsAffected(); err == nil && affected > 0 {
				changed = true
			}
		}
	}
	if !changed {
		return tx.Rollback()
	}
	n.Nodes = kept
	if err = r.writeNavigation(ctx, tx, n); err != nil {
		return err
	}
	for id := range targets {
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_menus WHERE menu_id=?", id); err != nil {
			return err
		}
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_actions WHERE action_id=?", id); err != nil {
			return err
		}
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
		return err
	}
	return tx.Commit()
}

// retiredPersonalPages lists the route ids whose pages left the navigation for
// the account menus' settings modal.
var retiredPersonalPages = []string{"account", "account-security", "account-sessions", "account-tokens"}

// retireDemoNavigation removes retired routes on the instance startup boundary.
// Operator-owned children survive under the nearest retained ancestor.
func (r *Repository) retireDemoNavigation(ctx context.Context) error {
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
	removed := map[string]contracts.NavigationNode{}
	changed := false
	for _, node := range n.Nodes {
		path, _, _ := strings.Cut(text(node.Url), "?")
		path, _, _ = strings.Cut(path, "#")
		if node.Type == "page" && (text(node.RouteID) == "lab" || text(node.RouteID) == "files" || text(node.RouteID) == "api-operations") ||
			node.Type == "link" && (path == "/lab" || path == "/files" || path == "/admin/api-operations" || path == "/api-operations") {
			removed[node.ID] = node
		}
	}
	for _, node := range n.Nodes {
		if node.Type == "action" {
			if _, retired := removed[text(node.ParentID)]; retired {
				removed[node.ID] = node
			}
		}
	}
	kept := []contracts.NavigationNode{}
	for _, node := range n.Nodes {
		if _, retired := removed[node.ID]; retired {
			changed = true
			continue
		}
		if _, retired := removed[text(node.ActiveMenu)]; retired {
			node.ActiveMenu = nil
		}
		seen := map[string]bool{}
		for parent, retired := removed[text(node.ParentID)]; retired; parent, retired = removed[text(node.ParentID)] {
			if seen[parent.ID] {
				node.ParentID = nil
				break
			}
			seen[parent.ID] = true
			node.ParentID = parent.ParentID
		}
		if text(node.RouteID) == "site" && contains(node.Surfaces, "user") {
			node.Surfaces = []string{"administrator"}
			changed = true
		}
		kept = append(kept, node)
	}
	if !changed {
		return tx.Rollback()
	}
	n.Nodes = kept
	if err = r.writeNavigation(ctx, tx, n); err != nil {
		return err
	}
	for id := range removed {
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_menus WHERE menu_id=?", id); err != nil {
			return err
		}
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_actions WHERE action_id=?", id); err != nil {
			return err
		}
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
		return err
	}
	return tx.Commit()
}

// monitorSeedOrder lists the runtime monitor entries in seed order; later
// releases append new ids (P1 added monitor-events), and the persisted marker
// records which ids a tree has ever received so operator deletions survive
// restarts while genuinely new entries still join.
var monitorSeedOrder = []string{"monitor-center", "monitor", "monitor-services", "monitor-resources", "monitor-events"}

const monitorSeedMarker = "_navigation_monitor_seeded"

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

// legacyNavigation detects payloads the one-time upgrade still has to repair:
// the pre-ADR-0039 format stored a single surface scalar (parsed into an empty
// surfaces list), the collapsed dual tree kept the pre-collapse `personal`
// region as a third section, and an action payload may reference grants the
// current catalogue no longer accepts.
func legacyNavigation(n contracts.Navigation) bool {
	for _, s := range n.Sections {
		if len(s.Surfaces) == 0 || s.ID == "personal" {
			return true
		}
	}
	for _, node := range n.Nodes {
		if node.Type == "action" && staleActionNode(node, nil) {
			return true
		}
	}
	return false
}

// staleActionNode reports an action payload the current catalogue refuses:
// the permission left the catalogue, an operation disappeared or lost its
// grantable flag, the permission no longer matches the operation policy, or
// the action lost its page parent. The optional node index resolves parents;
// nil skips the parent check (detection runs before the tree is indexed).
func staleActionNode(node contracts.NavigationNode, nodes map[string]contracts.NavigationNode) bool {
	permission := text(node.Permission)
	if !platform.CatalogPermission(permission) || node.ParentID == nil || *node.ParentID == "" || len(node.OperationIds) == 0 {
		return true
	}
	for _, id := range node.OperationIds {
		op, ok := platform.Operation(id)
		if !ok || !op.Grantable || !contains(op.Permissions, permission) {
			return true
		}
	}
	if nodes == nil {
		return false
	}
	parent, ok := nodes[*node.ParentID]
	return !ok || parent.Type != "page" || parent.SectionID != node.SectionID
}

// upgradeSharedNavigation repairs persisted trees once per payload shape: the
// workspace-prefixed dual tree collapses into the shared single tree (node
// ids lose their `user:`/`administrator:` prefix, both variants of the same
// page merge into one node with the union of surfaces, sections merge the
// same way, and the role grant rows are rewritten to the unprefixed ids with
// duplicates removed), the pre-collapse `personal` region folds into the
// business region, and actions the catalogue no longer accepts are pruned
// together with their grant rows. Grant identities only change for pruned
// actions and the folded container, so live sessions stay valid.
func (r *Repository) upgradeSharedNavigation(ctx context.Context) error {
	n, err := r.readNavigation(ctx, r.Store.DB)
	if err != nil {
		return err
	}
	if !legacyNavigation(n) {
		return nil
	}
	stripID := func(id string) string {
		for _, prefix := range []string{"user:", "administrator:", "admin:"} {
			if strings.HasPrefix(id, prefix) {
				return strings.TrimPrefix(id, prefix)
			}
		}
		return id
	}
	sectionID := map[string]string{}
	sections := map[string]contracts.NavigationSection{}
	order := []string{}
	for _, s := range n.Sections {
		target := stripID(s.ID)
		sectionID[s.ID] = target
		if len(s.Surfaces) == 0 {
			// Legacy payloads carry the scalar `surface` field; recover it
			// from the raw id prefix before any merge touches surfaces.
			if strings.HasPrefix(s.ID, "administrator:") || strings.HasPrefix(s.ID, "admin:") {
				s.Surfaces = []string{"administrator"}
			} else {
				s.Surfaces = []string{"user"}
			}
		}
		if existing, ok := sections[target]; ok {
			for _, surface := range s.Surfaces {
				if !contains(existing.Surfaces, surface) {
					existing.Surfaces = append(existing.Surfaces, surface)
				}
			}
			sections[target] = existing
			continue
		}
		s.ID = target
		sections[target] = s
		order = append(order, target)
	}
	merged := contracts.Navigation{Version: n.Version, Sections: []contracts.NavigationSection{}, Nodes: []contracts.NavigationNode{}}
	for _, id := range order {
		merged.Sections = append(merged.Sections, sections[id])
	}
	nodes := map[string]contracts.NavigationNode{}
	for _, node := range n.Nodes {
		target := stripID(node.ID)
		if node.SectionID == "" {
			continue
		}
		node.ID = target
		node.SectionID = sectionID[node.SectionID]
		if len(node.Surfaces) == 0 {
			if section, ok := sections[node.SectionID]; ok {
				node.Surfaces = append([]string{}, section.Surfaces...)
			}
		}
		if node.ParentID != nil && *node.ParentID != "" {
			parent := stripID(*node.ParentID)
			node.ParentID = &parent
		}
		if node.ActiveMenu != nil && *node.ActiveMenu != "" {
			active := stripID(*node.ActiveMenu)
			node.ActiveMenu = &active
		}
		existing, ok := nodes[target]
		if !ok {
			nodes[target] = node
			merged.Nodes = append(merged.Nodes, node)
			continue
		}
		// Two workspace variants of one page: keep one node, union the
		// surfaces and prefer the shared personal region when the variants
		// disagree about placement.
		for _, surface := range node.Surfaces {
			if !contains(existing.Surfaces, surface) {
				existing.Surfaces = append(existing.Surfaces, surface)
			}
		}
		if existing.SectionID != node.SectionID {
			if node.SectionID == "personal" || existing.SectionID == "personal" {
				existing.SectionID = "personal"
			}
		}
		for i := range merged.Nodes {
			if merged.Nodes[i].ID == target {
				merged.Nodes[i] = existing
			}
		}
	}
	// The pre-collapse `personal` region and stale action grants are healed in
	// the same pass: the fold runs before the section widening so the widened
	// surfaces cover the folded nodes too.
	container, foldedChildren := healLegacyPersonalRegion(&merged)
	prunedActions := pruneStaleActionNodes(&merged)
	// A merged node may outlive its single-surface section: widen every
	// section to cover the nodes it hosts after the collapse.
	for i := range merged.Sections {
		for _, node := range merged.Nodes {
			if node.SectionID != merged.Sections[i].ID {
				continue
			}
			for _, surface := range node.Surfaces {
				if !contains(merged.Sections[i].Surfaces, surface) {
					merged.Sections[i].Surfaces = append(merged.Sections[i].Surfaces, surface)
				}
			}
		}
	}
	// Action ids lose their realm prefix exactly like every other node.
	actions := map[string]bool{}
	for i := range merged.Nodes {
		if merged.Nodes[i].Type != "action" {
			continue
		}
		id := stripID(merged.Nodes[i].ID)
		if actions[id] {
			merged.Nodes = append(merged.Nodes[:i], merged.Nodes[i+1:]...)
			i--
			continue
		}
		actions[id] = true
		merged.Nodes[i].ID = id
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	if current, err := r.readNavigation(ctx, tx); err != nil || !legacyNavigation(current) {
		return err
	}

	if err = r.writeNavigation(ctx, tx, merged); err != nil {
		return err
	}
	// Rewrite the grant rows onto the unprefixed identities, deduplicated.
	remap := func(table, column string) error {
		rows, err := r.Store.Rows(ctx, tx, "SELECT role_id,"+column+" FROM "+table)
		if err != nil {
			return err
		}
		defer rows.Close()
		type grant struct{ role, id string }
		seen := map[grant]bool{}
		rows2 := []grant{}
		for rows.Next() {
			var item grant
			if err := rows.Scan(&item.role, &item.id); err != nil {
				return err
			}
			item.id = stripID(item.id)
			if seen[item] {
				continue
			}
			seen[item] = true
			rows2 = append(rows2, item)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		rows.Close()
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM "+table); err != nil {
			return err
		}
		for _, item := range rows2 {
			if _, err = r.Store.Exec(ctx, tx, "INSERT INTO "+table+"(role_id,"+column+") VALUES(?,?)", item.role, item.id); err != nil {
				return err
			}
		}
		return nil
	}
	if err = remap("unicore_role_menus", "menu_id"); err != nil {
		return err
	}
	if err = remap("unicore_role_actions", "action_id"); err != nil {
		return err
	}
	// Pruned actions lose their grant rows: no role keeps a dangling button
	// grant for a node the tree no longer carries.
	for _, id := range prunedActions {
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_actions WHERE action_id=?", id); err != nil {
			return err
		}
	}
	// The folded container is a structural row, not a wider grant: roles that
	// hold a moved child must keep seeing it, and NavigationFor projects a
	// child only when its parent row is granted too. Only the container id is
	// added; pages, actions and operations stay exactly as they were.
	if container != "" {
		rows, err := r.Store.Rows(ctx, tx, "SELECT role_id,menu_id FROM unicore_role_menus")
		if err != nil {
			return err
		}
		holders := map[string]bool{}
		granted := map[string]bool{}
		for rows.Next() {
			var role, menu string
			if err = rows.Scan(&role, &menu); err != nil {
				rows.Close()
				return err
			}
			if menu == container {
				granted[role] = true
				continue
			}
			if foldedChildren[menu] {
				holders[role] = true
			}
		}
		if err = rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()
		for role := range holders {
			if granted[role] {
				continue
			}
			if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_role_menus(role_id,menu_id) VALUES(?,?)", role, container); err != nil {
				return err
			}
		}
	}
	// Sessions stay valid: the user envelope derives from the role tables on
	// every request, so the rewritten grants apply to live sessions as-is.
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_navigation_state SET version=version+1 WHERE id=1"); err != nil {
		return err
	}
	if err = r.audit(audit.Target(ctx, "menus/upgrade", "unified grant namespace"), tx, "system", "menus.updated"); err != nil {
		return err
	}
	return tx.Commit()
}

// backfillRegisteredActions tops the persisted tree up with action nodes the
// current contract catalogue derives but the tree lacks. The default seed and
// the one-time conversions only ever ran with the operations of their own
// build, so an instance upgraded across releases keeps a tree without the
// buttons newer operations registered — the role editor cannot offer them,
// sessions cannot carry their ids and canAction hides the button forever even
// when the operation grant itself is present. Every start recomputes the
// catalogue-derived actions against the persisted pages and inserts only the
// missing ids: existing nodes keep their operator labels, placement and
// visibility untouched, actions whose page node the tree lost stay absent (a
// button cannot outlive its page), and catalogue-invalid actions are never
// added because the derivation is the same DefaultActions the seed uses. The
// write bumps the tree version so editors holding a stale snapshot conflict
// instead of silently dropping the new nodes.
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

// healLegacyPersonalRegion folds the pre-collapse `personal` region into the
// business region. The dual-tree conversion leaves the account pages in the
// personal section while their `personal` parent directory lands in the
// system section, which no save can recover from: the parent chain crosses
// sections and validateNavigation refuses the whole tree forever. The fold
// moves the directory into business at the seeded tail sort, moves every
// personal-section node into business and drops the section. Node ids never
// change, so existing menu grants keep addressing the same rows; the returned
// container id and its direct non-action children let the caller repair the
// role rows that must keep seeing the folded pages.
func healLegacyPersonalRegion(merged *contracts.Navigation) (string, map[string]bool) {
	personal, business := -1, -1
	for i := range merged.Sections {
		switch merged.Sections[i].ID {
		case "personal":
			personal = i
		case "business":
			business = i
		}
	}
	if personal < 0 || business < 0 {
		return "", nil
	}
	// The personal directory may sit in any section after the workspace merge;
	// wherever it is, it becomes the business-region container at the seeded
	// tail sort.
	container := ""
	containerIndex := -1
	for i := range merged.Nodes {
		if merged.Nodes[i].ID == "personal" && merged.Nodes[i].Type == "directory" {
			merged.Nodes[i].SectionID = "business"
			merged.Nodes[i].Sort = 2700
			merged.Nodes[i].ParentID = nil
			container = merged.Nodes[i].ID
			containerIndex = i
		}
	}
	foldedChildren := map[string]bool{}
	if container != "" {
		for _, node := range merged.Nodes {
			if node.ParentID != nil && *node.ParentID == container && node.Type != "action" {
				foldedChildren[node.ID] = true
			}
		}
	}
	for i := range merged.Nodes {
		if merged.Nodes[i].SectionID == "personal" {
			merged.Nodes[i].SectionID = "business"
		}
	}
	// The container declares the union of its subtree surfaces: the dual-tree
	// conversion recovers it administrator-only while the folded pages carry
	// both workspaces, and a user-side child only renders when its parent row
	// does.
	if containerIndex >= 0 {
		childrenOf := map[string][]string{}
		byID := map[string]contracts.NavigationNode{}
		for _, node := range merged.Nodes {
			byID[node.ID] = node
			if node.ParentID != nil && *node.ParentID != "" {
				childrenOf[*node.ParentID] = append(childrenOf[*node.ParentID], node.ID)
			}
		}
		surfaces := map[string]bool{}
		var visit func(ids []string)
		visit = func(ids []string) {
			for _, id := range ids {
				if !surfaces[id] {
					surfaces[id] = true
					if node, ok := byID[id]; ok {
						for _, surface := range node.Surfaces {
							surfaces[surface] = true
						}
					}
					visit(childrenOf[id])
				}
			}
		}
		for _, surface := range merged.Nodes[containerIndex].Surfaces {
			surfaces[surface] = true
		}
		visit(childrenOf[container])
		widened := []string{}
		for _, surface := range []string{"user", "administrator"} {
			if surfaces[surface] {
				widened = append(widened, surface)
			}
		}
		if len(widened) > 0 {
			merged.Nodes[containerIndex].Surfaces = widened
		}
	}
	// The folded nodes must stay reachable: business declares the union of the
	// surfaces the personal region carried.
	for _, surface := range merged.Sections[personal].Surfaces {
		if !contains(merged.Sections[business].Surfaces, surface) {
			merged.Sections[business].Surfaces = append(merged.Sections[business].Surfaces, surface)
		}
	}
	merged.Sections = append(merged.Sections[:personal], merged.Sections[personal+1:]...)
	return container, foldedChildren
}

// pruneStaleActionNodes drops action nodes the current catalogue refuses
// (unknown permission, unknown or non-grantable operations, a
// permission/operation mismatch, a lost page parent). Layout nodes are never
// touched. The caller deletes the grant rows of the returned ids.
func pruneStaleActionNodes(merged *contracts.Navigation) []string {
	nodes := map[string]contracts.NavigationNode{}
	for _, node := range merged.Nodes {
		nodes[node.ID] = node
	}
	pruned := []string{}
	kept := merged.Nodes[:0]
	for _, node := range merged.Nodes {
		if node.Type == "action" && staleActionNode(node, nodes) {
			pruned = append(pruned, node.ID)
			continue
		}
		kept = append(kept, node)
	}
	merged.Nodes = kept
	return pruned
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
		if contains(s.Surfaces, "user") {
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
		if node.RouteID != nil {
			index[*node.RouteID] = i
		} else {
			index[node.ID] = i
		}
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
				section := "business"
				if _, ok := sectionOf[section]; !ok {
					n.Sections = append(n.Sections, contracts.NavigationSection{ID: section, Surfaces: []string{"user"}, Name: group, Visible: true, ShowTitle: true})
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
			section := "business"
			if _, ok := sectionOf[section]; !ok {
				n.Sections = append(n.Sections, contracts.NavigationSection{ID: section, Surfaces: []string{"user"}, Name: group, Visible: true, ShowTitle: true})
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
		menuIds, actionIds, operationIds := deriveGrants(role.realm, permissions, n)
		menuIds = []string{}
		actionIds = []string{}
		for _, node := range n.Nodes {
			if !contains(node.Surfaces, role.realm) {
				continue
			}
			if node.Type == "action" {
				if node.Permission != nil && platform.PermissionsAllow(permissions, []string{*node.Permission}, "all") {
					covered := true
					for _, id := range node.OperationIds {
						if !contains(operationIds, id) {
							covered = false
						}
					}
					if covered {
						actionIds = append(actionIds, node.ID)
					}
				}
				continue
			}
			menuIds = append(menuIds, node.ID)
		}
		if err = r.saveRoleAuthorization(ctx, tx, role.id, role.realm, permissions, menuIds, actionIds, operationIds, n); err != nil {
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
	return contracts.MenuList{Items: legacy.Items, Version: n.Version, Sections: n.Sections, Nodes: n.Nodes, Pages: platform.NavigationPages()}, nil
}

// validateNavigation checks a complete replacement tree: unique global ids,
// surfaces declared on sections and nodes, registered page routes for every
// declared surface, link targets, action grants bound to catalogue
// permissions and real operations, acyclic nesting and the depth limit.
// Parents are type-aware: actions hang under pages only and every other
// node nests under any non-action node.
func validateNavigation(n contracts.Navigation) error {
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
		switch node.Type {
		case "directory":
			if text(node.RouteID) != "" || text(node.Url) != "" || text(node.Permission) != "" {
				return platform.ErrInput
			}
		case "page":
			registered := false
			for _, surface := range node.Surfaces {
				if _, ok := platform.NavigationPage(text(node.RouteID), surface); ok {
					registered = true
				}
			}
			// An explicitly disabled node may reference an unregistered page so
			// operators can repair or drop it instead of losing configuration.
			if !registered && !node.Disabled {
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
