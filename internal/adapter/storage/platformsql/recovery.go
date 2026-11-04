// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit OS-owner recovery used only while the Web instance lock is held offline.
package platformsql

import (
	"context"
	"errors"
	"time"

	"github.com/yunnuo/unicore/internal/audit"
)

// RecoverPassword never enables an account, changes roles, or clears an enrolled factor.
func (r *Repository) RecoverPassword(ctx context.Context, username, next string) error {
	if !r.Administrators || username == "" || next == "" {
		return errors.New("administrator username and password hash are required")
	}
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id string
	if err = r.row(ctx, tx, "SELECT id FROM unicore_users WHERE username=?", username).Scan(&id); err != nil {
		return errors.New("administrator not found")
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_users SET password_hash=?,updated_at=? WHERE id=?", next, time.Now().Unix(), id); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_session_details WHERE user_id=?", id); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id=?", id); err != nil {
		return err
	}
	if err = r.cancelTokens(ctx, tx, id, ""); err != nil {
		return err
	}
	if err = r.audit(audit.Target(ctx, "administrator/"+id, "password recovered offline; sessions revoked; factors retained"), tx, "offline-owner", "administrator.password.recovered"); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) RecoverSessions(ctx context.Context, username string, all bool) error {
	if username == "" && !all {
		return errors.New("select --username or --all")
	}
	if username != "" && all {
		return errors.New("--username and --all are mutually exclusive")
	}
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	predicate := ""
	args := []any{}
	if !all {
		var id string
		if err = r.row(ctx, tx, "SELECT id FROM unicore_users WHERE username=?", username).Scan(&id); err != nil {
			return errors.New("account not found")
		}
		predicate = " WHERE user_id=?"
		args = append(args, id)
	}
	for _, table := range []string{"unicore_session_details", "unicore_sessions"} {
		if _, err = r.exec(ctx, tx, "DELETE FROM "+table+predicate, args...); err != nil {
			return err
		}
	}
	if err = r.audit(audit.Target(ctx, r.roleID(), "sessions revoked offline"), tx, "offline-owner", "account.sessions.recovered"); err != nil {
		return err
	}
	return tx.Commit()
}
