// Author: yunnuo <ymz@ebox.vip>
// Description: Realm-aware role catalogue, custom role management and transactional administrator authorization.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// role reads one row of unicore_roles. super_admin keeps the catalogue-wide grant
// set; every other role resolves permissions from unicore_role_permissions. The
// statements bypass scoped(): role tables are shared across realms, and the
// member counts must always address the intended identity table literally.
func (r *Repository) role(ctx context.Context, q sqlstore.Runner, id string) (contracts.Role, error) {
	var name, realm, scope string
	err := r.Store.Row(ctx, q, "SELECT name, realm, data_scope FROM unicore_roles WHERE id=?", id).Scan(&name, &realm, &scope)
	if errors.Is(err, sql.ErrNoRows) {
		return contracts.Role{}, platform.ErrInput
	}
	if err != nil {
		return contracts.Role{}, err
	}
	result := contracts.Role{ID: id, Name: name, Realm: realm, Builtin: platform.BuiltinRole(id), Permissions: []string{}, DataScope: scope, DepartmentIds: []string{}}
	if id == "super_admin" {
		result.DataScope = platform.ScopeSelf
		result.AuthorizationInitialized = true
		result.MenuIds, result.ActionIds, result.OperationIds = []string{}, []string{}, []string{}
		result.Permissions = append(result.Permissions, platform.Permissions()...)
		if err := r.Store.Row(ctx, q, "SELECT COUNT(*) FROM unicore_administrators").Scan(&result.UserCount); err != nil {
			return contracts.Role{}, err
		}
		return result, nil
	}
	rows, err := r.Store.Rows(ctx, q, "SELECT permission_id FROM unicore_role_permissions WHERE role_id=? ORDER BY permission_id", id)
	if err != nil {
		return contracts.Role{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var permission string
		if err = rows.Scan(&permission); err != nil {
			return contracts.Role{}, err
		}
		result.Permissions = append(result.Permissions, permission)
	}
	if err = rows.Err(); err != nil {
		return contracts.Role{}, err
	}
	if scope == platform.ScopeCustom {
		departments, err := r.roleDepartments(ctx, q, id)
		if err != nil {
			return contracts.Role{}, err
		}
		result.DepartmentIds = departments
	}
	if realm == "administrator" {
		err = r.Store.Row(ctx, q, "SELECT COUNT(*) FROM unicore_administrators a JOIN unicore_administrator_roles ar ON ar.administrator_id=a.id WHERE ar.role_id=?", id).Scan(&result.UserCount)
	} else {
		err = r.Store.Row(ctx, q, "SELECT COUNT(*) FROM unicore_users u JOIN unicore_user_roles ur ON ur.user_id=u.id WHERE ur.role_id=?", id).Scan(&result.UserCount)
	}
	if err != nil {
		return contracts.Role{}, err
	}
	// Independent authorization relations: navigation items, action buttons and
	// API operations are separate grant sets, all empty unless assigned.
	if result.AuthorizationInitialized, err = r.roleAuthorizationInitialized(ctx, q, id); err != nil {
		return contracts.Role{}, err
	}
	if result.MenuIds, err = r.roleIDList(ctx, q, "unicore_role_menus", id); err != nil {
		return contracts.Role{}, err
	}
	if result.ActionIds, err = r.roleIDList(ctx, q, "unicore_role_actions", id); err != nil {
		return contracts.Role{}, err
	}
	if result.OperationIds, err = r.roleIDList(ctx, q, "unicore_role_operations", id); err != nil {
		return contracts.Role{}, err
	}
	return result, nil
}

// roleIDList reads one ordered grant column set for a role.
func (r *Repository) roleIDList(ctx context.Context, q sqlstore.Runner, table, roleID string) ([]string, error) {
	rows, err := r.Store.Rows(ctx, q, "SELECT "+map[string]string{"unicore_role_menus": "menu_id", "unicore_role_actions": "action_id", "unicore_role_operations": "operation_id"}[table]+" FROM "+table+" WHERE role_id=? ORDER BY 1", roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// saveRoleAuthorization replaces the independent grant sets of one role.
// Validation keeps the fail-closed bound: navigation items and actions must
// exist in the current tree of the role's own surface, actions stay bound to a
// catalogue permission the role holds, and operation grants never exceed the
// role's permission points (the points remain the upper bound).
func (r *Repository) saveRoleAuthorization(ctx context.Context, tx *sql.Tx, roleID, realm string, permissions, menuIds, actionIds, operationIds []string, n contracts.Navigation) error {
	// Node ids are bare route ids shared across surfaces; grants resolve
	// strictly inside the role's own surface.
	nodes := map[string]contracts.NavigationNode{}
	for _, section := range n.Sections {
		if section.Surface != realm {
			continue
		}
		for _, node := range n.Nodes {
			if node.SectionID == section.ID {
				nodes[node.ID] = node
			}
		}
	}
	permissionSet := map[string]bool{}
	for _, permission := range permissions {
		permissionSet[permission] = true
	}
	operationSet := map[string]bool{}
	for _, id := range operationIds {
		if !platform.ValidOperationGrant(realm, permissions, id) {
			return platform.ErrForbidden
		}
		if operationSet[id] {
			return platform.ErrInput
		}
		operationSet[id] = true
	}
	for _, id := range menuIds {
		node, ok := nodes[id]
		if !ok || node.Type == "action" {
			return platform.ErrForbidden
		}
	}
	for _, id := range actionIds {
		node, ok := nodes[id]
		if !ok || node.Type != "action" {
			return platform.ErrForbidden
		}
		if node.Permission == nil || !permissionSet[*node.Permission] {
			return platform.ErrForbidden
		}
		for _, operation := range node.OperationIds {
			if !operationSet[operation] {
				return platform.ErrForbidden
			}
		}
	}
	for _, set := range []struct {
		table, column string
		ids           []string
	}{
		{"unicore_role_menus", "menu_id", menuIds},
		{"unicore_role_actions", "action_id", actionIds},
		{"unicore_role_operations", "operation_id", operationIds},
	} {
		if _, err := r.Store.Exec(ctx, tx, "DELETE FROM "+set.table+" WHERE role_id=?", roleID); err != nil {
			return err
		}
		for _, id := range set.ids {
			if _, err := r.Store.Exec(ctx, tx, "INSERT INTO "+set.table+"(role_id,"+set.column+") VALUES(?,?)", roleID, id); err != nil {
				return err
			}
		}
	}
	if _, err := r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_authorizations WHERE role_id=?", roleID); err != nil {
		return err
	}
	if _, err := r.Store.Exec(ctx, tx, "INSERT INTO unicore_role_authorizations(role_id,initialized) VALUES(?,1)", roleID); err != nil {
		return err
	}
	return nil
}

func (r *Repository) roleDepartments(ctx context.Context, q sqlstore.Runner, roleID string) ([]string, error) {
	rows, err := r.Store.Rows(ctx, q, "SELECT department_id FROM unicore_role_departments WHERE role_id=? ORDER BY department_id", roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *Repository) ListRoles(ctx context.Context) (contracts.RoleList, error) {
	result := contracts.RoleList{Items: []contracts.Role{}, Permissions: platform.PermissionCatalog()}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT id FROM unicore_roles ORDER BY CASE WHEN id IN ('super_admin','user') THEN 0 ELSE 1 END, name, id")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return result, err
		}
		ids = append(ids, id)
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	for _, id := range ids {
		role, err := r.role(ctx, r.Store.DB, id)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, role)
	}
	return result, nil
}

func (r *Repository) actor(ctx context.Context, tx *sql.Tx, id, permission string) (contracts.User, error) {
	admins := &Repository{Store: r.Store, Administrators: true}
	user, err := admins.user(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return user, platform.ErrForbidden
	}
	if err != nil {
		return user, err
	}
	// Active state and the permission point are rechecked against current data;
	// super_admin exclusivity is the policy middleware's session-layer decision.
	if user.Status != "active" || !platform.Has(user, permission) {
		return user, platform.ErrForbidden
	}
	return user, nil
}

// AuthorizeAdministrator must run after LockInstallation in the mutation transaction.
// Fixed identity table, active state and permission are rechecked against current data.
func (r *Repository) AuthorizeAdministrator(ctx context.Context, tx *sql.Tx, id, permission string) error {
	_, err := r.actor(ctx, tx, id, permission)
	return err
}

// RoleOptions lists the roles assignable in the repository's realm: the user
// realm offers its builtin role plus user-realm custom roles, the administrator
// realm super_admin plus administrator-realm custom roles.
func (r *Repository) RoleOptions(ctx context.Context, actorID string) (contracts.RoleOptions, error) {
	result := contracts.RoleOptions{Items: []contracts.RoleOption{}}
	admins := &Repository{Store: r.Store, Administrators: true}
	actor, err := admins.user(ctx, r.Store.DB, actorID)
	if errors.Is(err, sql.ErrNoRows) {
		return result, platform.ErrForbidden
	}
	if err != nil {
		return result, err
	}
	if actor.Status != "active" {
		return result, platform.ErrForbidden
	}
	roles, err := r.ListRoles(ctx)
	if err != nil {
		return result, err
	}
	for _, role := range roles.Items {
		if r.Administrators {
			if role.ID != "super_admin" && role.Realm != "administrator" {
				continue
			}
		} else if role.ID == "super_admin" || role.Realm != "user" {
			continue
		}
		result.Items = append(result.Items, contracts.RoleOption{ID: role.ID, Name: role.Name, Assignable: true})
	}
	return result, nil
}

// validateGrants applies the realm's fail-closed bound: user-realm roles take
// assignable points only, administrator-realm roles any catalogue point, and
// unknown points are always refused.
func validateGrants(realm string, permissions []string) error {
	for _, permission := range permissions {
		if realm == "administrator" {
			if !platform.CatalogPermission(permission) {
				return platform.ErrForbidden
			}
			continue
		}
		if !platform.AssignablePermission(permission) {
			return platform.ErrForbidden
		}
	}
	return nil
}

// validateDataScope normalizes the requested data scope against the role realm:
// omitted means self, unknown values are input errors, administrator-realm roles
// are fixed to self and reject anything else (fail-closed).
func validateDataScope(realm string, scope *string) (string, error) {
	requested := platform.ScopeSelf
	if scope != nil && *scope != "" {
		requested = *scope
	}
	switch requested {
	case platform.ScopeAll, platform.ScopeDept, platform.ScopeDeptBelow, platform.ScopeCustom, platform.ScopeSelf:
	default:
		return "", platform.ErrInput
	}
	if realm == "administrator" && requested != platform.ScopeSelf {
		return "", platform.ErrForbidden
	}
	return requested, nil
}

// validateScopeDepartments checks every custom-scope department exists. Rows are
// only persisted for the custom scope; other scopes return an empty set.
func (r *Repository) validateScopeDepartments(ctx context.Context, q sqlstore.Runner, scope string, departments []string) ([]string, error) {
	if scope != platform.ScopeCustom {
		return []string{}, nil
	}
	seen := map[string]bool{}
	for _, id := range departments {
		if seen[id] {
			continue
		}
		seen[id] = true
		if _, err := r.department(ctx, q, id); err != nil {
			return nil, err
		}
	}
	result := []string{}
	for _, id := range departments {
		if seen[id] {
			result = append(result, id)
			delete(seen, id)
		}
	}
	return result, nil
}

// CreateRole adds a custom role in the requested realm (empty means user for
// backward compatibility). Grant checks run in the usecase layer and are
// re-defended here. A new role starts with exactly the submitted grants: empty
// stays empty, never "all".
func (r *Repository) CreateRole(ctx context.Context, input contracts.RoleSaveInput, actor string) (contracts.Role, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return contracts.Role{}, platform.ErrInput
	}
	if err := r.initializeNavigation(ctx); err != nil {
		return contracts.Role{}, err
	}
	realm := ""
	if input.Realm != nil {
		realm = *input.Realm
	}
	if realm == "" {
		realm = "user"
	}
	if realm != "user" && realm != "administrator" {
		return contracts.Role{}, platform.ErrInput
	}
	if err := validateGrants(realm, input.Permissions); err != nil {
		return contracts.Role{}, err
	}
	scope, err := validateDataScope(realm, input.DataScope)
	if err != nil {
		return contracts.Role{}, err
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Role{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Role{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "roles:write"); err != nil {
		return contracts.Role{}, err
	}
	departments, err := r.validateScopeDepartments(ctx, tx, scope, derefDepartmentIds(input.DepartmentIds))
	if err != nil {
		return contracts.Role{}, err
	}
	id := sqlstore.ID()
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES(?,?,?,?)", id, name, realm, scope); err != nil {
		return contracts.Role{}, accountError(err)
	}
	if err = r.writeRolePermissions(ctx, tx, id, input.Permissions); err != nil {
		return contracts.Role{}, err
	}
	if err = r.writeRoleDepartments(ctx, tx, id, departments); err != nil {
		return contracts.Role{}, err
	}
	nav, err := r.readNavigation(ctx, tx)
	if err != nil {
		return contracts.Role{}, err
	}
	// Omitted grant arrays derive the role's exact current equivalents: every
	// surface item and operation its permission points already unlock, so a
	// newly created role keeps working without enumerating the catalogue.
	menuIds, actionIds, operationIds := deriveGrants(realm, input.Permissions, nav)
	if input.MenuIds != nil {
		menuIds = *input.MenuIds
	}
	if input.ActionIds != nil {
		actionIds = *input.ActionIds
	}
	if input.OperationIds != nil {
		operationIds = *input.OperationIds
	}
	if err = r.saveRoleAuthorization(ctx, tx, id, realm, input.Permissions, menuIds, actionIds, operationIds, nav); err != nil {
		return contracts.Role{}, err
	}
	if err = r.audit(audit.Target(ctx, "role/"+id, "realm="+realm+"; name="+name+"; permissions="+strings.Join(input.Permissions, ",")+"; data_scope="+scope), tx, actor, "roles.created"); err != nil {
		return contracts.Role{}, err
	}
	role, err := r.role(ctx, tx, id)
	if err != nil {
		return contracts.Role{}, err
	}
	return role, tx.Commit()
}

// UpdateRole edits name, grants and the data scope. The builtin user role keeps
// its name and personal-only scope but may be re-granted; super_admin is
// immutable; a role never moves between realms. Omitted grant arrays keep the
// current authorization; an explicit empty array clears it, so an empty
// authorization is a real state and never "all".
func (r *Repository) UpdateRole(ctx context.Context, id string, input contracts.RoleSaveInput, actor string) (contracts.Role, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return contracts.Role{}, platform.ErrInput
	}
	if err := r.initializeNavigation(ctx); err != nil {
		return contracts.Role{}, err
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Role{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Role{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "roles:write"); err != nil {
		return contracts.Role{}, err
	}
	before, err := r.role(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return contracts.Role{}, platform.ErrInput
	}
	if err != nil {
		return contracts.Role{}, err
	}
	if id == "super_admin" {
		return contracts.Role{}, platform.ErrForbidden
	}
	if err = validateGrants(before.Realm, input.Permissions); err != nil {
		return contracts.Role{}, err
	}
	scope, err := validateDataScope(before.Realm, input.DataScope)
	if err != nil {
		return contracts.Role{}, err
	}
	// The builtin user role keeps its self-only behaviour; only custom roles may
	// widen row visibility.
	if before.Builtin && scope != platform.ScopeSelf {
		return contracts.Role{}, platform.ErrForbidden
	}
	departments, err := r.validateScopeDepartments(ctx, tx, scope, derefDepartmentIds(input.DepartmentIds))
	if err != nil {
		return contracts.Role{}, err
	}
	if !before.Builtin {
		if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_roles SET name=?,data_scope=? WHERE id=?", name, scope, id); err != nil {
			return contracts.Role{}, accountError(err)
		}
	}
	if err = r.writeRolePermissions(ctx, tx, id, input.Permissions); err != nil {
		return contracts.Role{}, err
	}
	if err = r.writeRoleDepartments(ctx, tx, id, departments); err != nil {
		return contracts.Role{}, err
	}
	// Grant semantics: omitted operation/action arrays derive the exact
	// equivalents of the submitted permission points (ADR-0036), so tightening
	// permissions narrows them and widening reopens only what the points
	// already unlock. Omitted menus keep the stored navigation assignment,
	// filtered to the items the current tree still contains so tree pruning
	// never bricks role editing; explicit arrays are validated strictly.
	nav, err := r.readNavigation(ctx, tx)
	if err != nil {
		return contracts.Role{}, err
	}
	menuIds := []string{}
	if input.MenuIds != nil {
		menuIds = *input.MenuIds
	} else {
		present := map[string]bool{}
		for _, node := range nav.Nodes {
			present[node.ID] = true
		}
		for _, id := range before.MenuIds {
			if present[id] {
				menuIds = append(menuIds, id)
			}
		}
	}
	_, actionIds, operationIds := deriveGrants(before.Realm, input.Permissions, nav)
	if input.ActionIds != nil {
		actionIds = *input.ActionIds
	}
	if input.OperationIds != nil {
		operationIds = *input.OperationIds
	}
	if err = r.saveRoleAuthorization(ctx, tx, id, before.Realm, input.Permissions, menuIds, actionIds, operationIds, nav); err != nil {
		return contracts.Role{}, err
	}
	// A permission change re-evaluates every member session; each realm revokes
	// its own session table only.
	if before.Realm == "administrator" {
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_administrator_sessions WHERE user_id IN (SELECT administrator_id FROM unicore_administrator_roles WHERE role_id=?)", id); err != nil {
			return contracts.Role{}, err
		}
	} else if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id IN (SELECT user_id FROM unicore_user_roles WHERE role_id=?)", id); err != nil {
		return contracts.Role{}, err
	}
	if err = r.audit(audit.Target(ctx, "role/"+id, "sessions=revoked; permissions="+strings.Join(input.Permissions, ",")+"; data_scope="+scope), tx, actor, "roles.updated"); err != nil {
		return contracts.Role{}, err
	}
	role, err := r.role(ctx, tx, id)
	if err != nil {
		return contracts.Role{}, err
	}
	return role, tx.Commit()
}

// DeleteRole refuses builtin roles and roles that still have members in either
// realm membership table.
func (r *Repository) DeleteRole(ctx context.Context, id string, actor string) (contracts.Role, error) {
	before, err := r.role(ctx, r.Store.DB, id)
	if err != nil {
		return contracts.Role{}, err
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Role{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Role{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "roles:write"); err != nil {
		return contracts.Role{}, err
	}
	if platform.BuiltinRole(id) {
		return contracts.Role{}, platform.ErrForbidden
	}
	for _, table := range []string{"unicore_user_roles", "unicore_administrator_roles"} {
		var count int
		if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM "+table+" WHERE role_id=?", id).Scan(&count); err != nil {
			return contracts.Role{}, err
		}
		if count != 0 {
			return contracts.Role{}, platform.ErrConflict
		}
	}
	result, err := r.Store.Exec(ctx, tx, "DELETE FROM unicore_roles WHERE id=?", id)
	if err != nil {
		return contracts.Role{}, err
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return contracts.Role{}, platform.ErrInput
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_permissions WHERE role_id=?", id); err != nil {
		return contracts.Role{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_departments WHERE role_id=?", id); err != nil {
		return contracts.Role{}, err
	}
	if err = r.audit(audit.Target(ctx, "role/"+id, "deleted"), tx, actor, "roles.deleted"); err != nil {
		return contracts.Role{}, err
	}
	return before, tx.Commit()
}

func (r *Repository) writeRolePermissions(ctx context.Context, tx *sql.Tx, id string, permissions []string) error {
	if _, err := r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_permissions WHERE role_id=?", id); err != nil {
		return err
	}
	for _, permission := range permissions {
		if _, err := r.Store.Exec(ctx, tx, "INSERT INTO unicore_role_permissions(role_id,permission_id) VALUES(?,?)", id, permission); err != nil {
			return err
		}
	}
	return nil
}

// writeRoleDepartments replaces the custom scope department set; non-custom
// scopes persist an empty set.
func (r *Repository) writeRoleDepartments(ctx context.Context, tx *sql.Tx, id string, departments []string) error {
	if _, err := r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_departments WHERE role_id=?", id); err != nil {
		return err
	}
	for _, department := range departments {
		if _, err := r.Store.Exec(ctx, tx, "INSERT INTO unicore_role_departments(role_id,department_id) VALUES(?,?)", id, department); err != nil {
			return err
		}
	}
	return nil
}

// EnsurePermissions re-applies the catalogue to an installed instance so new
// permission points and the super_admin grant set survive version upgrades.
// It deliberately never touches the builtin user role: revoked points stay
// revoked and new points stay unassigned until an operator grants them. The
// install-time Seed keeps the original full-assignable default for fresh
// instances, and role authorization materialization runs exactly once at the
// navigation upgrade, so upgrades never silently widen any role.
func (r *Repository) EnsurePermissions(ctx context.Context) error {
	for _, permission := range platform.Permissions() {
		if _, err := r.Store.Exec(ctx, r.Store.DB, "INSERT INTO unicore_permissions(id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM unicore_permissions WHERE id=?)", permission, permission); err != nil {
			return err
		}
		if _, err := r.Store.Exec(ctx, r.Store.DB, "INSERT INTO unicore_role_permissions(role_id,permission_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM unicore_role_permissions WHERE role_id=? AND permission_id=?)", "super_admin", permission, "super_admin", permission); err != nil {
			return err
		}
	}
	return nil
}

// deriveGrants computes the equivalent authorization of a permission set
// against the current navigation: surface items of the realm, action buttons
// whose point is held and whose operations are all covered, and the API
// operations the points already unlocked.
func deriveGrants(realm string, permissions []string, n contracts.Navigation) ([]string, []string, []string) {
	operations := platform.MaterializedOperations(realm, permissions)
	operationSet := map[string]bool{}
	for _, id := range operations {
		operationSet[id] = true
	}
	permissionSet := map[string]bool{}
	for _, permission := range permissions {
		permissionSet[permission] = true
	}
	// Node ids are bare route ids shared across surfaces; derive only from the
	// realm's own sections.
	surfaceSections := map[string]bool{}
	for _, section := range n.Sections {
		if section.Surface == realm {
			surfaceSections[section.ID] = true
		}
	}
	menus, actions := []string{}, []string{}
	for _, node := range n.Nodes {
		if !surfaceSections[node.SectionID] {
			continue
		}
		if node.Type == "action" {
			if node.Permission != nil && permissionSet[*node.Permission] {
				covered := len(node.OperationIds) > 0
				for _, id := range node.OperationIds {
					if !operationSet[id] {
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
	return menus, actions, operations
}

// derefIDs normalizes the optional contract arrays: nil means "keep" for
// updates and "empty" for creation.
func derefIDs(ids *[]string) []string {
	if ids == nil {
		return nil
	}
	return *ids
}

// derefDepartmentIds normalizes the optional contract array: nil or an empty
// list mean no configured departments.
func derefDepartmentIds(ids *[]string) []string {
	if ids == nil {
		return nil
	}
	return *ids
}
