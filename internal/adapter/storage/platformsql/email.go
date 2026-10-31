// Author: yunnuo <ymz@ebox.vip>
// Description: Persisted code attempts and atomic account/session mutations in all SQL dialects.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func (r *Repository) codeAndMail(ctx context.Context, tx *sql.Tx, user string, c platform.EmailChallenge) error {
	// Preserve resend throttling across restarts without exposing account existence.
	var latest sql.NullInt64
	if err := r.row(ctx, tx, "SELECT MAX(created_at) FROM email_challenges WHERE user_id=? AND purpose=?", user, c.Purpose).Scan(&latest); err != nil {
		return err
	}
	if latest.Valid && int(latest.Int64)+60 > c.Created {
		return nil
	}
	if err := r.cancelTokens(ctx, tx, user, c.Purpose); err != nil {
		return err
	}
	if _, err := r.exec(ctx, tx, "INSERT INTO email_challenges(id,user_id,purpose,code_digest,expires_at,created_at,attempts) VALUES(?,?,?,?,?,?,0)", c.ID, user, c.Purpose, c.Digest, c.Expires, c.Created); err != nil {
		return err
	}
	_, err := r.exec(ctx, tx, "INSERT INTO mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')", sqlstore.ID(), c.ID, c.Payload, c.Created, c.Created, c.Expires)
	return err
}
func (r *Repository) RegisterEmailChallenge(ctx context.Context, input contracts.RegisterInput, hash string, c platform.EmailChallenge) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	user, err := r.insert(ctx, tx, contracts.UserCreate{Username: input.Username, Email: input.Email, Role: "user"}, hash, "registration")
	if err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "UPDATE users SET status='pending' WHERE id=?", user.ID); err != nil {
		return err
	}
	if err = r.codeAndMail(ctx, tx, user.ID, c); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) QueueEmailChallenge(ctx context.Context, email string, c platform.EmailChallenge) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var user, status string
	err = r.row(ctx, tx, "SELECT id,status FROM users WHERE email=?", email).Scan(&user, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if (c.Purpose == "verify" && status != "pending") || (c.Purpose != "verify" && status != "active") {
		return nil
	}
	if err = r.codeAndMail(ctx, tx, user, c); err != nil {
		return err
	}
	if err = r.audit(ctx, tx, user, "auth."+c.Purpose+".requested"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) ConsumeEmailChallenge(ctx context.Context, id, purpose, digest, passwordHash, sessionHash string, sessionExpires, now int) (contracts.User, error) {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return contracts.User{}, err
	}
	defer tx.Rollback()
	var user, status, expected string
	var expires, attempts int
	err = r.row(ctx, tx, "SELECT c.user_id,c.code_digest,c.expires_at,c.attempts,u.status FROM email_challenges c JOIN users u ON u.id=c.user_id WHERE c.id=? AND c.purpose=?", id, purpose).Scan(&user, &expected, &expires, &attempts, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return contracts.User{}, platform.ErrAccountToken
	}
	if err != nil {
		return contracts.User{}, err
	}
	if expires <= now || attempts >= 5 || expected == "" || (purpose == "verify" && status != "pending") || (purpose != "verify" && status != "active") {
		return contracts.User{}, platform.ErrAccountToken
	}
	if !platform.Equal(expected, digest) {
		// Commit failures; rolling this transaction back would reset the guess counter.
		if _, err = r.exec(ctx, tx, "UPDATE email_challenges SET attempts=attempts+1 WHERE id=?", id); err != nil {
			return contracts.User{}, err
		}
		if attempts+1 >= 5 {
			if err = r.cancelTokens(ctx, tx, user, purpose); err != nil {
				return contracts.User{}, err
			}
		}
		if err = tx.Commit(); err != nil {
			return contracts.User{}, err
		}
		return contracts.User{}, platform.ErrAccountToken
	}
	switch purpose {
	case "verify":
		_, err = r.exec(ctx, tx, "UPDATE users SET status='active',updated_at=? WHERE id=?", now, user)
	case "reset":
		_, err = r.exec(ctx, tx, "UPDATE users SET password_hash=?,updated_at=? WHERE id=?", passwordHash, now, user)
		if err == nil {
			_, err = r.exec(ctx, tx, "DELETE FROM sessions WHERE user_id=?", user)
		}
	case "login":
		_, err = r.exec(ctx, tx, "DELETE FROM sessions WHERE expires_at<=?", now)
		if err == nil {
			_, err = r.exec(ctx, tx, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", sessionHash, user, sessionExpires)
		}
		if err == nil {
			_, err = r.exec(ctx, tx, "UPDATE users SET last_login_at=? WHERE id=?", now, user)
		}
	default:
		return contracts.User{}, platform.ErrInput
	}
	if err != nil {
		return contracts.User{}, err
	}
	cancelPurpose := purpose
	if purpose == "reset" {
		cancelPurpose = ""
	}
	if err = r.cancelTokens(ctx, tx, user, cancelPurpose); err != nil {
		return contracts.User{}, err
	}
	if err = r.audit(ctx, tx, user, "auth."+purpose+".completed"); err != nil {
		return contracts.User{}, err
	}
	result, err := r.user(ctx, tx, user)
	if err != nil {
		return result, err
	}
	return result, tx.Commit()
}
