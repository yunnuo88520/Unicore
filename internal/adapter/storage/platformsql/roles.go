// Author: yunnuo <ymz@ebox.vip>
// Description: Read-only fixed role catalogue and transactional administrator authorization.
package platformsql

import (
	"context"
	"database/sql"
	"errors"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func (r *Repository) role(ctx context.Context, q sqlstore.Runner, id string) (contracts.Role, error) {
	result := contracts.Role{ID: id, Builtin: true, Permissions: []string{}}
	if !platform.BuiltinRole(id) {
		return result, platform.ErrInput
	}
	result.Name = "普通用户"
	if id == "super_admin" {
		result.Name = "管理员"
		result.Permissions = append(result.Permissions, platform.Permissions...)
	}
	table := "users"
	if id == "super_admin" {
		table = "administrators"
	}
	err := r.Store.Row(ctx, q, "SELECT COUNT(*) FROM "+table).Scan(&result.UserCount)
	return result, err
}
func (r *Repository) ListRoles(ctx context.Context) (contracts.RoleList, error) {
	result := contracts.RoleList{Items: []contracts.Role{}, Permissions: platform.PermissionCatalog}
	for _, id := range []string{"super_admin", "user"} {
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
func canAssign(actor contracts.User, role contracts.Role) bool {
	return platform.IsSuper(actor) && platform.BuiltinRole(role.ID)
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
		result.Items = append(result.Items, contracts.RoleOption{ID: role.ID, Name: role.Name, Assignable: true})
	}
	return result, nil
}

// AuthorizeAdministrator must run after LockInstallation in the mutation transaction.
// Fixed identity table, active state and permission are rechecked against current data.
func (r *Repository) AuthorizeAdministrator(ctx context.Context, tx *sql.Tx, id, permission string) error {
	_, err := r.actor(ctx, tx, id, permission)
	return err
}
