// Author: yunnuo <ymz@ebox.vip>
// Description: Current/new mailbox proofs bound to the active session, with persisted attempts and mail cancellation.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/platform"
	"strings"
	"time"
)

func (r *Repository) cancelEmailChanges(ctx context.Context, tx *sql.Tx, user string) error {
	if _, err := r.exec(ctx, tx, "UPDATE unicore_mail_jobs SET payload='',state='cancelled' WHERE state IN ('pending','sending') AND token_hash IN (SELECT id FROM unicore_email_changes WHERE user_id=?)", user); err != nil {
		return err
	}
	_, err := r.exec(ctx, tx, "DELETE FROM unicore_email_changes WHERE user_id=?", user)
	return err
}
func (r *Repository) validCurrentEmail(ctx context.Context, tx *sql.Tx, id, hash, user, email string, now int) error {
	var count int
	if err := r.row(ctx, tx, "SELECT COUNT(*) FROM unicore_email_changes WHERE id=? AND session_hash=? AND user_id=? AND original_email=? AND parent_id='' AND verified=1 AND expires_at>?", id, hash, user, email, now).Scan(&count); err != nil {
		return err
	}
	if count != 1 {
		return platform.ErrAccountToken
	}
	return nil
}
func (r *Repository) QueueEmailChange(ctx context.Context, c platform.EmailChange) error {
	tx, s, err := r.ownTransaction(ctx, c.SessionHash)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = fullFactor(s); err != nil {
		return err
	}
	if c.UserID != s.User.ID || c.Original != s.User.Email {
		return platform.ErrCredentials
	}
	var latest sql.NullInt64
	predicate := "parent_id=''"
	if c.ParentID != "" {
		predicate = "parent_id<>''"
	}
	if err = r.row(ctx, tx, "SELECT MAX(created_at) FROM unicore_email_changes WHERE user_id=? AND "+predicate, c.UserID).Scan(&latest); err != nil {
		return err
	}
	if latest.Valid && int(latest.Int64)+60 > c.Created {
		return platform.ErrRateLimited
	}
	if c.ParentID != "" {
		if err = r.validCurrentEmail(ctx, tx, c.ParentID, c.SessionHash, c.UserID, c.Original, c.Created); err != nil {
			return err
		}
		if strings.EqualFold(c.Target, s.User.Email) {
			return platform.ErrInput
		}
		var count int
		if err = r.row(ctx, tx, "SELECT COUNT(*) FROM unicore_users WHERE email=?", c.Target).Scan(&count); err != nil {
			return err
		}
		if count != 0 {
			return platform.ErrConflict
		}
		if _, err = r.exec(ctx, tx, "UPDATE unicore_mail_jobs SET payload='',state='cancelled' WHERE state IN ('pending','sending') AND token_hash IN (SELECT id FROM unicore_email_changes WHERE user_id=? AND parent_id<>'')", c.UserID); err != nil {
			return err
		}
		if _, err = r.exec(ctx, tx, "DELETE FROM unicore_email_changes WHERE user_id=? AND parent_id<>''", c.UserID); err != nil {
			return err
		}
	} else {
		if err = r.cancelEmailChanges(ctx, tx, c.UserID); err != nil {
			return err
		}
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_email_changes WHERE expires_at<=?", c.Created); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "INSERT INTO unicore_email_changes(id,user_id,session_hash,parent_id,original_email,target_email,code_digest,verified,attempts,created_at,expires_at) VALUES(?,?,?,?,?,?,?,0,0,?,?)", c.ID, c.UserID, c.SessionHash, c.ParentID, c.Original, c.Target, c.Digest, c.Created, c.Expires); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "INSERT INTO unicore_mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')", sqlstore.ID(), c.ID, c.Payload, c.Created, c.Created, c.Expires); err != nil {
		return err
	}
	if err = r.audit(ctx, tx, s.User.ID, "account.email.code.requested"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) VerifyEmailChange(ctx context.Context, hash, id, digest string, finish bool) error {
	tx, s, err := r.ownTransaction(ctx, hash)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = fullFactor(s); err != nil {
		return err
	}
	var expected, parent, original, target string
	var attempts, expires, verified int
	err = r.row(ctx, tx, "SELECT code_digest,parent_id,original_email,target_email,attempts,expires_at,verified FROM unicore_email_changes WHERE id=? AND user_id=? AND session_hash=?", id, s.User.ID, hash).Scan(&expected, &parent, &original, &target, &attempts, &expires, &verified)
	if errors.Is(err, sql.ErrNoRows) {
		return platform.ErrAccountToken
	}
	if err != nil {
		return err
	}
	if expires <= int(time.Now().Unix()) || attempts >= 5 || verified != 0 || expected == "" || original != s.User.Email || (finish != (parent != "")) {
		return platform.ErrAccountToken
	}
	if !platform.Equal(expected, digest) {
		if _, err = r.exec(ctx, tx, "UPDATE unicore_email_changes SET attempts=attempts+1 WHERE id=?", id); err != nil {
			return err
		}
		if err = tx.Commit(); err != nil {
			return err
		}
		return platform.ErrAccountToken
	}
	if !finish {
		if _, err = r.exec(ctx, tx, "UPDATE unicore_email_changes SET verified=1,code_digest='' WHERE id=?", id); err != nil {
			return err
		}
	} else {
		if err = r.validCurrentEmail(ctx, tx, parent, hash, s.User.ID, original, int(time.Now().Unix())); err != nil {
			return err
		}
		if _, err = r.exec(ctx, tx, "UPDATE unicore_users SET email=?,updated_at=? WHERE id=?", target, time.Now().Unix(), s.User.ID); err != nil {
			return accountError(err)
		}
		if err = r.revokeOthers(ctx, tx, s.User.ID, hash); err != nil {
			return err
		}
		if err = r.audit(ctx, tx, s.User.ID, "account.email.changed"); err != nil {
			return err
		}
	}
	return tx.Commit()
}
