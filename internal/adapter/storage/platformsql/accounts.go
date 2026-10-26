// Author: yunnuo <ymz@ebox.vip>
// Description: Atomic account tokens, session revocation and durable mail leases.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
)

func (r *Repository) accountTransaction(ctx context.Context) (*sql.Tx, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	return tx, nil
}
func (r *Repository) cancelTokens(ctx context.Context, tx *sql.Tx, user, purpose string) error {
	query := "SELECT token_hash FROM account_tokens WHERE user_id=?"
	args := []any{user}
	if purpose != "" {
		query += " AND purpose=?"
		args = append(args, purpose)
	}
	if _, err := r.Store.Exec(ctx, tx, "UPDATE mail_jobs SET payload='',state='cancelled' WHERE state IN ('pending','sending') AND token_hash IN ("+query+")", args...); err != nil {
		return err
	}
	predicate := "user_id=?"
	if purpose != "" {
		predicate += " AND purpose=?"
	}
	codeQuery := "SELECT id FROM email_challenges WHERE " + predicate
	if _, err := r.Store.Exec(ctx, tx, "UPDATE mail_jobs SET payload='',state='cancelled' WHERE state IN ('pending','sending') AND token_hash IN ("+codeQuery+")", args...); err != nil {
		return err
	}
	if _, err := r.Store.Exec(ctx, tx, "UPDATE email_challenges SET code_digest='',attempts=5 WHERE "+predicate, args...); err != nil {
		return err
	}
	_, err := r.Store.Exec(ctx, tx, "DELETE FROM account_tokens WHERE "+predicate, args...)
	return err
}
func (r *Repository) tokenAndMail(ctx context.Context, tx *sql.Tx, user, purpose, hash string, expires int, payload string) error {
	if err := r.cancelTokens(ctx, tx, user, purpose); err != nil {
		return err
	}
	if _, err := r.Store.Exec(ctx, tx, "INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,?,?)", hash, user, purpose, expires); err != nil {
		return err
	}
	now := time.Now().Unix()
	_, err := r.Store.Exec(ctx, tx, "INSERT INTO mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')", sqlstore.ID(), hash, payload, now, now, expires)
	return err
}
func (r *Repository) RegisterAccount(ctx context.Context, input contracts.RegisterInput, passwordHash, tokenHash string, expires int, payload string) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	user, err := r.insert(ctx, tx, contracts.UserCreate{Username: input.Username, Email: input.Email, Role: "user"}, passwordHash, "registration")
	if err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE users SET status='pending' WHERE id=?", user.ID); err != nil {
		return err
	}
	if err = r.tokenAndMail(ctx, tx, user.ID, "verify", tokenHash, expires, payload); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) QueueAccountToken(ctx context.Context, email, purpose, hash string, expires int, payload string) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var user, status string
	err = r.Store.Row(ctx, tx, "SELECT id,status FROM users WHERE email=?", email).Scan(&user, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if (purpose == "reset" && status != "active") || (purpose == "verify" && status != "pending") {
		return nil
	}
	if err = r.tokenAndMail(ctx, tx, user, purpose, hash, expires, payload); err != nil {
		return err
	}
	if err = r.Store.Audit(ctx, tx, user, "auth."+purpose+".requested"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) ConsumeAccountToken(ctx context.Context, hash, purpose, passwordHash string, now int) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var user, status string
	var expires int
	err = r.Store.Row(ctx, tx, "SELECT t.user_id,t.expires_at,u.status FROM account_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.purpose=?", hash, purpose).Scan(&user, &expires, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return platform.ErrAccountToken
	}
	if err != nil {
		return err
	}
	if expires <= now || (purpose == "reset" && status != "active") || (purpose == "verify" && status != "pending") {
		return platform.ErrAccountToken
	}
	if purpose == "verify" {
		_, err = r.Store.Exec(ctx, tx, "UPDATE users SET status='active',updated_at=? WHERE id=?", now, user)
	} else {
		_, err = r.Store.Exec(ctx, tx, "UPDATE users SET password_hash=?,updated_at=? WHERE id=?", passwordHash, now, user)
		if err == nil {
			_, err = r.Store.Exec(ctx, tx, "DELETE FROM sessions WHERE user_id=?", user)
		}
	}
	if err != nil {
		return err
	}
	if err = r.cancelTokens(ctx, tx, user, ""); err != nil {
		return err
	}
	if err = r.Store.Audit(ctx, tx, user, "auth."+purpose+".completed"); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) ClaimMail(ctx context.Context, now int) (mailer.Job, error) {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return mailer.Job{}, err
	}
	defer tx.Rollback()
	// Remove expired secrets and bound retained metadata to seven days.
	if _, err = r.Store.Exec(ctx, tx, "UPDATE email_challenges SET code_digest='' WHERE expires_at<=?", now); err != nil {
		return mailer.Job{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM email_challenges WHERE created_at<?", now-7*24*60*60); err != nil {
		return mailer.Job{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE mail_jobs SET state='dead',payload='',last_error='EXPIRED' WHERE state IN ('pending','sending') AND expires_at<=?", now); err != nil {
		return mailer.Job{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM mail_jobs WHERE created_at<? AND state IN ('sent','dead','cancelled')", now-7*86400); err != nil {
		return mailer.Job{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM account_tokens WHERE expires_at<=?", now); err != nil {
		return mailer.Job{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE mail_jobs SET state='dead',payload='',last_error='DELIVERY_FAILED' WHERE state='sending' AND lease_until<=? AND attempts>=5", now); err != nil {
		return mailer.Job{}, err
	}
	var job mailer.Job
	err = r.Store.Row(ctx, tx, "SELECT id,payload,attempts,expires_at FROM mail_jobs WHERE (state='pending' AND available_at<=?) OR (state='sending' AND lease_until<=? AND attempts<5) ORDER BY created_at,id LIMIT 1", now, now).Scan(&job.ID, &job.Payload, &job.Attempts, &job.Expires)
	if errors.Is(err, sql.ErrNoRows) {
		return job, tx.Commit()
	}
	if err != nil {
		return job, err
	}
	job.Lease = sqlstore.ID()
	job.Attempts++
	if _, err = r.Store.Exec(ctx, tx, "UPDATE mail_jobs SET state='sending',attempts=?,lease_id=?,lease_until=? WHERE id=?", job.Attempts, job.Lease, now+60, job.ID); err != nil {
		return job, err
	}
	return job, tx.Commit()
}
func (r *Repository) FinishMail(ctx context.Context, job mailer.Job, delivered bool, now int) error {
	state, lastError, payload, next := "pending", "DELIVERY_FAILED", job.Payload, now+(1<<min(job.Attempts, 5))*5
	if delivered {
		state, lastError, payload = "sent", "", ""
	} else if job.Attempts >= 5 || next >= job.Expires {
		state, payload = "dead", ""
	}
	_, err := r.Store.Exec(ctx, r.Store.DB, "UPDATE mail_jobs SET state=?,last_error=?,payload=?,available_at=?,lease_id='',lease_until=0 WHERE id=? AND state='sending' AND lease_id=?", state, lastError, payload, next, job.ID, job.Lease)
	return err
}
func (r *Repository) MailJobs(ctx context.Context) (contracts.MailJobList, error) {
	result := contracts.MailJobList{Items: []contracts.MailJob{}}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT id,state,attempts,created_at,available_at,last_error FROM mail_jobs ORDER BY created_at DESC,id DESC LIMIT 30")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item contracts.MailJob
		if err = rows.Scan(&item.ID, &item.State, &item.Attempts, &item.CreatedAt, &item.AvailableAt, &item.LastError); err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}
