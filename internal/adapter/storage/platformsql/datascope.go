// Author: yunnuo <ymz@ebox.vip>
// Description: Session-to-visible-user-set resolution; database failures reject access.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// DataScope unions only scopes from roles granting the requested permission.
// Callers must name the resource permission; unrelated roles cannot widen it.
func (r *Repository) DataScope(ctx context.Context, user contracts.User, permission string) (platform.ScopeFilter, error) {
	return r.resolveDataScope(ctx, r.Store.DB, user, permission, true)
}

// DepartmentScope resolves department ownership without expanding department
// members. Personal user-owned repositories should continue using DataScope.
func (r *Repository) DepartmentScope(ctx context.Context, user contracts.User, permission string) (platform.ScopeFilter, error) {
	return r.resolveDataScope(ctx, r.Store.DB, user, permission, false)
}

// AuthorizeDepartmentMutation runs after LockInstallation in the same transaction
// that reads the resource's current department/deleted state and writes the change.
// Every prerequisite (usually browse) is intersected with the mutation scope.
func (r *Repository) AuthorizeDepartmentMutation(ctx context.Context, tx *sql.Tx, actorID, departmentID, writePoint, operation string, prerequisitePoints ...string) error {
	return r.authorizeDepartments(ctx, tx, actorID, []string{departmentID}, writePoint, operation, prerequisitePoints...)
}

// AuthorizeDepartmentTransfer checks BOTH the persisted source and proposed
// destination against each permission's fresh scope. It never treats a creator
// ID as a department. The caller holds the installation lock until commit.
func (r *Repository) AuthorizeDepartmentTransfer(ctx context.Context, tx *sql.Tx, actorID, sourceID, destinationID, writePoint, operation string, prerequisitePoints ...string) error {
	return r.authorizeDepartments(ctx, tx, actorID, []string{sourceID, destinationID}, writePoint, operation, prerequisitePoints...)
}

func (r *Repository) authorizeDepartments(ctx context.Context, tx *sql.Tx, actorID string, departments []string, writePoint, operation string, prerequisitePoints ...string) error {
	if tx == nil || writePoint == "" || operation == "" {
		return platform.ErrForbidden
	}
	actor, err := r.actor(ctx, tx, actorID, writePoint)
	if err != nil {
		return err
	}
	if !platform.OperationAllowed(actor, operation) {
		return platform.ErrForbidden
	}
	for _, point := range append([]string{writePoint}, prerequisitePoints...) {
		if point == "" || !platform.Has(actor, point) {
			return platform.ErrForbidden
		}
		filter, err := r.resolveDataScope(ctx, tx, actor, point, false)
		if err != nil {
			return err
		}
		for _, department := range departments {
			if !filter.ContainsDepartment(department) {
				return sql.ErrNoRows
			}
		}
	}
	return nil
}

// AuthorizeScopedMutation must run under LockInstallation. Resolve the current
// actor and intersect the browse and mutation scopes, preserving PAT role binding.
func (r *Repository) AuthorizeScopedMutation(ctx context.Context, tx *sql.Tx, actorID, ownerID, writePoint, operation string, prerequisitePoints ...string) error {
	actor, err := r.actor(ctx, tx, actorID, writePoint)
	if err != nil {
		return err
	}
	if !platform.OperationAllowed(actor, operation) {
		return platform.ErrForbidden
	}
	for _, point := range append([]string{writePoint}, prerequisitePoints...) {
		if !platform.Has(actor, point) {
			return platform.ErrForbidden
		}
		filter, err := r.dataScope(ctx, tx, actor, point)
		if err != nil {
			return err
		}
		if !filter.Contains(ownerID) {
			return sql.ErrNoRows
		}
	}
	return nil
}
func (r *Repository) dataScope(ctx context.Context, q sqlstore.Runner, user contracts.User, permission string) (platform.ScopeFilter, error) {
	return r.resolveDataScope(ctx, q, user, permission, true)
}

func (r *Repository) resolveDataScope(ctx context.Context, q sqlstore.Runner, user contracts.User, permission string, expandUsers bool) (platform.ScopeFilter, error) {
	// Defensively preserve the token's single role even if a module passed the
	// full account resource instead of the narrowed request principal.
	if platform.TokenRole(ctx, user.ID) != "" {
		var err error
		user, err = r.principalUser(ctx, q, user.ID)
		if err != nil || user.Status != "active" {
			if err == nil {
				err = platform.ErrForbidden
			}
			return platform.ScopeFilter{}, err
		}
	}
	filter := platform.ScopeFilter{UserIDs: []string{user.ID}}
	if permission == "" {
		return filter, platform.ErrForbidden
	}
	if platform.IsSuper(user) {
		return platform.ScopeFilter{All: true}, nil
	}
	if user.ID == "" {
		return filter, nil
	}
	all := false
	custom := map[string]bool{}
	own, below := false, false
	for _, roleID := range user.Roles {
		var scope string
		err := r.Store.Row(ctx, q, "SELECT data_scope FROM unicore_roles WHERE id=? AND EXISTS (SELECT 1 FROM unicore_role_permissions WHERE role_id=? AND permission_id=?)", roleID, roleID, permission).Scan(&scope)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return filter, err
		}
		switch scope {
		case platform.ScopeAll:
			all = true
		case platform.ScopeDept:
			own = true
		case platform.ScopeDeptBelow:
			below = true
		case platform.ScopeCustom:
			rows, err := r.Store.Rows(ctx, q, "SELECT department_id FROM unicore_role_departments WHERE role_id=?", roleID)
			if err != nil {
				return filter, err
			}
			for rows.Next() {
				var department string
				if err = rows.Scan(&department); err != nil {
					rows.Close()
					return filter, err
				}
				custom[department] = true
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return filter, err
			}
		case platform.ScopeSelf:
		default:
			// Unknown scope values fail closed: the role contributes nothing.
		}
	}
	if all {
		return platform.ScopeFilter{All: true}, nil
	}
	departments, err := r.scopeDepartmentsWith(ctx, q, user.ID, own, below, custom)
	if err != nil {
		return platform.ScopeFilter{}, err
	}
	filter.DepartmentIDs = setSlice(departments)
	sort.Strings(filter.DepartmentIDs)
	if expandUsers {
		filter.UserIDs, err = r.usersInDepartments(ctx, q, user.ID, departments)
		if err != nil {
			return platform.ScopeFilter{}, err
		}
	}
	return filter, nil
}

// scopeUsers expands the requested anchors - the session user's own department,
// its subtree and the configured custom departments - into platform user ids,
// always including the session user.
func (r *Repository) scopeUsers(ctx context.Context, self string, own, below bool, custom map[string]bool) ([]string, error) {
	return r.scopeUsersWith(ctx, r.Store.DB, self, own, below, custom)
}
func (r *Repository) scopeUsersWith(ctx context.Context, q sqlstore.Runner, self string, own, below bool, custom map[string]bool) ([]string, error) {
	departments, err := r.scopeDepartmentsWith(ctx, q, self, own, below, custom)
	if err != nil {
		return nil, err
	}
	return r.usersInDepartments(ctx, q, self, departments)
}

func (r *Repository) scopeDepartmentsWith(ctx context.Context, q sqlstore.Runner, self string, own, below bool, custom map[string]bool) (map[string]bool, error) {
	var ownDepartment string
	if own || below {
		var department sql.NullString
		if err := r.Store.Row(ctx, q, "SELECT department_id FROM unicore_users WHERE id=?", self).Scan(&department); err != nil {
			return nil, err
		}
		if department.Valid {
			ownDepartment = department.String
		}
	}
	departments := map[string]bool{}
	for id := range custom {
		if id != "" {
			departments[id] = true
		}
	}
	if ownDepartment != "" {
		departments[ownDepartment] = true
	}
	if below && ownDepartment != "" {
		ids, err := r.subtreeDepartmentsWith(ctx, q, ownDepartment)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			departments[id] = true
		}
	}
	return departments, nil
}

func (r *Repository) usersInDepartments(ctx context.Context, q sqlstore.Runner, self string, departments map[string]bool) ([]string, error) {
	result := []string{self}
	if len(departments) == 0 {
		return result, nil
	}
	seen := map[string]bool{self: true}
	ids := setSlice(departments)
	for start := 0; start < len(ids); start += 100 {
		end := start + 100
		if end > len(ids) {
			end = len(ids)
		}
		batch := ids[start:end]
		query := "SELECT id FROM unicore_users WHERE department_id IN (?" + strings.Repeat(",?", len(batch)-1) + ")"
		args := make([]any, 0, len(batch))
		for _, department := range batch {
			args = append(args, department)
		}
		rows, err := r.Store.Rows(ctx, q, query, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			if !seen[id] {
				seen[id] = true
				result = append(result, id)
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}
	sort.Strings(result[1:])
	return result, nil
}

// subtreeDepartments walks the department tree downwards from the given root,
// bounded to keep corrupted parent chains finite.
func (r *Repository) subtreeDepartments(ctx context.Context, root string) ([]string, error) {
	return r.subtreeDepartmentsWith(ctx, r.Store.DB, root)
}
func (r *Repository) subtreeDepartmentsWith(ctx context.Context, q sqlstore.Runner, root string) ([]string, error) {
	rows, err := r.Store.Rows(ctx, q, "SELECT id,parent_id FROM unicore_departments")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	parents := map[string]string{}
	for rows.Next() {
		var id string
		var parent sql.NullString
		if err = rows.Scan(&id, &parent); err != nil {
			return nil, err
		}
		if parent.Valid {
			parents[id] = parent.String
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	result := []string{root}
	seen := map[string]bool{root: true}
	for i := 0; i < len(result); i++ {
		for id, parent := range parents {
			if parent == result[i] && !seen[id] {
				seen[id] = true
				result = append(result, id)
			}
		}
	}
	return result, nil
}

func setSlice(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	return out
}

// checkDestination prevents scoped managers from moving accounts into another
// scope or using account creation to populate an unrelated department.
func (r *Repository) checkDestination(ctx context.Context, q sqlstore.Runner, actor contracts.User, permission string, destination *string) error {
	if platform.IsSuper(actor) {
		return nil
	}
	var own sql.NullString
	if err := r.Store.Row(ctx, q, "SELECT department_id FROM unicore_users WHERE id=?", actor.ID).Scan(&own); err != nil {
		return err
	}
	for _, role := range actor.Roles {
		var scope string
		err := r.Store.Row(ctx, q, "SELECT data_scope FROM unicore_roles WHERE id=? AND EXISTS (SELECT 1 FROM unicore_role_permissions WHERE role_id=? AND permission_id=?)", role, role, permission).Scan(&scope)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		if scope == platform.ScopeAll {
			return nil
		}
		if destination == nil || *destination == "" {
			continue
		}
		switch scope {
		case platform.ScopeDept:
			if own.Valid && own.String == *destination {
				return nil
			}
		case platform.ScopeDeptBelow:
			if own.Valid {
				ids, err := r.subtreeDepartmentsWith(ctx, q, own.String)
				if err != nil {
					return err
				}
				for _, id := range ids {
					if id == *destination {
						return nil
					}
				}
			}
		case platform.ScopeCustom:
			var count int
			if err := r.Store.Row(ctx, q, "SELECT COUNT(*) FROM unicore_role_departments WHERE role_id=? AND department_id=?", role, *destination).Scan(&count); err != nil {
				return err
			}
			if count > 0 {
				return nil
			}
		}
	}
	return platform.ErrForbidden
}
