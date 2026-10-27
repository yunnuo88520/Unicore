// Author: yunnuo <ymz@ebox.vip>
// Description: Reuse mail_jobs for encrypted system events, with transactional metadata-only audit.
package platformsql

import (
	"context"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
)

func (r *Repository) EnqueueNotification(ctx context.Context, encrypted, actor string, now, expires int) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Empty token_hash is not an account token and is excluded from account challenge cancellation.
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')", sqlstore.ID(), "", encrypted, now, now, expires); err != nil {
		return err
	}
	if err = r.Store.Audit(ctx, tx, actor, "mail.notification.queued"); err != nil {
		return err
	}
	return tx.Commit()
}
