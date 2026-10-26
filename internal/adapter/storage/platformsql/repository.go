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
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

type Repository struct{ Store *sqlstore.Store }

func accountError(err error) error {
	if err != nil && (strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(strings.ToLower(err.Error()), "duplicate")) {
		return platform.ErrConflict
	}
	return err
}

func (r *Repository) user(ctx context.Context, q sqlstore.Runner, id string) (contracts.User, error) {
	user := contracts.User{Roles: []string{}, Permissions: []string{}}
	if err := r.Store.Row(ctx, q, "SELECT id,username,email,status,created_at,last_login_at FROM users WHERE id=?", id).Scan(&user.ID, &user.Username, &user.Email, &user.Status, &user.CreatedAt, &user.LastLoginAt); err != nil {
		return user, err
	}
	rows, err := r.Store.Rows(ctx, q, "SELECT role_id FROM user_roles WHERE user_id=? ORDER BY role_id", id)
	if err != nil {
		return user, err
	}
	for rows.Next() {
		var role string
		if err = rows.Scan(&role); err != nil {
			break
		}
		user.Roles = append(user.Roles, role)
	}
	rowsErr := rows.Err()
	_ = rows.Close()
	if err != nil {
		return user, err
	}
	if rowsErr != nil {
		return user, rowsErr
	}
	rows, err = r.Store.Rows(ctx, q, "SELECT DISTINCT rp.permission_id FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=? ORDER BY rp.permission_id", id)
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
	return user, rows.Err()
}
func (r *Repository) FindAccount(ctx context.Context, login string) (platform.Account, error) {
	var id, hash string
	err := r.Store.Row(ctx, r.Store.DB, "SELECT id,password_hash FROM users WHERE username=? OR email=?", login, login).Scan(&id, &hash)
	if err != nil {
		return platform.Account{}, err
	}
	user, err := r.user(ctx, r.Store.DB, id)
	return platform.Account{User: user, PasswordHash: hash}, err
}

// Seed only runs inside the install transaction, before the unique installation marker is committed.
func (r *Repository) Seed(ctx context.Context, tx *sql.Tx, input contracts.UserCreate, hash string) (contracts.User, error) {
	for _, role := range []string{"super_admin", "user"} {
		if _, err := r.Store.Exec(ctx, tx, "INSERT INTO roles(id,name) VALUES(?,?)", role, role); err != nil {
			return contracts.User{}, err
		}
	}
	for _, permission := range platform.Permissions {
		if _, err := r.Store.Exec(ctx, tx, "INSERT INTO permissions(id) VALUES(?)", permission); err != nil {
			return contracts.User{}, err
		}
		if _, err := r.Store.Exec(ctx, tx, "INSERT INTO role_permissions(role_id,permission_id) VALUES(?,?)", "super_admin", permission); err != nil {
			return contracts.User{}, err
		}
	}
	return r.insert(ctx, tx, input, hash, "bootstrap")
}
func (r *Repository) insert(ctx context.Context, tx *sql.Tx, input contracts.UserCreate, hash, actor string) (contracts.User, error) {
	id := sqlstore.ID()
	now := time.Now().Unix()
	if _, err := r.Store.Exec(ctx, tx, "INSERT INTO users(id,username,email,password_hash,status,created_at,updated_at,last_login_at) VALUES(?,?,?,?,?,?,?,?)", id, input.Username, input.Email, hash, "active", now, now, 0); err != nil {
		return contracts.User{}, accountError(err)
	}
	if _, err := r.Store.Exec(ctx, tx, "INSERT INTO user_roles(user_id,role_id) VALUES(?,?)", id, input.Role); err != nil {
		return contracts.User{}, err
	}
	if err := r.Store.Audit(ctx, tx, actor, "users.created"); err != nil {
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
	user, err := r.insert(ctx, tx, input, hash, actor)
	if err != nil {
		return user, err
	}
	return user, tx.Commit()
}
func (r *Repository) UpdateUser(ctx context.Context, id string, input contracts.UserUpdate, actor string) (contracts.User, error) {
	if (input.Status != "active" && input.Status != "disabled") || (input.Role != "user" && input.Role != "super_admin") {
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
	before, err := r.user(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return contracts.User{}, platform.ErrInput
	}
	if err != nil {
		return contracts.User{}, err
	}
	isAdmin := false
	for _, role := range before.Roles {
		if role == "super_admin" {
			isAdmin = true
		}
	}
	if isAdmin && before.Status == "active" && (input.Role != "super_admin" || input.Status != "active") {
		var count int
		if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE ur.role_id='super_admin' AND u.status='active'").Scan(&count); err != nil {
			return contracts.User{}, err
		}
		if count <= 1 {
			return contracts.User{}, platform.ErrLastAdmin
		}
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE users SET status=?,updated_at=? WHERE id=?", input.Status, time.Now().Unix(), id); err != nil {
		return contracts.User{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM user_roles WHERE user_id=?", id); err != nil {
		return contracts.User{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO user_roles(user_id,role_id) VALUES(?,?)", id, input.Role); err != nil {
		return contracts.User{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM sessions WHERE user_id=?", id); err != nil {
		return contracts.User{}, err
	}
	if err = r.cancelTokens(ctx, tx, id, ""); err != nil {
		return contracts.User{}, err
	}
	if err = r.Store.Audit(ctx, tx, actor, "users.updated"); err != nil {
		return contracts.User{}, err
	}
	user, err := r.user(ctx, tx, id)
	if err != nil {
		return user, err
	}
	return user, tx.Commit()
}
func (r *Repository) ListUsers(ctx context.Context, search string, page, size int) (contracts.UserList, error) {
	result := contracts.UserList{Items: []contracts.User{}, Page: page, PageSize: size}
	filter := "%" + strings.ToLower(search) + "%"
	if err := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM users WHERE username LIKE ? OR email LIKE ?", filter, filter).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT id FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC,id LIMIT ? OFFSET ?", filter, filter, size, (page-1)*size)
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
	if err = r.Store.Row(ctx, tx, "SELECT status,password_hash FROM users WHERE id=?", userID).Scan(&status, &passwordHash); err != nil {
		return err
	}
	if status != "active" || (credentialHash != "" && credentialHash != passwordHash) {
		return platform.ErrCredentials
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM sessions WHERE expires_at<=?", time.Now().Unix()); err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", hash, userID, expires); err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE users SET last_login_at=? WHERE id=?", time.Now().Unix(), userID); err != nil {
		return err
	}
	if err = r.Store.Audit(ctx, tx, userID, "auth.login"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) Session(ctx context.Context, hash string) (contracts.User, int, error) {
	var id string
	var expires int
	if err := r.Store.Row(ctx, r.Store.DB, "SELECT user_id,expires_at FROM sessions WHERE token_hash=?", hash).Scan(&id, &expires); err != nil {
		return contracts.User{}, 0, err
	}
	user, err := r.user(ctx, r.Store.DB, id)
	return user, expires, err
}
func (r *Repository) DeleteSession(ctx context.Context, hash string) error {
	_, err := r.Store.Exec(ctx, r.Store.DB, "DELETE FROM sessions WHERE token_hash=?", hash)
	return err
}
func (r *Repository) Dashboard(ctx context.Context) (contracts.Dashboard, error) {
	result := contracts.Dashboard{Audit: []contracts.AuditEntry{}}
	for _, query := range []struct {
		sql  string
		args []any
		out  *int
	}{
		{"SELECT COUNT(*) FROM users", nil, &result.TotalUsers},
		{"SELECT COUNT(*) FROM users WHERE created_at>=?", []any{time.Now().UTC().Truncate(24 * time.Hour).Unix()}, &result.TodayNewUsers},
		{"SELECT COUNT(*) FROM users WHERE last_login_at>=?", []any{time.Now().Add(-7 * 24 * time.Hour).Unix()}, &result.ActiveUsers7d},
	} {
		if err := r.Store.Row(ctx, r.Store.DB, query.sql, query.args...).Scan(query.out); err != nil {
			return result, err
		}
	}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT id,actor_id,action,created_at FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT 10")
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
	return result, rows.Err()
}
