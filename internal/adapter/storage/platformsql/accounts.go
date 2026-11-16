// Author: yunnuo <ymz@ebox.vip>
// Description: Atomic account tokens, session revocation and durable mail leases.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"strings"
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
	query := "SELECT token_hash FROM unicore_account_tokens WHERE user_id=?"
	args := []any{user}
	if purpose != "" {
		query += " AND purpose=?"
		args = append(args, purpose)
	}
	if _, err := r.exec(ctx, tx, "UPDATE unicore_mail_jobs SET payload='',state='cancelled' WHERE state IN ('pending','sending') AND token_hash IN ("+query+")", args...); err != nil {
		return err
	}
	predicate := "user_id=?"
	if purpose != "" {
		predicate += " AND purpose=?"
	}
	codeQuery := "SELECT id FROM unicore_email_challenges WHERE " + predicate
	if _, err := r.exec(ctx, tx, "UPDATE unicore_mail_jobs SET payload='',state='cancelled' WHERE state IN ('pending','sending') AND token_hash IN ("+codeQuery+")", args...); err != nil {
		return err
	}
	if _, err := r.exec(ctx, tx, "UPDATE unicore_email_challenges SET code_digest='',attempts=5 WHERE "+predicate, args...); err != nil {
		return err
	}
	_, err := r.exec(ctx, tx, "DELETE FROM unicore_account_tokens WHERE "+predicate, args...)
	if err != nil {
		return err
	}
	if purpose == "" {
		if _, err = r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET setup_secret='',setup_session='',setup_expires=0 WHERE user_id=?", user); err != nil {
			return err
		}
		return r.cancelEmailChanges(ctx, tx, user)
	}
	return nil
}
func (r *Repository) tokenAndMail(ctx context.Context, tx *sql.Tx, user, purpose, hash string, expires int, payload string) error {
	if err := r.cancelTokens(ctx, tx, user, purpose); err != nil {
		return err
	}
	if _, err := r.exec(ctx, tx, "INSERT INTO unicore_account_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,?,?)", hash, user, purpose, expires); err != nil {
		return err
	}
	now := time.Now().Unix()
	_, err := r.exec(ctx, tx, "INSERT INTO unicore_mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')", sqlstore.ID(), hash, payload, now, now, expires)
	return err
}
func (r *Repository) RegisterAccount(ctx context.Context, input contracts.RegisterInput, passwordHash, tokenHash string, expires int, payload string) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	user, err := r.insert(ctx, tx, contracts.UserCreate{Username: input.Username, Email: input.Email, Phone: input.Phone, Role: "user"}, passwordHash, "registration")
	if err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_users SET status='pending' WHERE id=?", user.ID); err != nil {
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
	err = r.row(ctx, tx, "SELECT id,status FROM unicore_users WHERE email=?", email).Scan(&user, &status)
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
	if err = r.audit(ctx, tx, user, "auth."+purpose+".requested"); err != nil {
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
	err = r.row(ctx, tx, "SELECT t.user_id,t.expires_at,u.status FROM unicore_account_tokens t JOIN unicore_users u ON u.id=t.user_id WHERE t.token_hash=? AND t.purpose=?", hash, purpose).Scan(&user, &expires, &status)
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
		_, err = r.exec(ctx, tx, "UPDATE unicore_users SET status='active',updated_at=? WHERE id=?", now, user)
	} else {
		_, err = r.exec(ctx, tx, "UPDATE unicore_users SET password_hash=?,updated_at=? WHERE id=?", passwordHash, now, user)
		if err == nil {
			_, err = r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id=?", user)
		}
	}
	if err != nil {
		return err
	}
	if err = r.cancelTokens(ctx, tx, user, ""); err != nil {
		return err
	}
	if err = r.audit(ctx, tx, user, "auth."+purpose+".completed"); err != nil {
		return err
	}
	return tx.Commit()
}

// ClaimMails expires stale proofs, prunes terminal rows and claims up to limit
// jobs under one lease transaction. Account mail (token_hash set) always
// claims before event notifications so verification codes are never stuck
// behind a backlog of slow channel deliveries.
func (r *Repository) ClaimMails(ctx context.Context, now, limit int) ([]mailer.Job, error) {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	// Expire shared account proofs before claiming the mail queue.
	if _, err = r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET setup_secret='',setup_session='',setup_expires=0 WHERE setup_expires>0 AND setup_expires<=?", now); err != nil {
		return nil, err
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_email_changes SET code_digest='' WHERE expires_at<=?", now); err != nil {
		return nil, err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_email_changes WHERE created_at<?", now-7*86400); err != nil {
		return nil, err
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_email_challenges SET code_digest='' WHERE expires_at<=?", now); err != nil {
		return nil, err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_email_challenges WHERE created_at<?", now-7*86400); err != nil {
		return nil, err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_account_tokens WHERE expires_at<=?", now); err != nil {
		return nil, err
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_mail_jobs SET state='dead',payload='',last_error='EXPIRED' WHERE state IN ('pending','sending') AND expires_at<=?", now); err != nil {
		return nil, err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_mail_jobs WHERE created_at<? AND state IN ('sent','dead','cancelled')", now-7*86400); err != nil {
		return nil, err
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_mail_jobs SET state='dead',payload='',last_error='DELIVERY_FAILED' WHERE state='sending' AND lease_until<=? AND attempts>=5", now); err != nil {
		return nil, err
	}
	rows, err := r.rows(ctx, tx, "SELECT id,payload,attempts,expires_at FROM unicore_mail_jobs WHERE (state='pending' AND available_at<=?) OR (state='sending' AND lease_until<=? AND attempts<5) ORDER BY (token_hash=''),created_at,id LIMIT ?", now, now, limit)
	if err != nil {
		return nil, err
	}
	var jobs []mailer.Job
	for rows.Next() {
		var job mailer.Job
		if err = rows.Scan(&job.ID, &job.Payload, &job.Attempts, &job.Expires); err != nil {
			rows.Close()
			return nil, err
		}
		jobs = append(jobs, job)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	for i := range jobs {
		jobs[i].Lease = sqlstore.ID()
		jobs[i].Attempts++
		if _, err = r.exec(ctx, tx, "UPDATE unicore_mail_jobs SET state='sending',attempts=?,lease_id=?,lease_until=? WHERE id=?", jobs[i].Attempts, jobs[i].Lease, now+60, jobs[i].ID); err != nil {
			return nil, err
		}
	}
	return jobs, tx.Commit()
}

// FinishMail records the per-row verdict. Cancellation always wins over the
// delivered flag (suppressed jobs are marked delivered to release the lease).
// Non-retryable failures go straight to dead instead of burning the remaining
// attempts on a send that cannot succeed; cancellation reasons keep their
// explicit codes.
func (r *Repository) FinishMail(ctx context.Context, job mailer.Job, delivered bool, now int) error {
	state, lastError, payload, next := "pending", mailer.FailureDeliveryFailed, job.Payload, now+(1<<min(job.Attempts, 5))*5
	switch {
	case job.Cancelled:
		reason := job.CancelReason
		if reason == "" {
			reason = "DISABLED"
		}
		state, lastError, payload = "cancelled", reason, ""
	case delivered:
		state, lastError, payload = "sent", "", ""
	default:
		if failure := job.Failure; failure != nil && failure.Code != "" {
			lastError = failure.Code
			if !failure.Retryable || job.Attempts >= 5 || next >= job.Expires {
				state, payload = "dead", ""
			}
		} else if job.Attempts >= 5 || next >= job.Expires {
			state, payload = "dead", ""
		}
	}
	_, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mail_jobs SET state=?,last_error=?,payload=?,available_at=?,lease_id='',lease_until=0 WHERE id=? AND state='sending' AND lease_id=?", state, lastError, payload, next, job.ID, job.Lease)
	return err
}
// MailQueueStats reports durable queue depth for the /metrics gauges.
func (r *Repository) MailQueueStats(ctx context.Context) (pending, oldestPending, dead int, err error) {
	now := time.Now().Unix()
	if err = r.row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_mail_jobs WHERE state IN ('pending','sending')").Scan(&pending); err != nil {
		return
	}
	if err = r.row(ctx, r.Store.DB, "SELECT COALESCE(?-MIN(created_at),0) FROM unicore_mail_jobs WHERE state='pending' AND available_at<=?", now, now).Scan(&oldestPending); err != nil {
		return
	}
	err = r.row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_mail_jobs WHERE state='dead'").Scan(&dead)
	return
}

func (r *Repository) MailJobs(ctx context.Context) (contracts.MailJobList, error) {
	result := contracts.MailJobList{Items: []contracts.MailJob{}}
	rows, err := r.rows(ctx, r.Store.DB, "SELECT id,state,attempts,created_at,available_at,last_error FROM unicore_mail_jobs ORDER BY created_at DESC,id DESC LIMIT 30")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item contracts.MailJob
		if err = rows.Scan(&item.ID, &item.State, &item.Attempts, &item.CreatedAt, &item.AvailableAt, &item.LastError); err != nil {
			return result, err
		}
		channel := "email"
		for _, provider := range []string{"wecom", "webhook"} {
			if strings.HasPrefix(item.ID, "notify-"+provider+"-") {
				channel = provider
			}
		}
		item.Channel = &channel
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

// RegisterActiveAccount creates a usable ordinary account without queuing email.
func (r *Repository) RegisterActiveAccount(ctx context.Context, input contracts.RegisterInput, hash string) error {
	if r.Administrators {
		return platform.ErrFlowDisabled
	}
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	user, err := r.insert(ctx, tx, contracts.UserCreate{Username: input.Username, Email: input.Email, Phone: input.Phone, Role: "user"}, hash, "registration")
	if err != nil {
		return err
	}
	if err = r.queueEvent(ctx, tx, "registered", user.ID, "registration_completed"); err != nil {
		return err
	}
	return tx.Commit()
}
