// Author: yunnuo <ymz@ebox.vip>
// Description: Verify the current credential again under lock and revoke realm-specific proofs atomically.
package platformsql

import (
	"context"
	"github.com/yunnuo/unicore/internal/platform"
	"time"
)

func (r *Repository) ChangePassword(ctx context.Context, id, expected, next string) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var hash, status string
	if err = r.row(ctx, tx, "SELECT password_hash,status FROM users WHERE id=?", id).Scan(&hash, &status); err != nil {
		return err
	}
	if status != "active" || !platform.Equal(hash, expected) {
		return platform.ErrCredentials
	}
	if _, err = r.exec(ctx, tx, "UPDATE users SET password_hash=?,updated_at=? WHERE id=?", next, time.Now().Unix(), id); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM sessions WHERE user_id=?", id); err != nil {
		return err
	}
	if err = r.cancelTokens(ctx, tx, id, ""); err != nil {
		return err
	}
	// Link callbacks recheck their credential snapshot under this lock; stale flows
	// for this account fail without cancelling unrelated users' in-flight sign-ins.
	if err = r.audit(ctx, tx, id, "account.password.changed"); err != nil {
		return err
	}
	return tx.Commit()
}
