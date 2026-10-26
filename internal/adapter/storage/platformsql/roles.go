// Author: yunnuo <ymz@ebox.vip>
// Description: Transactional role editing, bounded delegation and session revocation.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func (r *Repository) role(ctx context.Context, q sqlstore.Runner, id string) (contracts.Role, error) {
	result := contracts.Role{ID: id, Builtin: platform.BuiltinRole(id), Permissions: []string{}}
	if err := r.Store.Row(ctx, q, "SELECT name FROM roles WHERE id=?", id).Scan(&result.Name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return result, platform.ErrRoleNotFound
		}
		return result, err
	}
	if err := r.Store.Row(ctx, q, "SELECT COUNT(*) FROM user_roles WHERE role_id=?", id).Scan(&result.UserCount); err != nil {
		return result, err
	}
	rows, err := r.Store.Rows(ctx, q, "SELECT permission_id FROM role_permissions WHERE role_id=? ORDER BY permission_id", id)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var permission string
		if err = rows.Scan(&permission); err != nil {
			return result, err
		}
		result.Permissions = append(result.Permissions, permission)
	}
	return result, rows.Err()
}

func (r *Repository) ListRoles(ctx context.Context) (contracts.RoleList, error) {
	result := contracts.RoleList{Items: []contracts.Role{}, Permissions: platform.PermissionCatalog}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT id FROM roles ORDER BY name,id")
	if err != nil {
		return result, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	rowsErr := rows.Err()
	_ = rows.Close()
	if err != nil {
		return result, err
	}
	if rowsErr != nil {
		return result, rowsErr
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

func (r *Repository) actor(ctx context.Context, tx *sql.Tx, id, permission string, super bool) (contracts.User, error) {
	user, err := r.user(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return user, platform.ErrForbidden
	}
	if err != nil {
		return user, err
	}
	if user.Status != "active" || !platform.Has(user, permission) || (super && !platform.IsSuper(user)) {
		return user, platform.ErrForbidden
	}
	return user, nil
}

func canAssign(actor contracts.User, role contracts.Role) bool {
	if platform.IsSuper(actor) {
		return true
	}
	if role.ID == "super_admin" {
		return false
	}
	for _, permission := range role.Permissions {
		if !platform.Has(actor, permission) {
			return false
		}
	}
	return true
}

func (r *Repository) RoleOptions(ctx context.Context, actorID string) (contracts.RoleOptions, error) {
	result := contracts.RoleOptions{Items: []contracts.RoleOption{}}
	actor, err := r.user(ctx, r.Store.DB, actorID)
	if err != nil {
		return result, err
	}
	if actor.Status != "active" || (!platform.Has(actor, "users:read") && !platform.Has(actor, "users:create") && !platform.Has(actor, "users:update")) {
		return result, platform.ErrForbidden
	}
	roles, err := r.ListRoles(ctx)
	if err != nil {
		return result, err
	}
	for _, role := range roles.Items {
		result.Items = append(result.Items, contracts.RoleOption{ID: role.ID, Name: role.Name, Assignable: canAssign(actor, role)})
	}
	return result, nil
}

func (r *Repository) roleNameAvailable(ctx context.Context, tx *sql.Tx, input contracts.RoleInput, id string) error {
	var count int
	if err := r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM roles WHERE LOWER(name)=? AND id<>?", strings.ToLower(input.Name), id).Scan(&count); err != nil {
		return err
	}
	if count != 0 {
		return platform.ErrRoleConflict
	}
	return nil
}

func (r *Repository) writeRolePermissions(ctx context.Context, tx *sql.Tx, id string, input contracts.RoleInput) error {
	if _, err := r.Store.Exec(ctx, tx, "DELETE FROM role_permissions WHERE role_id=?", id); err != nil {
		return err
	}
	for _, permission := range input.Permissions {
		if _, err := r.Store.Exec(ctx, tx, "INSERT INTO role_permissions(role_id,permission_id) VALUES(?,?)", id, permission); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) CreateRole(ctx context.Context, input contracts.RoleInput, actorID string) (contracts.Role, error) {
	if !platform.ValidateRole(input) {
		return contracts.Role{}, platform.ErrInput
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Role{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Role{}, err
	}
	if _, err = r.actor(ctx, tx, actorID, "roles:write", true); err != nil {
		return contracts.Role{}, err
	}
	if err = r.roleNameAvailable(ctx, tx, input, ""); err != nil {
		return contracts.Role{}, err
	}
	id := sqlstore.ID()
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO roles(id,name) VALUES(?,?)", id, input.Name); err != nil {
		return contracts.Role{}, err
	}
	if err = r.writeRolePermissions(ctx, tx, id, input); err != nil {
		return contracts.Role{}, err
	}
	if err = r.Store.Audit(ctx, tx, actorID, "roles.created:"+id); err != nil {
		return contracts.Role{}, err
	}
	result, err := r.role(ctx, tx, id)
	if err != nil {
		return result, err
	}
	return result, tx.Commit()
}

func (r *Repository) UpdateRole(ctx context.Context, id string, input contracts.RoleInput, actorID string) (contracts.Role, error) {
	if !platform.ValidateRole(input) {
		return contracts.Role{}, platform.ErrInput
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Role{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Role{}, err
	}
	if _, err = r.actor(ctx, tx, actorID, "roles:write", true); err != nil {
		return contracts.Role{}, err
	}
	if platform.BuiltinRole(id) {
		return contracts.Role{}, platform.ErrBuiltinRole
	}
	if _, err = r.role(ctx, tx, id); err != nil {
		return contracts.Role{}, err
	}
	if err = r.roleNameAvailable(ctx, tx, input, id); err != nil {
		return contracts.Role{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE roles SET name=? WHERE id=?", input.Name, id); err != nil {
		return contracts.Role{}, err
	}
	if err = r.writeRolePermissions(ctx, tx, id, input); err != nil {
		return contracts.Role{}, err
	}
	// Collect before mutating: SQLite uses one connection; no open cursor may remain.
	rows, err := r.Store.Rows(ctx, tx, "SELECT user_id FROM user_roles WHERE role_id=?", id)
	if err != nil {
		return contracts.Role{}, err
	}
	users := []string{}
	for rows.Next() {
		var user string
		if err = rows.Scan(&user); err != nil {
			break
		}
		users = append(users, user)
	}
	rowsErr := rows.Err()
	_ = rows.Close()
	if err != nil {
		return contracts.Role{}, err
	}
	if rowsErr != nil {
		return contracts.Role{}, rowsErr
	}
	for _, user := range users {
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM sessions WHERE user_id=?", user); err != nil {
			return contracts.Role{}, err
		}
		if err = r.cancelTokens(ctx, tx, user, ""); err != nil {
			return contracts.Role{}, err
		}
	}
	if err = r.Store.Audit(ctx, tx, actorID, "roles.updated:"+id); err != nil {
		return contracts.Role{}, err
	}
	result, err := r.role(ctx, tx, id)
	if err != nil {
		return result, err
	}
	return result, tx.Commit()
}

func (r *Repository) DeleteRole(ctx context.Context, id, actorID string) error {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	if _, err = r.actor(ctx, tx, actorID, "roles:write", true); err != nil {
		return err
	}
	if platform.BuiltinRole(id) {
		return platform.ErrBuiltinRole
	}
	role, err := r.role(ctx, tx, id)
	if err != nil {
		return err
	}
	if role.UserCount > 0 {
		return platform.ErrRoleInUse
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM role_permissions WHERE role_id=?", id); err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM roles WHERE id=?", id); err != nil {
		return err
	}
	if err = r.Store.Audit(ctx, tx, actorID, "roles.deleted:"+id); err != nil {
		return err
	}
	return tx.Commit()
}
