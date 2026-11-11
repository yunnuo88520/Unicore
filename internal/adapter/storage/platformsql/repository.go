// Author: yunnuo <ymz@ebox.vip>
// Description: SQL identity adapter; isolated from local/Desktop storage composition.
package platformsql

import (
	"sync"

	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
)

type Repository struct {
	Store *sqlstore.Store
	// Administrators selects the legacy management API alias, never a different account store.
	Administrators      bool
	NotificationSecrets mailer.Secrets
	// navCache memoizes the persisted navigation tree between the session
	// resolutions that re-read it on every authenticated request; the version
	// row stays the single invalidation source (every write bumps it).
	navMu      sync.Mutex
	navVersion int
	navHas     bool
	navCache   contracts.Navigation
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
	var department *string
	if err := r.row(ctx, q, query, id).Scan(&user.ID, &user.Username, &user.Email, &user.Phone, &user.Status, &user.CreatedAt, &user.LastLoginAt, &department); err != nil {
		return user, err
	}
	user.DepartmentID = department
	// The account nickname lives on the personal profile row (the same field
	// the account settings page edits); accounts without a profile row fall
	// back to the username at every display point.
	var displayName string
	if err := r.row(ctx, q, "SELECT display_name FROM unicore_personal_accounts WHERE user_id=?", id).Scan(&displayName); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return user, err
	}
	user.DisplayName = &displayName
	state, err := r.personalState(ctx, q, id)
	if err != nil {
		return user, err
	}
	user.TotpEnabled = state.Secret != ""
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
	// Display names ride parallel to the role ids so listings and the account
	// menu render catalogue names without a roles:read grant; a missing row
	// falls back to the raw id instead of hiding the assignment.
	if len(user.Roles) > 0 {
		placeholders := strings.Repeat(",?", len(user.Roles)-1)
		args := make([]any, len(user.Roles))
		for index, role := range user.Roles {
			args[index] = role
		}
		names, err := r.rows(ctx, q, "SELECT id,name FROM unicore_roles WHERE id IN (?"+placeholders+")", args...)
		if err != nil {
			return user, err
		}
		catalogue := map[string]string{}
		err = func() error {
			defer names.Close()
			for names.Next() {
				var id, name string
				if err := names.Scan(&id, &name); err != nil {
					return err
				}
				catalogue[id] = name
			}
			return names.Err()
		}()
		if err != nil {
			return user, err
		}
		roleNames := make([]string, len(user.Roles))
		for index, role := range user.Roles {
			roleNames[index] = catalogue[role]
			if roleNames[index] == "" {
				roleNames[index] = role
			}
		}
		user.RoleNames = &roleNames
	}
	rows, err := r.rows(ctx, q, "SELECT DISTINCT rp.permission_id FROM unicore_user_roles ur JOIN unicore_role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=? ORDER BY rp.permission_id", id)
	if err != nil {
		return user, err
	}
	defer rows.Close()
	for rows.Next() {
		var permission string
		if err = rows.Scan(&permission); err != nil {
			return user, err
		}
		if platform.CatalogPermission(permission) {
			user.Permissions = append(user.Permissions, permission)
		}
	}
	if err = rows.Err(); err != nil {
		return user, err
	}
	if err = r.loadAuthorizations(ctx, q, &user); err != nil {
		return user, err
	}
	if err = r.deriveGrantedPermissions(ctx, q, &user); err != nil {
		return user, err
	}
	if platform.IsSuper(user) {
		user.Permissions = append([]string{}, platform.Permissions()...)
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

// deriveGrantedPermissions repairs legacy permission-point upper bounds from
// explicit operation/action grants. It never derives action or menu IDs: an
// initialized empty grant set is an intentional revocation (ADR-0040).
func (r *Repository) deriveGrantedPermissions(ctx context.Context, q sqlstore.Runner, user *contracts.User) error {
	held := map[string]bool{}
	for _, permission := range user.Permissions {
		held[permission] = true
	}
	add := func(permission string) {
		if permission != "" && !held[permission] && platform.CatalogPermission(permission) {
			held[permission] = true
			user.Permissions = append(user.Permissions, permission)
		}
	}
	n, err := r.readNavigation(ctx, q)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil {
		nodes := map[string]contracts.NavigationNode{}
		for _, node := range n.Nodes {
			nodes[node.ID] = node
		}
		for _, id := range deref(user.ActionIds) {
			node, ok := nodes[id]
			if !ok || node.Type != "action" {
				continue
			}
			if node.Permission != nil {
				add(*node.Permission)
			}
			for _, operationID := range node.OperationIds {
				if op, ok := platform.Operation(operationID); ok && op.Grantable && op.PermissionMode != "any" {
					for _, permission := range op.Permissions {
						add(permission)
					}
				}
			}
		}
	}
	// Granted operations speak for themselves: their policy permissions are
	// exactly the points the role demonstrably needs. Mode any is the
	// exception — the grant is satisfied by any one held point, so it implies
	// none of its sibling points and derives nothing.
	for _, id := range deref(user.OperationIds) {
		if op, ok := platform.Operation(id); ok && op.Grantable && op.PermissionMode != "any" {
			for _, permission := range op.Permissions {
				add(permission)
			}
		}
	}
	sort.Strings(user.Permissions)
	return nil
}

func deref(ids *[]string) []string {
	if ids == nil {
		return nil
	}
	return *ids
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
	for _, permission := range platform.Permissions() {
		if _, err := r.exec(ctx, tx, "INSERT INTO unicore_permissions(id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM unicore_permissions WHERE id=?)", permission, permission); err != nil {
			return contracts.User{}, err
		}
		if _, err := r.exec(ctx, tx, "INSERT INTO unicore_role_permissions(role_id,permission_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM unicore_role_permissions WHERE role_id=? AND permission_id=?)", "super_admin", permission, "super_admin", permission); err != nil {
			return contracts.User{}, err
		}
	}
	// The builtin user role starts with every assignable permission point, so
	// existing deployments keep their behaviour after the switch to grants.
	for _, permission := range platform.PermissionCatalog() {
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
	// Every account can belong to a department, regardless of its roles.
	values := []any{id, input.Username, input.Email, input.Phone, hash, "active", now, now, 0}
	columns := "id,username,email,phone,password_hash,status,created_at,updated_at,last_login_at"
	holders := "?,?,?,?,?,?,?,?,?"
	if input.DepartmentID != nil && *input.DepartmentID != "" {
		columns += ",department_id"
		holders += ",?"
		values = append(values, *input.DepartmentID)
	}
	if _, err := r.exec(ctx, tx, "INSERT INTO unicore_users("+columns+") VALUES("+holders+")", values...); err != nil {
		return contracts.User{}, accountError(err)
	}
	roles := []string{input.Role}
	if input.RoleIds != nil {
		roles = *input.RoleIds
	}
	for _, role := range roles {
		if _, err := r.exec(ctx, tx, "INSERT INTO unicore_user_roles(user_id,role_id) VALUES(?,?)", id, role); err != nil {
			return contracts.User{}, err
		}
	}
	// Post membership is validated and written in the account transaction.
	if input.PostIds != nil && len(*input.PostIds) > 0 {
		ids, err := r.validateUserPosts(ctx, tx, "", *input.PostIds)
		if err != nil {
			return contracts.User{}, err
		}
		if err = r.writeUserPosts(ctx, tx, id, ids); err != nil {
			return contracts.User{}, err
		}
	}
	// An initial nickname seeds the same personal profile row the account
	// settings page edits later; the row otherwise appears on first profile save.
	if input.DisplayName != nil && strings.TrimSpace(*input.DisplayName) != "" {
		if _, err := r.exec(ctx, tx, "INSERT INTO unicore_personal_accounts(user_id,display_name,totp_secret,recovery_digests,last_step,setup_secret,setup_session,setup_expires,setup_attempts) SELECT ?,?,'','',-1,'','',0,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_personal_accounts WHERE user_id=?)", id, strings.TrimSpace(*input.DisplayName), id); err != nil {
			return contracts.User{}, err
		}
	}
	action := "users.created"
	if r.Administrators {
		action = "administrators.created"
	}
	if err := r.audit(audit.Target(ctx, r.roleID()+"/"+id, "roles="+strings.Join(roles, ",")+"; status=active"), tx, actor, action); err != nil {
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
	roles, err := r.assignment(ctx, tx, input.Role, input.RoleIds, nil, current)
	if err != nil {
		return contracts.User{}, err
	}
	input.Role = ""
	input.RoleIds = &roles
	// Departments exist only for user accounts; a bad id is rejected here.
	if input.DepartmentID != nil && *input.DepartmentID != "" {
		if _, err = r.department(ctx, tx, *input.DepartmentID); err != nil {
			return contracts.User{}, err
		}
	}
	if err = r.checkDestination(ctx, tx, current, permission, input.DepartmentID); err != nil {
		return contracts.User{}, err
	}
	user, err := r.insert(ctx, tx, input, hash, actor)
	if err != nil {
		return user, err
	}
	return user, tx.Commit()
}
func (r *Repository) UpdateUser(ctx context.Context, id string, input contracts.UserUpdate, actor string) (contracts.User, error) {
	// Omitted assignments preserve roles; role_ids replaces the entire set.
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
	current, err := r.user(ctx, tx, actor)
	if err != nil {
		return contracts.User{}, err
	}
	if platform.IsSuper(before) && !platform.IsSuper(current) {
		return contracts.User{}, platform.ErrForbidden
	}
	scope, err := r.dataScope(ctx, tx, current, permission)
	if err != nil {
		return contracts.User{}, err
	}
	if !scope.Contains(id) {
		return contracts.User{}, platform.ErrForbidden
	}
	if input.DepartmentID != nil && *input.DepartmentID != text(before.DepartmentID) {
		if actor == id && !platform.IsSuper(current) {
			return contracts.User{}, platform.ErrForbidden
		}
		if err = r.checkDestination(ctx, tx, current, permission, input.DepartmentID); err != nil {
			return contracts.User{}, err
		}
	}
	roles, err := r.assignment(ctx, tx, role, input.RoleIds, before.Roles, current)
	if err != nil {
		return contracts.User{}, err
	}
	effectiveSuper := false
	for _, assigned := range roles {
		if assigned == "super_admin" {
			effectiveSuper = true
		}
	}
	if isAdmin && before.Status == "active" && (!effectiveSuper || input.Status != "active") {
		// Only active super_admin members satisfy the recovery guard.
		identityTable := "unicore_users"
		membership := "unicore_user_roles ur ON ur.user_id=u.id"
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
	// The email is a login credential: omitted keeps the address, a
	// replacement must parse and stay unique across every account.
	email := before.Email
	emailChanged := false
	if input.Email != nil {
		candidate := strings.ToLower(strings.TrimSpace(*input.Email))
		if candidate == "" || !platform.ValidEmail(candidate) {
			return contracts.User{}, platform.ErrInput
		}
		if candidate != before.Email {
			var count int
			if err = r.row(ctx, tx, "SELECT COUNT(*) FROM unicore_users WHERE email=? AND id<>?", candidate, id).Scan(&count); err != nil {
				return contracts.User{}, err
			}
			if count != 0 {
				return contracts.User{}, &platform.AccountConflict{Field: "email"}
			}
			email = candidate
			emailChanged = true
		}
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_users SET status=?,email=?,updated_at=? WHERE id=?", input.Status, email, time.Now().Unix(), id); err != nil {
		return contracts.User{}, accountError(err)
	}
	// The nickname rides the personal profile row: omitted retains it, an
	// empty string clears it back to the username fallback.
	if input.DisplayName != nil {
		name := strings.TrimSpace(*input.DisplayName)
		updated, err := r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET display_name=? WHERE user_id=?", name, id)
		if err != nil {
			return contracts.User{}, err
		}
		if affected, err := updated.RowsAffected(); err == nil && affected == 0 && name != "" {
			if _, err = r.exec(ctx, tx, "INSERT INTO unicore_personal_accounts(user_id,display_name,totp_secret,recovery_digests,last_step,setup_secret,setup_session,setup_expires,setup_attempts) SELECT ?,?,'','',-1,'','',0,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_personal_accounts WHERE user_id=?)", id, name, id); err != nil {
				return contracts.User{}, err
			}
		}
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_user_roles WHERE user_id=?", id); err != nil {
		return contracts.User{}, err
	}
	for _, assigned := range roles {
		if _, err = r.exec(ctx, tx, "INSERT INTO unicore_user_roles(user_id,role_id) VALUES(?,?)", id, assigned); err != nil {
			return contracts.User{}, err
		}
	}
	// Omitted posts preserve membership; explicit posts replace the set.
	if input.PostIds != nil {
		if _, err = r.validateUserPosts(ctx, tx, id, *input.PostIds); err != nil {
			return contracts.User{}, err
		}
		if err = r.writeUserPosts(ctx, tx, id, *input.PostIds); err != nil {
			return contracts.User{}, err
		}
	}
	// Omitted departments are retained; empty clears; a non-empty id must exist.
	if input.DepartmentID != nil {
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
	detail := "status=" + before.Status + "->" + input.Status + "; roles=" + strings.Join(before.Roles, ",") + "->" + strings.Join(roles, ",") + "; sessions=revoked"
	if emailChanged {
		detail += "; email=updated"
	}
	if input.DisplayName != nil {
		detail += "; display_name=updated"
	}
	if err = r.audit(audit.Target(ctx, r.roleID()+"/"+id, detail), tx, actor, action); err != nil {
		return contracts.User{}, err
	}
	user, err := r.user(ctx, tx, id)
	if err != nil {
		return user, err
	}
	return user, tx.Commit()
}

// ResetUserPassword replaces one member's password hash from the management
// surface: the caller hashes the replacement (administrator-set or generated),
// the store verifies the actor still holds users:update, refuses to let a
// restricted administrator touch a super administrator, revokes every live
// session and token with the old credential and writes the dedicated audit
// action, all in one transaction.
func (r *Repository) ResetUserPassword(ctx context.Context, id, hash, actor string) (contracts.User, error) {
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
	before, err := r.user(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return contracts.User{}, platform.ErrInput
	}
	if err != nil {
		return contracts.User{}, err
	}
	current, err := r.user(ctx, tx, actor)
	if err != nil {
		return contracts.User{}, err
	}
	if platform.IsSuper(before) && !platform.IsSuper(current) {
		return contracts.User{}, platform.ErrForbidden
	}
	// The management data scope bounds which members a restricted operator
	// may touch, exactly like every other users:update path.
	scope, err := r.dataScope(ctx, tx, current, permission)
	if err != nil {
		return contracts.User{}, err
	}
	if !scope.Contains(id) {
		return contracts.User{}, platform.ErrForbidden
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_users SET password_hash=?,updated_at=? WHERE id=?", hash, time.Now().Unix(), id); err != nil {
		return contracts.User{}, err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id=?", id); err != nil {
		return contracts.User{}, err
	}
	if err = r.cancelTokens(ctx, tx, id, ""); err != nil {
		return contracts.User{}, err
	}
	action := "users.password.reset"
	if r.Administrators {
		action = "administrators.password.reset"
	}
	if err = r.audit(audit.Target(ctx, r.roleID()+"/"+id, "sessions=revoked"), tx, actor, action); err != nil {
		return contracts.User{}, err
	}
	user, err := r.user(ctx, tx, id)
	if err != nil {
		return contracts.User{}, err
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
		// Throttle the sliding-expiry touch to one write per minute: an exact
		// last_seen costs a committed write (fsync) on every authenticated
		// request, while idle timeouts count in minutes.
		if _, err = r.exec(ctx, r.Store.DB, "UPDATE unicore_session_details SET last_seen_at=? WHERE token_hash=? AND last_seen_at<?", time.Now().Unix(), hash, time.Now().Add(-time.Minute).Unix()); err != nil {
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

// assignment validates the entire set before any writes. Account editors cannot grant roles.
func (r *Repository) assignment(ctx context.Context, tx *sql.Tx, single string, ids *[]string, previous []string, actor contracts.User) ([]string, error) {
	if ids != nil && single != "" {
		return nil, platform.ErrInput
	}
	if ids == nil && single == "" {
		if previous != nil {
			return previous, nil
		}
		return []string{"user"}, nil
	}
	roles := []string{single}
	if ids != nil {
		roles = *ids
	}
	if len(roles) == 0 || len(roles) > 64 {
		return nil, platform.ErrInput
	}
	same := len(roles) == len(previous)
	old := map[string]bool{}
	for _, id := range previous {
		old[id] = true
	}
	for _, id := range roles {
		if !old[id] {
			same = false
		}
	}
	if !same && !(previous == nil && len(roles) == 1 && roles[0] == "user") && !platform.IsSuper(actor) {
		return nil, platform.ErrForbidden
	}
	seen := map[string]bool{}
	for _, id := range roles {
		if seen[id] {
			return nil, platform.ErrInput
		}
		seen[id] = true
		if _, err := r.role(ctx, tx, id); err != nil {
			return nil, err
		}
	}
	return roles, nil
}

// ListUsersScoped applies the actor's users:read scope before pagination/export.
func (r *Repository) ListUsersScoped(ctx context.Context, actor contracts.User, search string, page, size int, postID ...string) (contracts.UserList, error) {
	scope, err := r.DataScope(ctx, actor, "users:read")
	if err != nil {
		return contracts.UserList{}, err
	}
	if scope.All {
		return r.ListUsers(ctx, search, page, size, postID...)
	}
	result := contracts.UserList{Items: []contracts.User{}, Page: page, PageSize: size}
	if page < 1 || size < 1 || size > 50 {
		return result, platform.ErrInput
	}
	type entry struct {
		id      string
		created int
	}
	entries := []entry{}
	filter := "%" + strings.ToLower(search) + "%"
	for start := 0; start < len(scope.UserIDs); start += platform.MaxScopeUserIDs {
		end := start + platform.MaxScopeUserIDs
		if end > len(scope.UserIDs) {
			end = len(scope.UserIDs)
		}
		batch := scope.UserIDs[start:end]
		args := []any{filter, filter}
		for _, id := range batch {
			args = append(args, id)
		}
		query := "SELECT id,created_at FROM unicore_users WHERE (username LIKE ? OR email LIKE ?) AND id IN (?" + strings.Repeat(",?", len(batch)-1) + ")"
		if len(postID) > 0 && postID[0] != "" {
			query += " AND EXISTS (SELECT 1 FROM unicore_user_posts p WHERE p.user_id=unicore_users.id AND p.post_id=?)"
			args = append(args, postID[0])
		}
		rows, e := r.rows(ctx, r.Store.DB, query, args...)
		if e != nil {
			return result, e
		}
		for rows.Next() {
			var item entry
			if e = rows.Scan(&item.id, &item.created); e != nil {
				rows.Close()
				return result, e
			}
			entries = append(entries, item)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return result, e
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].created != entries[j].created {
			return entries[i].created > entries[j].created
		}
		return entries[i].id < entries[j].id
	})
	result.Total = len(entries)
	start := (page - 1) * size
	end := start + size
	if end > len(entries) {
		end = len(entries)
	}
	for i := start; i < end; i++ {
		user, e := r.user(ctx, r.Store.DB, entries[i].id)
		if e != nil {
			return result, e
		}
		result.Items = append(result.Items, user)
	}
	return result, nil
}
