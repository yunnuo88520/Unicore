// Author: yunnuo <ymz@ebox.vip>
// Description: Database-backed role catalogue, custom role management and transactional administrator authorization.
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
	var name string
	err := r.Store.Row(ctx, q, "SELECT name FROM unicore_roles WHERE id=?", id).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return contracts.Role{}, platform.ErrInput
	}
	if err != nil {
		return contracts.Role{}, err
	}
	result := contracts.Role{ID: id, Name: name, Builtin: platform.BuiltinRole(id), Permissions: []string{}}
	if id == "super_admin" {
		result.Permissions = append(result.Permissions, platform.Permissions...)
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
	if err := r.Store.Row(ctx, q, "SELECT COUNT(*) FROM unicore_users u JOIN unicore_user_roles ur ON ur.user_id=u.id WHERE ur.role_id=?", id).Scan(&result.UserCount); err != nil {
		return contracts.Role{}, err
	}
	return result, nil
}

func (r *Repository) ListRoles(ctx context.Context) (contracts.RoleList, error) {
	result := contracts.RoleList{Items: []contracts.Role{}, Permissions: platform.PermissionCatalog}
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
	if user.Status != "active" || !platform.Has(user, permission) || !platform.IsSuper(user) {
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
	if actor.Status != "active" || !platform.IsSuper(actor) {
		return result, platform.ErrForbidden
	}
	roles, err := r.ListRoles(ctx)
	if err != nil {
		return result, err
	}
	for _, role := range roles.Items {
		// The administrator realm only ever assigns super_admin; the user realm
		// offers its builtin role plus every custom role.
		if r.Administrators && role.ID != "super_admin" {
			continue
		}
		if !r.Administrators && role.ID == "super_admin" {
			continue
		}
		result.Items = append(result.Items, contracts.RoleOption{ID: role.ID, Name: role.Name, Assignable: true})
	}
	return result, nil
}

// CreateRole adds a custom user-realm role. Grant checks run in the usecase layer
// and are re-defended here: only assignable permission points may be granted.
func (r *Repository) CreateRole(ctx context.Context, name string, permissions []string, actor string) (contracts.Role, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return contracts.Role{}, platform.ErrInput
	}
	for _, permission := range permissions {
		if !platform.AssignablePermission(permission) {
			return contracts.Role{}, platform.ErrForbidden
		}
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
	id := sqlstore.ID()
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_roles(id,name) VALUES(?,?)", id, name); err != nil {
		return contracts.Role{}, accountError(err)
	}
	if err = r.writeRolePermissions(ctx, tx, id, permissions); err != nil {
		return contracts.Role{}, err
	}
	if err = r.audit(audit.Target(ctx, "role/"+id, "name="+name+"; permissions="+strings.Join(permissions, ",")), tx, actor, "roles.created"); err != nil {
		return contracts.Role{}, err
	}
	role, err := r.role(ctx, tx, id)
	if err != nil {
		return contracts.Role{}, err
	}
	return role, tx.Commit()
}

// UpdateRole edits name and grants. The builtin user role keeps its name but may
// be re-scoped; super_admin is immutable.
func (r *Repository) UpdateRole(ctx context.Context, id string, name string, permissions []string, actor string) (contracts.Role, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return contracts.Role{}, platform.ErrInput
	}
	for _, permission := range permissions {
		if !platform.AssignablePermission(permission) {
			return contracts.Role{}, platform.ErrForbidden
		}
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
	if !before.Builtin {
		if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_roles SET name=? WHERE id=?", name, id); err != nil {
			return contracts.Role{}, accountError(err)
		}
	}
	if err = r.writeRolePermissions(ctx, tx, id, permissions); err != nil {
		return contracts.Role{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id IN (SELECT user_id FROM unicore_user_roles WHERE role_id=?)", id); err != nil {
		return contracts.Role{}, err
	}
	if err = r.audit(audit.Target(ctx, "role/"+id, "sessions=revoked; permissions="+strings.Join(permissions, ",")), tx, actor, "roles.updated"); err != nil {
		return contracts.Role{}, err
	}
	role, err := r.role(ctx, tx, id)
	if err != nil {
		return contracts.Role{}, err
	}
	return role, tx.Commit()
}

// DeleteRole refuses builtin roles and roles that still have members.
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
	var count int
	if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_user_roles WHERE role_id=?", id).Scan(&count); err != nil {
		return contracts.Role{}, err
	}
	if count != 0 {
		return contracts.Role{}, platform.ErrConflict
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

// EnsurePermissions re-applies the catalogue to an installed instance so new
// permission points and the super_admin grant set survive version upgrades.
func (r *Repository) EnsurePermissions(ctx context.Context) error {
	for _, permission := range platform.Permissions {
		if _, err := r.Store.Exec(ctx, r.Store.DB, "INSERT INTO unicore_permissions(id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM unicore_permissions WHERE id=?)", permission, permission); err != nil {
			return err
		}
		if _, err := r.Store.Exec(ctx, r.Store.DB, "INSERT INTO unicore_role_permissions(role_id,permission_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM unicore_role_permissions WHERE role_id=? AND permission_id=?)", "super_admin", permission, "super_admin", permission); err != nil {
			return err
		}
	}
	return nil
}
