// Author: yunnuo <ymz@ebox.vip>
// Description: Transactional token families; session anchors preserve all existing revocation boundaries.
package platformsql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
)

func (r *Repository) verifiedTokenOwner(ctx context.Context, q sqlstore.Runner, hash string) (platform.PersonalSession, error) {
	s, err := r.personalSession(ctx, q, hash)
	if err != nil {
		return s, err
	}
	if err = fullFactor(s); err != nil {
		return s, err
	}
	values, err := r.securityValues(ctx, q)
	if err != nil {
		return s, err
	}
	if settings.Force2FA(values, platform.HasManagementAccess(s.User)) && s.State.Secret == "" {
		return s, platform.ErrMFAEnrollment
	}
	return s, nil
}
func (r *Repository) insertCredential(ctx context.Context, tx *sql.Tx, c platform.APICredential) error {
	ops, err := json.Marshal(c.Operations)
	if err != nil {
		return err
	}
	_, err = r.exec(ctx, tx, "INSERT INTO unicore_api_credentials(id,user_id,kind,name,session_hash,session_secret,operations,created_at,expires_at,last_used_at,revoked) VALUES(?,?,?,?,?,?,?,?,?,0,0)", c.ID, c.UserID, c.Kind, c.Name, c.SessionHash, c.SessionSecret, string(ops), c.CreatedAt, c.ExpiresAt)
	return err
}
func (r *Repository) BindClient(ctx context.Context, source string, c platform.APICredential, refreshHash string) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	s, err := r.verifiedTokenOwner(ctx, tx, source)
	if err != nil {
		return err
	}
	if s.User.ID != c.UserID || c.ExpiresAt > s.Expires {
		return platform.ErrCredentials
	}
	// Consume the proof session: a returned MFA challenge can never become
	// a reusable Cookie credential after the second factor succeeds.
	// Create the new parent before moving device details: PostgreSQL
	// enforces their foreign key immediately (SQLite does not).
	var lockedOwner string
	if err = r.row(ctx, tx, sqlstore.LockQuery(r.Store.Dialect, "SELECT user_id FROM unicore_sessions WHERE token_hash=?"), source).Scan(&lockedOwner); err != nil {
		return err
	}
	if lockedOwner != c.UserID {
		return platform.ErrCredentials
	}
	result, err := r.exec(ctx, tx, "INSERT INTO unicore_sessions(token_hash,user_id,expires_at) SELECT ?,user_id,? FROM unicore_sessions WHERE token_hash=? AND user_id=?", c.SessionHash, c.ExpiresAt, source, c.UserID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return platform.ErrCredentials
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_session_details SET token_hash=? WHERE token_hash=?", c.SessionHash, source); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE token_hash=?", source); err != nil {
		return err
	}
	if err = r.pruneAPICredentials(ctx, tx); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM unicore_api_credentials WHERE kind='challenge' AND session_hash=?", source); err != nil {
		return err
	}
	if err = r.insertCredential(ctx, tx, c); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "INSERT INTO unicore_api_refresh_tokens(token_hash,credential_id,expires_at,used) VALUES(?,?,?,0)", refreshHash, c.ID, c.ExpiresAt); err != nil {
		return err
	}
	if err = r.audit(audit.Target(ctx, "credential/"+c.ID, "kind=client"), tx, c.UserID, "auth.token.issued"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) credential(ctx context.Context, q sqlstore.Runner, kind, key string) (platform.APICredential, error) {
	var c platform.APICredential
	var operations string
	var revoked int
	field := "c.id"
	if kind == "pat" {
		field = "c.session_hash"
	}
	err := r.row(ctx, q, "SELECT c.id,c.user_id,c.kind,c.name,c.session_hash,c.session_secret,c.operations,c.created_at,c.expires_at,c.last_used_at,c.revoked FROM unicore_api_credentials c JOIN unicore_sessions s ON s.token_hash=c.session_hash AND s.user_id=c.user_id WHERE "+field+"=? AND c.kind=? AND s.expires_at>? AND c.expires_at>? AND c.revoked=0", key, kind, time.Now().Unix(), time.Now().Unix()).Scan(&c.ID, &c.UserID, &c.Kind, &c.Name, &c.SessionHash, &c.SessionSecret, &operations, &c.CreatedAt, &c.ExpiresAt, &c.LastUsedAt, &revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return c, platform.ErrCredentials
	}
	if err != nil {
		return c, err
	}
	c.Revoked = revoked != 0
	if err = json.Unmarshal([]byte(operations), &c.Operations); err != nil {
		return c, err
	}
	return c, nil
}
func (r *Repository) ResolveCredential(ctx context.Context, kind, key string) (platform.APICredential, contracts.User, error) {
	c, err := r.credential(ctx, r.Store.DB, kind, key)
	if err != nil {
		return c, contracts.User{}, err
	}
	user, err := r.user(ctx, r.Store.DB, c.UserID)
	if err != nil {
		return c, user, err
	}
	if user.Status != "active" {
		return c, user, platform.ErrCredentials
	}
	// Do not inherit the browser's idle timeout for a named PAT. Its opaque
	// anchor has no device row, cannot be used as a browser session and expires
	// at the explicitly chosen credential deadline.
	if _, err = r.exec(ctx, r.Store.DB, "UPDATE unicore_api_credentials SET last_used_at=? WHERE id=? AND last_used_at<?", time.Now().Unix(), c.ID, time.Now().Add(-time.Minute).Unix()); err != nil {
		return c, user, err
	}
	return c, user, nil
}
func (r *Repository) revokeCredential(ctx context.Context, tx *sql.Tx, id, user, event string) error {
	if _, err := r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE token_hash IN (SELECT session_hash FROM unicore_api_credentials WHERE id=?)", id); err != nil {
		return err
	}
	if _, err := r.exec(ctx, tx, "UPDATE unicore_api_credentials SET revoked=1 WHERE id=?", id); err != nil {
		return err
	}
	return r.audit(audit.Target(ctx, "credential/"+id, ""), tx, user, event)
}
func (r *Repository) RotateRefresh(ctx context.Context, previous, next string) (platform.APICredential, error) {
	var c platform.APICredential
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return c, err
	}
	defer tx.Rollback()
	var id string
	var used, expires int
	if err = r.row(ctx, tx, "SELECT credential_id,used,expires_at FROM unicore_api_refresh_tokens WHERE token_hash=?", previous).Scan(&id, &used, &expires); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c, platform.ErrCredentials
		}
		return c, err
	}
	if expires <= int(time.Now().Unix()) {
		return c, platform.ErrCredentials
	}
	c, err = r.credential(ctx, tx, "client", id)
	if err != nil {
		return c, err
	}
	if used != 0 {
		if err = r.revokeCredential(ctx, tx, c.ID, c.UserID, "auth.token.replay_detected"); err != nil {
			return c, err
		}
		if err = tx.Commit(); err != nil {
			return c, err
		}
		return c, platform.ErrCredentials
	}
	if _, err = r.verifiedTokenOwner(ctx, tx, c.SessionHash); err != nil {
		return c, err
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_api_refresh_tokens SET used=1 WHERE token_hash=?", previous); err != nil {
		return c, err
	}
	if _, err = r.exec(ctx, tx, "INSERT INTO unicore_api_refresh_tokens(token_hash,credential_id,expires_at,used) VALUES(?,?,?,0)", next, c.ID, c.ExpiresAt); err != nil {
		return c, err
	}
	if err = r.audit(audit.Target(ctx, "credential/"+c.ID, ""), tx, c.UserID, "auth.token.refreshed"); err != nil {
		return c, err
	}
	return c, tx.Commit()
}
func (r *Repository) RevokeRefresh(ctx context.Context, hash string) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id, user string
	err = r.row(ctx, tx, "SELECT c.id,c.user_id FROM unicore_api_refresh_tokens rt JOIN unicore_api_credentials c ON c.id=rt.credential_id WHERE rt.token_hash=? AND c.kind='client'", hash).Scan(&id, &user)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if err = r.revokeCredential(ctx, tx, id, user, "auth.token.revoked"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) CreatePersonalToken(ctx context.Context, source string, c platform.APICredential) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	s, err := r.verifiedTokenOwner(ctx, tx, source)
	if err != nil {
		return err
	}
	if s.User.ID != c.UserID {
		return platform.ErrForbidden
	}
	var count int
	if err = r.row(ctx, tx, "SELECT COUNT(*) FROM unicore_api_credentials c JOIN unicore_sessions s ON s.token_hash=c.session_hash WHERE c.user_id=? AND c.kind='pat' AND c.revoked=0 AND c.expires_at>?", c.UserID, time.Now().Unix()).Scan(&count); err != nil {
		return err
	}
	if count >= 50 {
		return platform.ErrInput
	}
	for _, id := range c.Operations {
		op, ok := platform.Operation(id)
		if !ok || !op.Grantable || op.SuperAdmin || !platform.OperationAllowed(s.User, id) || !platform.PermissionsAllow(s.User.Permissions, op.Permissions, op.PermissionMode) {
			return platform.ErrForbidden
		}
	}
	if _, err = r.exec(ctx, tx, "INSERT INTO unicore_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", c.SessionHash, c.UserID, c.ExpiresAt); err != nil {
		return err
	}
	if err = r.insertCredential(ctx, tx, c); err != nil {
		return err
	}
	if err = r.audit(audit.Target(ctx, "credential/"+c.ID, "kind=pat"), tx, c.UserID, "auth.personal_token.created"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) PersonalTokens(ctx context.Context, user string) ([]platform.APICredential, error) {
	rows, err := r.rows(ctx, r.Store.DB, "SELECT c.id,c.name,c.operations,c.created_at,c.expires_at,c.last_used_at,c.revoked,CASE WHEN EXISTS(SELECT 1 FROM unicore_sessions s WHERE s.token_hash=c.session_hash AND s.user_id=c.user_id AND s.expires_at>?) THEN 1 ELSE 0 END AS live FROM unicore_api_credentials c WHERE c.user_id=? AND c.kind='pat' ORDER BY c.revoked ASC,live DESC,c.created_at DESC,c.id LIMIT 200", time.Now().Unix(), user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []platform.APICredential{}
	for rows.Next() {
		var c platform.APICredential
		var ops string
		var revoked, live int
		if err = rows.Scan(&c.ID, &c.Name, &ops, &c.CreatedAt, &c.ExpiresAt, &c.LastUsedAt, &revoked, &live); err != nil {
			return nil, err
		}
		c.Revoked = revoked != 0 || live == 0
		c.UserID = user
		c.Kind = "pat"
		if err = json.Unmarshal([]byte(ops), &c.Operations); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}
func (r *Repository) RevokePersonalToken(ctx context.Context, user, id string) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var owner string
	if err = r.row(ctx, tx, "SELECT user_id FROM unicore_api_credentials WHERE id=? AND kind='pat'", id).Scan(&owner); err != nil {
		return platform.ErrForbidden
	}
	if owner != user {
		return platform.ErrForbidden
	}
	if err = r.revokeCredential(ctx, tx, id, user, "auth.personal_token.revoked"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) TokenKey(ctx context.Context, id string, candidate platform.TokenSigningKey, rotate bool) (platform.TokenSigningKey, error) {
	read := func(q sqlstore.Runner) (platform.TokenSigningKey, error) {
		var k platform.TokenSigningKey
		field := "id=?"
		arg := any(id)
		if id == "" {
			field = "active=?"
			arg = 1
		}
		err := r.row(ctx, q, "SELECT id,secret,created_at,valid_until FROM unicore_api_token_keys WHERE "+field, arg).Scan(&k.ID, &k.Secret, &k.CreatedAt, &k.ValidUntil)
		if err == nil && k.ValidUntil != 0 && k.ValidUntil <= int(time.Now().Unix()) {
			return k, platform.ErrCredentials
		}
		return k, err
	}
	if !rotate {
		k, err := read(r.Store.DB)
		if err == nil {
			return k, nil
		}
		if id != "" && errors.Is(err, sql.ErrNoRows) {
			return k, platform.ErrCredentials
		}
		if id != "" || !errors.Is(err, sql.ErrNoRows) {
			return k, err
		}
	}
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return candidate, err
	}
	defer tx.Rollback()
	if rotate {
		if err = r.AuthorizeAdministrator(ctx, tx, candidate.ActorID, "settings:write"); err != nil {
			return candidate, err
		}
	}
	if !rotate {
		if k, e := read(tx); e == nil {
			return k, nil
		} else if !errors.Is(e, sql.ErrNoRows) {
			return k, e
		}
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_api_token_keys SET active=0,valid_until=? WHERE active=1", time.Now().Unix()+platform.AccessTokenSeconds); err != nil {
		return candidate, err
	}
	if _, err = r.exec(ctx, tx, "INSERT INTO unicore_api_token_keys(id,secret,created_at,valid_until,active) VALUES(?,?,?,0,1)", candidate.ID, candidate.Secret, candidate.CreatedAt); err != nil {
		return candidate, err
	}
	if rotate {
		if err = r.audit(audit.Target(ctx, "token-key/"+candidate.ID, ""), tx, candidate.ActorID, "auth.token_key.rotated"); err != nil {
			return candidate, err
		}
	}
	return candidate, tx.Commit()
}

var _ platform.TokenStore = (*Repository)(nil)

// Expired refresh proofs have no future replay authority. Keep expired
// credential metadata for thirty days; cleanup runs during fresh issuance.
func (r *Repository) pruneAPICredentials(ctx context.Context, tx *sql.Tx) error {
	now := time.Now().Unix()
	if _, err := r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE token_hash IN (SELECT session_hash FROM unicore_api_credentials WHERE kind='challenge' AND expires_at<=?)", now); err != nil {
		return err
	}
	if _, err := r.exec(ctx, tx, "DELETE FROM unicore_api_credentials WHERE kind='challenge' AND expires_at<=?", now); err != nil {
		return err
	}
	if _, err := r.exec(ctx, tx, "DELETE FROM unicore_api_refresh_tokens WHERE expires_at<=?", now); err != nil {
		return err
	}
	if _, err := r.exec(ctx, tx, "DELETE FROM unicore_api_credentials WHERE expires_at<=?", now-30*86400); err != nil {
		return err
	}
	_, err := r.exec(ctx, tx, "DELETE FROM unicore_api_token_keys WHERE active=0 AND valid_until<=?", now)
	return err
}

func (r *Repository) BindClientChallenge(ctx context.Context, c platform.APICredential) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	state, err := r.personalSession(ctx, tx, c.SessionHash)
	if err != nil {
		return err
	}
	if state.User.ID != c.UserID || state.State.Secret == "" || state.Verified == 1 || state.Created == 0 || state.Created+300 <= int(time.Now().Unix()) || state.Attempts >= 8 {
		return platform.ErrCredentials
	}
	c.ExpiresAt = min(c.ExpiresAt, state.Created+300, state.Expires)
	if err = r.insertCredential(ctx, tx, c); err != nil {
		return err
	}
	if err = r.audit(audit.Target(ctx, "credential/"+c.ID, "kind=client-mfa"), tx, c.UserID, "auth.token.mfa_challenged"); err != nil {
		return err
	}
	return tx.Commit()
}
