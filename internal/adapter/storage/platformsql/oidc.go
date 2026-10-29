// Author: yunnuo <ymz@ebox.vip>
// Description: Atomic OIDC identity binding, least-privilege JIT and browser flow consumption.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
)

func (r *Repository) CreateOIDCFlow(ctx context.Context, state, browser, payload string, expires int64) error {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM oidc_flows WHERE expires_at<=?", time.Now().Unix()); err != nil {
		return err
	}
	var count int
	if err = r.row(ctx, tx, "SELECT COUNT(*) FROM oidc_flows").Scan(&count); err != nil {
		return err
	}
	if count >= 2048 {
		return platform.ErrRateLimited
	}
	if _, err = r.exec(ctx, tx, "INSERT INTO oidc_flows(state_hash,browser_hash,sealed_payload,expires_at) VALUES(?,?,?,?)", state, browser, payload, expires); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) ConsumeOIDCFlow(ctx context.Context, state, browser string) (string, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return "", err
	}
	var payload string
	if err = r.row(ctx, tx, "SELECT sealed_payload FROM oidc_flows WHERE state_hash=? AND browser_hash=? AND expires_at>?", state, browser, time.Now().Unix()).Scan(&payload); err != nil {
		return "", platform.ErrOIDC
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM oidc_flows WHERE state_hash=?", state); err != nil {
		return "", err
	}
	return payload, tx.Commit()
}
func (r *Repository) OIDCAccount(ctx context.Context, userID string) (contracts.OIDCInfo, error) {
	var hash string
	result := contracts.OIDCInfo{}
	if err := r.row(ctx, r.Store.DB, "SELECT password_hash FROM users WHERE id=?", userID).Scan(&hash); err != nil {
		return result, err
	}
	result.HasLocalPassword = hash != ""
	err := r.row(ctx, r.Store.DB, "SELECT issuer FROM external_identities WHERE user_id=?", userID).Scan(&result.Issuer)
	if errors.Is(err, sql.ErrNoRows) {
		return result, nil
	}
	result.Linked = err == nil
	return result, err
}
func (r *Repository) oidcSettings(ctx context.Context, tx *sql.Tx) (map[string]string, error) {
	rows, err := r.rows(ctx, tx, "SELECT setting_key,setting_value FROM system_settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	v := settings.Defaults("web-platform")
	for rows.Next() {
		var k, value string
		if err = rows.Scan(&k, &value); err != nil {
			return nil, err
		}
		v[k] = value
	}
	return v, rows.Err()
}
func (r *Repository) oidcActor(ctx context.Context, tx *sql.Tx, f platform.OIDCFlow) error {
	var hash, status string
	var count int
	if err := r.row(ctx, tx, "SELECT password_hash,status FROM users WHERE id=?", f.UserID).Scan(&hash, &status); err != nil {
		return platform.ErrCredentials
	}
	if hash == "" || status != "active" || !platform.Equal(hash, f.CredentialHash) {
		return platform.ErrCredentials
	}
	if err := r.row(ctx, tx, "SELECT COUNT(*) FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?", f.SessionHash, f.UserID, time.Now().Unix()).Scan(&count); err != nil {
		return err
	}
	if count != 1 {
		return platform.ErrCredentials
	}
	return nil
}
func (r *Repository) oidcSession(ctx context.Context, tx *sql.Tx, id, sessionHash string, expires int, rotate bool, action string) (contracts.User, error) {
	if rotate {
		if _, err := r.exec(ctx, tx, "DELETE FROM sessions WHERE user_id=?", id); err != nil {
			return contracts.User{}, err
		}
		if err := r.cancelTokens(ctx, tx, id, ""); err != nil {
			return contracts.User{}, err
		}
	}
	user, err := r.user(ctx, tx, id)
	if err != nil {
		return user, err
	}
	if user.Status != "active" {
		return user, platform.ErrCredentials
	}
	if _, err = r.exec(ctx, tx, "DELETE FROM sessions WHERE expires_at<=?", time.Now().Unix()); err != nil {
		return user, err
	}
	if _, err = r.exec(ctx, tx, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", sessionHash, id, expires); err != nil {
		return user, err
	}
	if _, err = r.exec(ctx, tx, "UPDATE users SET last_login_at=? WHERE id=?", time.Now().Unix(), id); err != nil {
		return user, err
	}
	return user, r.audit(ctx, tx, id, action)
}
func (r *Repository) CompleteOIDC(ctx context.Context, f platform.OIDCFlow, claims platform.OIDCClaims, sessionHash string, expires int) (contracts.User, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.User{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.User{}, err
	}
	v, err := r.oidcSettings(ctx, tx)
	if err != nil {
		return contracts.User{}, err
	}
	if v["oidc.enabled"] != "true" || settings.OIDCFingerprint(v) != f.Fingerprint || claims.Issuer != v["oidc.issuer"] || claims.Subject == "" {
		return contracts.User{}, platform.ErrOIDC
	}
	identityHash := platform.Hash(claims.Issuer + "\x00" + claims.Subject)
	var id string
	err = r.row(ctx, tx, "SELECT user_id FROM external_identities WHERE identity_hash=?", identityHash).Scan(&id)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return contracts.User{}, err
	}
	if f.Mode == "link" {
		if err = r.oidcActor(ctx, tx, f); err != nil {
			return contracts.User{}, err
		}
		if id != "" && id != f.UserID {
			return contracts.User{}, platform.ErrOIDCLinkRequired
		}
		var count int
		if err = r.row(ctx, tx, "SELECT COUNT(*) FROM external_identities WHERE user_id=?", f.UserID).Scan(&count); err != nil {
			return contracts.User{}, err
		}
		if count > 0 {
			return contracts.User{}, platform.ErrOIDCLinkRequired
		}
		id = f.UserID
	} else if f.Mode == "login" {
		if id == "" {
			if r.Administrators || v["oidc.jit_enabled"] != "true" || !claims.EmailVerified || !settings.ValidEmail(claims.Email) {
				return contracts.User{}, platform.ErrOIDCLinkRequired
			}
			var count int
			if err = r.row(ctx, tx, "SELECT COUNT(*) FROM users WHERE email=?", claims.Email).Scan(&count); err != nil {
				return contracts.User{}, err
			}
			if count > 0 {
				return contracts.User{}, platform.ErrOIDCLinkRequired
			}
			u, err := r.insert(ctx, tx, contracts.UserCreate{Username: "sso_" + sqlstore.ID(), Email: claims.Email, Role: "user"}, "", "oidc")
			if err != nil {
				return contracts.User{}, err
			}
			id = u.ID
		}
	} else {
		return contracts.User{}, platform.ErrOIDC
	}
	var exists int
	if err = r.row(ctx, tx, "SELECT COUNT(*) FROM external_identities WHERE identity_hash=?", identityHash).Scan(&exists); err != nil {
		return contracts.User{}, err
	}
	if exists == 0 {
		if _, err = r.exec(ctx, tx, "INSERT INTO external_identities(identity_hash,user_id,issuer,subject,created_at) VALUES(?,?,?,?,?)", identityHash, id, claims.Issuer, claims.Subject, time.Now().Unix()); err != nil {
			return contracts.User{}, accountError(err)
		}
	}
	action := "auth.oidc.login"
	if f.Mode == "link" {
		action = "auth.oidc.linked"
	}
	u, err := r.oidcSession(ctx, tx, id, sessionHash, expires, f.Mode == "link", action)
	if err != nil {
		return u, err
	}
	return u, tx.Commit()
}
func (r *Repository) UnlinkOIDC(ctx context.Context, f platform.OIDCFlow, sessionHash string, expires int) (contracts.User, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.User{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.User{}, err
	}
	if err = r.oidcActor(ctx, tx, f); err != nil {
		return contracts.User{}, err
	}
	result, err := r.exec(ctx, tx, "DELETE FROM external_identities WHERE user_id=?", f.UserID)
	if err != nil {
		return contracts.User{}, err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return contracts.User{}, platform.ErrOIDC
	}
	u, err := r.oidcSession(ctx, tx, f.UserID, sessionHash, expires, true, "auth.oidc.unlinked")
	if err != nil {
		return u, err
	}
	return u, tx.Commit()
}
