// Author: yunnuo <ymz@ebox.vip>
// Description: SQL identity adapter; isolated from local/Desktop storage composition.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
)

type Repository struct {
	Store               *sqlstore.Store
	Administrators      bool
	NotificationSecrets mailer.Secrets
}

func accountError(err error) error {
	if err != nil && (strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(strings.ToLower(err.Error()), "duplicate")) {
		return platform.ErrConflict
	}
	return err
}

func (r *Repository) user(ctx context.Context, q sqlstore.Runner, id string) (contracts.User, error) {
	user := contracts.User{Roles: []string{}, Permissions: []string{}, MenuIds: &[]string{}, ActionIds: &[]string{}, OperationIds: &[]string{}, PostIds: &[]string{}}
	query := "SELECT id,username,email,phone,status,created_at,last_login_at,department_id FROM unicore_users WHERE id=?"
	if r.Administrators {
		// The administrator identity table carries no department column.
		query = "SELECT id,username,email,phone,status,created_at,last_login_at,NULL FROM unicore_administrators WHERE id=?"
	}
	var department *string
	if err := r.row(ctx, q, query, id).Scan(&user.ID, &user.Username, &user.Email, &user.Phone, &user.Status, &user.CreatedAt, &user.LastLoginAt, &department); err != nil {
		return user, err
	}
	user.DepartmentID = department
	state, err := r.personalState(ctx, q, id)
	if err != nil {
		return user, err
	}
	user.TotpEnabled = state.Secret != ""
	if r.Administrators {
		// Administrator roles are data too: echo unicore_administrator_roles and
		// union role_permissions across administrator-realm roles only. Unknown
		// or cross-realm rows stay in the echo but never grant permissions.
		roleRows, err := r.rows(ctx, q, "SELECT role_id FROM unicore_administrator_roles WHERE administrator_id=? ORDER BY role_id", id)
		if err != nil {
			return user, err
		}
		defer roleRows.Close()
		super := false
		for roleRows.Next() {
			var role string
			if err = roleRows.Scan(&role); err != nil {
				return user, err
			}
			user.Roles = append(user.Roles, role)
			if role == "super_admin" {
				super = true
			}
		}
		if err = roleRows.Err(); err != nil {
			return user, err
		}
		if super {
			user.Permissions = append(user.Permissions, platform.Permissions...)
			return user, nil
		}
		rows, err := r.rows(ctx, q, "SELECT rp.permission_id FROM unicore_administrator_roles ar JOIN unicore_role_permissions rp ON rp.role_id=ar.role_id JOIN unicore_roles ro ON ro.id=ar.role_id WHERE ar.administrator_id=? AND ro.realm='administrator' ORDER BY rp.permission_id", id)
		if err != nil {
			return user, err
		}
		defer rows.Close()
		catalogue := map[string]bool{}
		for _, definition := range platform.PermissionCatalog {
			catalogue[definition.ID] = true
		}
		for rows.Next() {
			var permission string
			if err = rows.Scan(&permission); err != nil {
				return user, err
			}
			if catalogue[permission] {
				user.Permissions = append(user.Permissions, permission)
			}
		}
		if err = rows.Err(); err != nil {
			return user, err
		}
		if err = r.loadAuthorizations(ctx, q, &user); err != nil {
			return user, err
		}
		return user, nil
	}
	// User-realm roles are data: echo the assigned user_roles rows so custom
	// roles surface in listings and sessions instead of the hardcoded builtin.
	roleRows, err := r.rows(ctx, q, "SELECT role_id FROM unicore_user_roles WHERE user_id=? ORDER BY role_id", id)
	if err != nil {
		return user, err
	}
	defer roleRows.Close()
	for roleRows.Next() {
		var role string
		if err = roleRows.Scan(&role); err != nil {
			return user, err
		}
		user.Roles = append(user.Roles, role)
	}
	if err = roleRows.Err(); err != nil {
		return user, err
	}
	rows, err := r.rows(ctx, q, "SELECT rp.permission_id FROM unicore_user_roles ur JOIN unicore_role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=? ORDER BY rp.permission_id", id)
	if err != nil {
		return user, err
	}
	defer rows.Close()
	for rows.Next() {
		var permission string
		if err = rows.Scan(&permission); err != nil {
			return user, err
		}
		user.Permissions = append(user.Permissions, permission)
	}
	if err = rows.Err(); err != nil {
		return user, err
	}
	if err = r.loadAuthorizations(ctx, q, &user); err != nil {
		return user, err
	}
	posts, err := r.userPostIDs(ctx, q, id)
	if err != nil {
		return user, err
	}
	user.PostIds = &posts
	return user, nil
}

// loadAuthorizations unions the independent grant sets across a member's
// roles: navigation items, action buttons and API operations. Rows only
// exist for materialized or explicitly granted roles, so an empty union is a
// real empty authorization, never "all".
func (r *Repository) loadAuthorizations(ctx context.Context, q sqlstore.Runner, user *contracts.User) error {
	grants := []struct {
		table  string
		column string
		target *[]string
	}{
		{"unicore_role_menus rm", "rm.menu_id", user.MenuIds},
		{"unicore_role_actions ra", "ra.action_id", user.ActionIds},
		{"unicore_role_operations ro", "ro.operation_id", user.OperationIds},
	}
	memberships := "SELECT role_id FROM unicore_user_roles WHERE user_id=?"
	if r.Administrators {
		memberships = "SELECT role_id FROM unicore_administrator_roles WHERE administrator_id=?"
	}
	for _, grant := range grants {
		rows, err := r.rows(ctx, q, "SELECT DISTINCT "+grant.column+" FROM "+grant.table+" WHERE role_id IN ("+memberships+") ORDER BY 1", user.ID)
		if err != nil {
			return err
		}
		ids := []string{}
		err = func() error {
			defer rows.Close()
			for rows.Next() {
				var id string
				if err := rows.Scan(&id); err != nil {
					return err
				}
				ids = append(ids, id)
			}
			return rows.Err()
		}()
		if err != nil {
			return err
		}
		*grant.target = ids
	}
	return nil
}
func (r *Repository) FindAccount(ctx context.Context, login string) (platform.Account, error) {
	var id, hash string
	err := r.row(ctx, r.Store.DB, "SELECT id,password_hash FROM unicore_users WHERE username=? OR email=?", login, login).Scan(&id, &hash)
	if err != nil {
		return platform.Account{}, err
	}
	user, err := r.user(ctx, r.Store.DB, id)
	return platform.Account{User: user, PasswordHash: hash}, err
}

// Seed only runs inside the install transaction, before the unique installation marker is committed.
func (r *Repository) Seed(ctx context.Context, tx *sql.Tx, input contracts.UserCreate, hash string) (contracts.User, error) {
	for _, role := range []struct{ id, name, realm string }{{"super_admin", "super_admin", "administrator"}, {"user", "user", "user"}} {
		if _, err := r.exec(ctx, tx, "INSERT INTO unicore_roles(id,name,realm) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM unicore_roles WHERE id=?)", role.id, role.name, role.realm, role.id); err != nil {
			return contracts.User{}, err
		}
	}
	for _, permission := range platform.Permissions {
		if _, err := r.exec(ctx, tx, "INSERT INTO unicore_permissions(id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM unicore_permissions WHERE id=?)", permission, permission); err != nil {
			return contracts.User{}, err
		}
		if _, err := r.exec(ctx, tx, "INSERT INTO unicore_role_permissions(role_id,permission_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM unicore_role_permissions WHERE role_id=? AND permission_id=?)", "super_admin", permission, "super_admin", permission); err != nil {
			return contracts.User{}, err
		}
	}
	// The builtin user role starts with every assignable permission point, so
	// existing deployments keep their behaviour after the switch to grants.
	for _, permission := range platform.PermissionCatalog {
		if !permission.Assignable {
			continue
		}
		if _, err := r.exec(ctx, tx, "INSERT INTO unicore_role_permissions(role_id,permission_id) SELECT 'user',? WHERE NOT EXISTS (SELECT 1 FROM unicore_role_permissions WHERE role_id='user' AND permission_id=?)", permission.ID, permission.ID); err != nil {
			return contracts.User{}, err
		}
	}
	return r.insert(ctx, tx, input, hash, "bootstrap")
}
func (r *Repository) insert(ctx context.Context, tx *sql.Tx, input contracts.UserCreate, hash, actor string) (contracts.User, error) {
	// Creation callers hold the installation transaction lock and CreateUser
	// validated the realm-bound role. Check each field for useful feedback,
	// retaining UNIQUE constraints for competing writers.
	for _, field := range []struct{ name, value string }{{"username", input.Username}, {"email", input.Email}} {
		var count int
		if err := r.row(ctx, tx, "SELECT COUNT(*) FROM unicore_users WHERE "+field.name+"=?", field.value).Scan(&count); err != nil {
			return contracts.User{}, err
		}
		if count != 0 {
			return contracts.User{}, &platform.AccountConflict{Field: field.name}
		}
	}
	if input.Phone != nil && *input.Phone != "" {
		var count int
		if err := r.row(ctx, tx, "SELECT COUNT(*) FROM unicore_users WHERE phone=?", *input.Phone).Scan(&count); err != nil {
			return contracts.User{}, err
		}
		if count != 0 {
			return contracts.User{}, &platform.AccountConflict{Field: "phone"}
		}
	}
	id := sqlstore.ID()
	now := time.Now().Unix()
	// Only the user identity table carries a department column; administrator
	// accounts never belong to a department.
	values := []any{id, input.Username, input.Email, input.Phone, hash, "active", now, now, 0}
	columns := "id,username,email,phone,password_hash,status,created_at,updated_at,last_login_at"
	holders := "?,?,?,?,?,?,?,?,?"
	if !r.Administrators && input.DepartmentID != nil && *input.DepartmentID != "" {
		columns += ",department_id"
		holders += ",?"
		values = append(values, *input.DepartmentID)
	}
	if _, err := r.exec(ctx, tx, "INSERT INTO unicore_users("+columns+") VALUES("+holders+")", values...); err != nil {
		return contracts.User{}, accountError(err)
	}
	// The administrator membership table names its column administrator_id, so
	// the assignment statement stays realm-specific instead of scoped-rewritten.
	if r.Administrators {
		if _, err := r.exec(ctx, tx, "INSERT INTO unicore_administrator_roles(administrator_id,role_id) VALUES(?,?)", id, input.Role); err != nil {
			return contracts.User{}, err
		}
	} else if _, err := r.exec(ctx, tx, "INSERT INTO unicore_user_roles(user_id,role_id) VALUES(?,?)", id, input.Role); err != nil {
		return contracts.User{}, err
	}
	// Post memberships ride the same installation transaction: an omitted list
	// creates no memberships, a non-empty one validates each post (disabled
	// posts are refused for new members) and the administrator realm refuses.
	if input.PostIds != nil && len(*input.PostIds) > 0 {
		ids, err := r.validateUserPosts(ctx, tx, "", *input.PostIds)
		if err != nil {
			return contracts.User{}, err
		}
		if err = r.writeUserPosts(ctx, tx, id, ids); err != nil {
			return contracts.User{}, err
		}
	}
	action := "users.created"
	if r.Administrators {
		action = "administrators.created"
	}
	if err := r.audit(audit.Target(ctx, r.roleID()+"/"+id, "role="+input.Role+"; status=active"), tx, actor, action); err != nil {
		return contracts.User{}, err
	}
	return r.user(ctx, tx, id)
}
func (r *Repository) CreateUser(ctx context.Context, input contracts.UserCreate, hash, actor string) (contracts.User, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.User{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.User{}, err
	}
	permission := "users:create"
	if r.Administrators {
		permission = "administrators:create"
	}
	current, err := r.actor(ctx, tx, actor, permission)
	if err != nil {
		return contracts.User{}, err
	}
	role, err := r.role(ctx, tx, input.Role)
	if err != nil {
		return contracts.User{}, err
	}
	// Roles never cross realms: administrator accounts take super_admin or an
	// administrator-realm custom role, user accounts a user-realm role.
	if r.Administrators && role.Realm != "administrator" || !r.Administrators && (role.Realm != "user" || role.ID == "super_admin") {
		return contracts.User{}, platform.ErrForbidden
	}
	// Departments exist only for user accounts; a bad id is rejected here.
	if !r.Administrators && input.DepartmentID != nil && *input.DepartmentID != "" {
		if _, err = r.department(ctx, tx, *input.DepartmentID); err != nil {
			return contracts.User{}, err
		}
	}
	_ = current
	user, err := r.insert(ctx, tx, input, hash, actor)
	if err != nil {
		return user, err
	}
	return user, tx.Commit()
}
func (r *Repository) UpdateUser(ctx context.Context, id string, input contracts.UserUpdate, actor string) (contracts.User, error) {
	// An omitted or empty role keeps the current membership rows; a non-empty
	// role replaces them with a single assignment of the same realm.
	role := ""
	if input.Role != nil {
		role = *input.Role
	}
	if input.Status != "active" && input.Status != "disabled" && input.Status != "pending" {
		return contracts.User{}, platform.ErrInput
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.User{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.User{}, err
	}
	permission := "users:update"
	if r.Administrators {
		permission = "administrators:update"
	}
	if _, err = r.actor(ctx, tx, actor, permission); err != nil {
		return contracts.User{}, err
	}
	if role != "" {
		assigned, err := r.role(ctx, tx, role)
		if err != nil {
			return contracts.User{}, err
		}
		if r.Administrators && assigned.Realm != "administrator" || !r.Administrators && (assigned.Realm != "user" || assigned.ID == "super_admin") {
			return contracts.User{}, platform.ErrForbidden
		}
	}
	before, err := r.user(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return contracts.User{}, platform.ErrInput
	}
	if err != nil {
		return contracts.User{}, err
	}
	if input.Status == "pending" && before.Status != "pending" {
		return contracts.User{}, platform.ErrInput
	}
	isAdmin := false
	for _, member := range before.Roles {
		if member == "super_admin" {
			isAdmin = true
		}
	}
	// The effective role decides last-admin protection; an omitted role keeps
	// the current assignment (restricted administrators are not super_admin
	// holders and never trigger the guard).
	effective := role
	if effective == "" && len(before.Roles) > 0 {
		effective = before.Roles[0]
	}
	if isAdmin && before.Status == "active" && (effective != "super_admin" || input.Status != "active") {
		// Only super_admin holders count toward the guard; restricted
		// administrators keep the instance manageable. The membership join is
		// realm-literal: the administrator table names its column
		// administrator_id, which scoped() rewrites cannot express.
		identityTable := "unicore_users"
		membership := "unicore_user_roles ur ON ur.user_id=u.id"
		if r.Administrators {
			identityTable = "unicore_administrators"
			membership = "unicore_administrator_roles ur ON ur.administrator_id=u.id"
		}
		var count int
		if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM "+identityTable+" u JOIN "+membership+" WHERE ur.role_id='super_admin' AND u.status='active'").Scan(&count); err != nil {
			return contracts.User{}, err
		}
		if count <= 1 {
			return contracts.User{}, platform.ErrLastAdmin
		}
		var passwordHash string
		if err = r.Store.Row(ctx, tx, "SELECT password_hash FROM "+identityTable+" WHERE id=?", id).Scan(&passwordHash); err != nil {
			return contracts.User{}, err
		}
		if passwordHash != "" {
			if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM "+identityTable+" u JOIN "+membership+" WHERE ur.role_id='super_admin' AND u.status='active' AND u.password_hash<>''").Scan(&count); err != nil {
				return contracts.User{}, err
			}
			if count <= 1 {
				return contracts.User{}, platform.ErrLastAdmin
			}
		}
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_users SET status=?,updated_at=? WHERE id=?", input.Status, time.Now().Unix(), id); err != nil {
		return contracts.User{}, err
	}
	if role != "" {
		if r.Administrators {
			if _, err = r.exec(ctx, tx, "DELETE FROM unicore_administrator_roles WHERE administrator_id=?", id); err != nil {
				return contracts.User{}, err
			}
			if _, err = r.exec(ctx, tx, "INSERT INTO unicore_administrator_roles(administrator_id,role_id) VALUES(?,?)", id, role); err != nil {
				return contracts.User{}, err
			}
		} else {
			if _, err = r.exec(ctx, tx, "DELETE FROM unicore_user_roles WHERE user_id=?", id); err != nil {
				return contracts.User{}, err
			}
			if _, err = r.exec(ctx, tx, "INSERT INTO unicore_user_roles(user_id,role_id) VALUES(?,?)", id, role); err != nil {
				return contracts.User{}, err
			}
		}
	}
	// Post memberships are user-realm only: an omitted list keeps the current
	// memberships, an explicit list replaces them (retained disabled posts stay
	// allowed, newly assigned disabled posts are refused), and the
	// administrator realm refuses any non-empty set.
	if input.PostIds != nil {
		if _, err = r.validateUserPosts(ctx, tx, id, *input.PostIds); err != nil {
			return contracts.User{}, err
		}
		if err = r.writeUserPosts(ctx, tx, id, *input.PostIds); err != nil {
			return contracts.User{}, err
		}
	}
	// Department changes are user-realm only: omit/null keeps the current
	// department, an empty string clears it, a non-empty id must exist.
	if !r.Administrators && input.DepartmentID != nil {
		if *input.DepartmentID == "" {
			if _, err = r.exec(ctx, tx, "UPDATE unicore_users SET department_id=NULL,updated_at=? WHERE id=?", time.Now().Unix(), id); err != nil {
				return contracts.User{}, err
			}
		} else {
			if _, err = r.department(ctx, tx, *input.DepartmentID); err != nil {
				return contracts.User{}, err
			}
			if _, err = r.exec(ctx, tx, "UPDATE unicore_users SET department_id=?,updated_at=? WHERE id=?", *input.DepartmentID, time.Now().Unix(), id); err != nil {
				return contracts.User{}, err
			}
		}
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id=?", id); err != nil {
		return contracts.User{}, err
	}
	if err = r.cancelTokens(ctx, tx, id, ""); err != nil {
		return contracts.User{}, err
	}
	action := "users.updated"
	if r.Administrators {
		action = "administrators.updated"
	}
	if err = r.audit(audit.Target(ctx, r.roleID()+"/"+id, "status="+before.Status+"->"+input.Status+"; sessions=revoked"), tx, actor, action); err != nil {
		return contracts.User{}, err
	}
	user, err := r.user(ctx, tx, id)
	if err != nil {
		return user, err
	}
	return user, tx.Commit()
}
// ListUsers lists the identity realm's users with the shared search filter; a
// non-empty optional post id restricts the page to that post's members.
func (r *Repository) ListUsers(ctx context.Context, search string, page, size int, postID ...string) (contracts.UserList, error) {
	result := contracts.UserList{Items: []contracts.User{}, Page: page, PageSize: size}
	filter := "%" + strings.ToLower(search) + "%"
	post := ""
	if len(postID) > 0 {
		post = postID[0]
	}
	postJoin := ""
	postWhere := ""
	if post != "" {
		postJoin = " JOIN unicore_user_posts up ON up.user_id=u.id AND up.post_id=?"
		postWhere = " AND EXISTS (SELECT 1 FROM unicore_user_posts f WHERE f.user_id=u.id AND f.post_id=?)"
	}
	// Placeholder order follows the SQL text: the join parameter comes first,
	// then the search filters, then the EXISTS probe.
	countArgs := []any{filter, filter}
	if post != "" {
		countArgs = []any{post, filter, filter, post}
	}
	if err := r.row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_users u"+postJoin+" WHERE (u.username LIKE ? OR u.email LIKE ?)"+postWhere, countArgs...).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := r.rows(ctx, r.Store.DB, "SELECT u.id FROM unicore_users u"+postJoin+" WHERE (u.username LIKE ? OR u.email LIKE ?)"+postWhere+" ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?", append(countArgs, size, (page-1)*size)...)
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
		user, err := r.user(ctx, r.Store.DB, id)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, user)
	}
	return result, nil
}
func (r *Repository) CreateSession(ctx context.Context, hash, userID string, expires int, credentialHash string) error {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	var status, passwordHash string
	if err = r.row(ctx, tx, "SELECT status,password_hash FROM unicore_users WHERE id=?", userID).Scan(&status, &passwordHash); err != nil {
		return err
	}
	if status != "active" || (credentialHash != "" && credentialHash != passwordHash) {
		return platform.ErrCredentials
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE expires_at<=?", time.Now().Unix()); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "INSERT INTO unicore_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", hash, userID, expires); err != nil {
		return err
	}
	if err = r.recordDevice(ctx, tx, hash, userID, 0); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_users SET last_login_at=? WHERE id=?", time.Now().Unix(), userID); err != nil {
		return err
	}
	if err = r.audit(ctx, tx, userID, "auth.login"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) Session(ctx context.Context, hash string) (contracts.User, int, error) {
	s, err := r.PersonalSession(ctx, hash)
	if err != nil {
		return contracts.User{}, 0, err
	}
	if err = fullFactor(s); err != nil {
		return contracts.User{}, 0, err
	}
	if !platform.DeviceFrom(ctx).Passive {
		if _, err = r.exec(ctx, r.Store.DB, "UPDATE unicore_session_details SET last_seen_at=? WHERE token_hash=? AND last_seen_at<?", time.Now().Unix(), hash, time.Now().Unix()); err != nil {
			return contracts.User{}, 0, err
		}
	}
	return s.User, s.Expires, nil
}
func (r *Repository) DeleteSession(ctx context.Context, hash string) error {
	_, err := r.exec(ctx, r.Store.DB, "DELETE FROM unicore_sessions WHERE token_hash=?", hash)
	return err
}
func (r *Repository) Dashboard(ctx context.Context) (contracts.Dashboard, error) {
	result := contracts.Dashboard{Audit: []contracts.AuditEntry{}}
	for _, query := range []struct {
		sql  string
		args []any
		out  *int
	}{
		{"SELECT COUNT(*) FROM unicore_users", nil, &result.TotalUsers},
		{"SELECT COUNT(*) FROM unicore_users WHERE created_at>=?", []any{time.Now().UTC().Truncate(24 * time.Hour).Unix()}, &result.TodayNewUsers},
		{"SELECT COUNT(*) FROM unicore_users WHERE last_login_at>=?", []any{time.Now().Add(-7 * 24 * time.Hour).Unix()}, &result.ActiveUsers7d},
	} {
		if err := r.row(ctx, r.Store.DB, query.sql, query.args...).Scan(query.out); err != nil {
			return result, err
		}
	}
	rows, err := r.rows(ctx, r.Store.DB, "SELECT id,actor_id,action,created_at FROM unicore_audit_logs ORDER BY created_at DESC,id DESC LIMIT 10")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry contracts.AuditEntry
		if err := rows.Scan(&entry.ID, &entry.ActorID, &entry.Action, &entry.CreatedAt); err != nil {
			return result, err
		}
		result.Audit = append(result.Audit, entry)
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	// Seven-day audit activity for the overview chart: one bucket per UTC day.
	activityRows, err := r.rows(ctx, r.Store.DB, "SELECT created_at FROM unicore_audit_logs WHERE created_at>=? ORDER BY created_at", time.Now().UTC().Add(-7*24*time.Hour).Unix())
	if err != nil {
		return result, err
	}
	defer activityRows.Close()
	buckets := map[string]int{}
	for activityRows.Next() {
		var created int64
		if err = activityRows.Scan(&created); err != nil {
			return result, err
		}
		buckets[time.Unix(created, 0).UTC().Format("2006-01-02")]++
	}
	if err = activityRows.Err(); err != nil {
		return result, err
	}
	result.Activity7d = []contracts.ActivityDay{}
	for offset := 6; offset >= 0; offset-- {
		day := time.Now().UTC().AddDate(0, 0, -offset).Format("2006-01-02")
		result.Activity7d = append(result.Activity7d, contracts.ActivityDay{Date: day, Count: buckets[day]})
	}
	return result, nil
}
