// Author: yunnuo <ymz@ebox.vip>
// Description: Department organization tree: transactional CRUD with cycle, sibling-name and delete guards.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// departmentError normalizes driver uniqueness failures to input errors: the
// sibling-name uniqueness is validated in the transaction first, so a duplicate
// reaching the index is a concurrent write of the same invalid input.
func departmentError(err error) error {
	if err != nil && (strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(strings.ToLower(err.Error()), "duplicate")) {
		return platform.ErrInput
	}
	return err
}

func (r *Repository) department(ctx context.Context, q sqlstore.Runner, id string) (contracts.Department, error) {
	var d contracts.Department
	var parent sql.NullString
	err := r.Store.Row(ctx, q, "SELECT id,name,parent_id,sort,created_at,updated_at FROM unicore_departments WHERE id=?", id).Scan(&d.ID, &d.Name, &parent, &d.Sort, &d.CreatedAt, &d.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return contracts.Department{}, platform.ErrInput
	}
	if err != nil {
		return contracts.Department{}, err
	}
	if parent.Valid {
		d.ParentID = &parent.String
	}
	return d, nil
}

// ListDepartments returns the flat department table; clients assemble the tree
// from parent_id. Ordering is stable: sibling sort value, then name, then id.
func (r *Repository) ListDepartments(ctx context.Context) (contracts.DepartmentList, error) {
	result := contracts.DepartmentList{Items: []contracts.Department{}}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT id,name,parent_id,sort,created_at,updated_at FROM unicore_departments ORDER BY sort,name,id")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var d contracts.Department
		var parent sql.NullString
		if err = rows.Scan(&d.ID, &d.Name, &parent, &d.Sort, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return result, err
		}
		if parent.Valid {
			d.ParentID = &parent.String
		}
		result.Items = append(result.Items, d)
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	result.Total = len(result.Items)
	return result, nil
}

// validateDepartmentInput trims and bounds the name, defaults the sort value
// and resolves the parent department inside the caller's transaction.
func (r *Repository) validateDepartmentInput(ctx context.Context, q sqlstore.Runner, input contracts.DepartmentSaveInput) (string, *string, int, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len(name) > 64 {
		return "", nil, 0, platform.ErrInput
	}
	sort := 0
	if input.Sort != nil {
		sort = *input.Sort
		if sort < 0 {
			return "", nil, 0, platform.ErrInput
		}
	}
	var parent *string
	if input.ParentID != nil && strings.TrimSpace(*input.ParentID) != "" {
		id := strings.TrimSpace(*input.ParentID)
		if _, err := r.department(ctx, q, id); err != nil {
			return "", nil, 0, err
		}
		parent = &id
	}
	return name, parent, sort, nil
}

// siblingTaken reports whether another department under the same parent already
// uses the name. NULL parents compare as ” to mirror the dialect indexes.
func (r *Repository) siblingTaken(ctx context.Context, q sqlstore.Runner, name string, parent *string, exclude string) (bool, error) {
	var count int
	parentKey := ""
	if parent != nil {
		parentKey = *parent
	}
	query := "SELECT COUNT(*) FROM unicore_departments WHERE name=? AND COALESCE(parent_id,'')=?"
	args := []any{name, parentKey}
	if exclude != "" {
		query += " AND id<>?"
		args = append(args, exclude)
	}
	if err := r.Store.Row(ctx, q, query, args...).Scan(&count); err != nil {
		return false, err
	}
	return count != 0, nil
}

// sameDepartmentParent reports whether a rename-only update keeps the tree
// position; nil and the empty string both mean a root department.
func sameDepartmentParent(before *string, after *string) bool {
	if before == nil || after == nil {
		return before == nil && after == nil
	}
	return *before == *after
}

// CreateDepartment adds a root or child department after checking the parent
// and sibling-name uniqueness inside the install-locked transaction.
func (r *Repository) CreateDepartment(ctx context.Context, input contracts.DepartmentSaveInput, actor string) (contracts.Department, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Department{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Department{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "departments:write"); err != nil {
		return contracts.Department{}, err
	}
	name, parent, sort, err := r.validateDepartmentInput(ctx, tx, input)
	if err != nil {
		return contracts.Department{}, err
	}
	taken, err := r.siblingTaken(ctx, tx, name, parent, "")
	if err != nil {
		return contracts.Department{}, err
	}
	if taken {
		return contracts.Department{}, platform.ErrInput
	}
	id := sqlstore.ID()
	now := time.Now().Unix()
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_departments(id,name,parent_id,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)", id, name, parent, sort, now, now); err != nil {
		return contracts.Department{}, departmentError(err)
	}
	if err = r.audit(audit.Target(ctx, "department/"+id, "name="+name+"; sort="+strconv.Itoa(sort)), tx, actor, "departments.created"); err != nil {
		return contracts.Department{}, err
	}
	department, err := r.department(ctx, tx, id)
	if err != nil {
		return contracts.Department{}, err
	}
	return department, tx.Commit()
}

// UpdateDepartment edits name, parent and sort. The new parent chain must not
// pass through the department itself, which forbids every cycle shape.
func (r *Repository) UpdateDepartment(ctx context.Context, id string, input contracts.DepartmentSaveInput, actor string) (contracts.Department, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Department{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Department{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "departments:write"); err != nil {
		return contracts.Department{}, err
	}
	before, err := r.department(ctx, tx, id)
	if err != nil {
		return contracts.Department{}, err
	}
	name, parent, sort, err := r.validateDepartmentInput(ctx, tx, input)
	if err != nil {
		return contracts.Department{}, err
	}
	if parent != nil {
		// Walk upwards from the new parent; reaching the department itself means
		// the move would create a cycle. The depth bound keeps a corrupted
		// self-referential table from looping forever.
		cursor := *parent
		seen := map[string]bool{}
		for depth := 0; cursor != ""; depth++ {
			if depth >= 64 || seen[cursor] || cursor == id {
				return contracts.Department{}, platform.ErrInput
			}
			seen[cursor] = true
			var next sql.NullString
			if err = r.Store.Row(ctx, tx, "SELECT parent_id FROM unicore_departments WHERE id=?", cursor).Scan(&next); err != nil {
				return contracts.Department{}, err
			}
			if !next.Valid {
				break
			}
			cursor = next.String
		}
	}
	taken, err := r.siblingTaken(ctx, tx, name, parent, id)
	if err != nil {
		return contracts.Department{}, err
	}
	if taken {
		return contracts.Department{}, platform.ErrInput
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_departments SET name=?,parent_id=?,sort=?,updated_at=? WHERE id=?", name, parent, sort, time.Now().Unix(), id); err != nil {
		return contracts.Department{}, departmentError(err)
	}
	if !sameDepartmentParent(before.ParentID, parent) {
		// A move affects both old and new ancestor scopes, including custom role
		// unions. Conservatively revoke user sessions in the same transaction.
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_sessions"); err != nil {
			return contracts.Department{}, err
		}
	}
	if err = r.audit(audit.Target(ctx, "department/"+id, "name="+name+"; sort="+strconv.Itoa(sort)), tx, actor, "departments.updated"); err != nil {
		return contracts.Department{}, err
	}
	department, err := r.department(ctx, tx, id)
	if err != nil {
		return contracts.Department{}, err
	}
	return department, tx.Commit()
}

// DeleteDepartment refuses departments that still have children or attached
// users, so no user silently loses their department scope anchor; the custom
// scope references of a removable department are cleaned up with it.
func (r *Repository) DeleteDepartment(ctx context.Context, id string, actor string) (contracts.Department, error) {
	before, err := r.department(ctx, r.Store.DB, id)
	if err != nil {
		return contracts.Department{}, err
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Department{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Department{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "departments:write"); err != nil {
		return contracts.Department{}, err
	}
	var dependent int
	if err = r.Store.Row(ctx, tx, "SELECT (SELECT COUNT(*) FROM unicore_departments WHERE parent_id=?)+(SELECT COUNT(*) FROM unicore_users WHERE department_id=?)", id, id).Scan(&dependent); err != nil {
		return contracts.Department{}, err
	}
	if dependent != 0 {
		return contracts.Department{}, platform.ErrDepartmentInUse
	}
	result, err := r.Store.Exec(ctx, tx, "DELETE FROM unicore_departments WHERE id=?", id)
	if err != nil {
		return contracts.Department{}, err
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return contracts.Department{}, platform.ErrInput
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_role_departments WHERE department_id=?", id); err != nil {
		return contracts.Department{}, err
	}
	// Custom scope references disappear with the department, so the resolved
	// data scope of every user-realm session is refreshed by revoking the
	// sessions in the same transaction; clients re-authenticate against the
	// new scope instead of caching the old one.
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_sessions"); err != nil {
		return contracts.Department{}, err
	}
	if err = r.audit(audit.Target(ctx, "department/"+id, "deleted"), tx, actor, "departments.deleted"); err != nil {
		return contracts.Department{}, err
	}
	return before, tx.Commit()
}
