// Author: yunnuo <ymz@ebox.vip>
// Description: Own-account transactions, atomic factor consumption and durable device inventory.
package platformsql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
)

func (r *Repository) personalState(ctx context.Context, q sqlstore.Runner, user string) (platform.PersonalState, error) {
	var s platform.PersonalState
	err := r.row(ctx, q, "SELECT display_name,totp_secret,recovery_digests,last_step,setup_secret,setup_session,setup_expires,setup_attempts FROM unicore_personal_accounts WHERE user_id=?", user).Scan(&s.DisplayName, &s.Secret, &s.Recovery, &s.LastStep, &s.SetupSecret, &s.SetupSession, &s.SetupExpires, &s.SetupAttempts)
	if errors.Is(err, sql.ErrNoRows) {
		err = nil
		s.LastStep = -1
	}
	return s, err
}
func (r *Repository) ensurePersonal(ctx context.Context, tx *sql.Tx, user string) error {
	_, err := r.exec(ctx, tx, "INSERT INTO unicore_personal_accounts(user_id,display_name,totp_secret,recovery_digests,last_step,setup_secret,setup_session,setup_expires,setup_attempts) SELECT ?,'','','',-1,'','',0,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_personal_accounts WHERE user_id=?)", user, user)
	return err
}
func (r *Repository) recordDevice(ctx context.Context, tx *sql.Tx, hash, user string, verified int) error {
	d := platform.DeviceFrom(ctx)
	now := time.Now().Unix()
	if len(d.IP) > 64 {
		d.IP = d.IP[:64]
	}
	d.Agent = strings.ToValidUTF8(d.Agent, "")
	agent := []rune(d.Agent)
	if len(agent) > 512 {
		d.Agent = string(agent[:512])
	}
	// MySQL inline REFERENCES is not relied upon for cleanup.
	if _, err := r.exec(ctx, tx, "DELETE FROM unicore_session_details WHERE token_hash NOT IN (SELECT token_hash FROM unicore_sessions)"); err != nil {
		return err
	}
	_, err := r.exec(ctx, tx, "INSERT INTO unicore_session_details(token_hash,user_id,ip_address,user_agent,created_at,last_seen_at,mfa_verified,mfa_attempts) VALUES(?,?,?,?,?,?,?,0)", hash, user, d.IP, d.Agent, now, now, verified)
	return err
}
func (r *Repository) personalSession(ctx context.Context, q sqlstore.Runner, hash string) (platform.PersonalSession, error) {
	var s platform.PersonalSession
	var user string
	err := r.row(ctx, q, "SELECT user_id,expires_at FROM unicore_sessions WHERE token_hash=?", hash).Scan(&user, &s.Expires)
	if errors.Is(err, sql.ErrNoRows) {
		return s, platform.ErrCredentials
	}
	if err != nil {
		return s, err
	}
	s.User, err = r.user(ctx, q, user)
	if err != nil {
		return s, err
	}
	if s.User.Status != "active" || s.Expires <= int(time.Now().Unix()) {
		return s, platform.ErrCredentials
	}
	s.State, err = r.personalState(ctx, q, user)
	if err != nil {
		return s, err
	}
	err = r.row(ctx, q, "SELECT created_at,last_seen_at,mfa_verified,mfa_attempts FROM unicore_session_details WHERE token_hash=? AND user_id=?", hash, user).Scan(&s.Created, &s.LastSeen, &s.Verified, &s.Attempts)
	if errors.Is(err, sql.ErrNoRows) {
		err = nil
	}
	if err == nil {
		err = r.sessionPolicy(ctx, q, &s)
	}
	return s, err
}
func (r *Repository) PersonalSession(ctx context.Context, hash string) (platform.PersonalSession, error) {
	return r.personalSession(ctx, r.Store.DB, hash)
}
func (r *Repository) ownTransaction(ctx context.Context, hash string) (*sql.Tx, platform.PersonalSession, error) {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return nil, platform.PersonalSession{}, err
	}
	s, err := r.personalSession(ctx, tx, hash)
	if err != nil {
		_ = tx.Rollback()
		return nil, s, err
	}
	return tx, s, nil
}
func fullFactor(s platform.PersonalSession) error {
	if s.State.Secret != "" && s.Verified != 1 {
		return platform.ErrMFA
	}
	return nil
}
func (r *Repository) SaveDisplayName(ctx context.Context, hash, name string) error {
	return r.SaveAccountProfile(ctx, hash, name, nil)
}

// SaveAccountProfile rechecks the session and file metadata under the account transaction.
func (r *Repository) SaveAccountProfile(ctx context.Context, hash, name string, avatar *string) error {
	tx, s, err := r.ownTransaction(ctx, hash)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = fullFactor(s); err != nil {
		return err
	}
	if avatar != nil && *avatar != "" {
		var owner, realm, state, purpose, mime string
		var size, expires int64
		err = r.Store.Row(ctx, tx, sqlstore.LockQuery(r.Store.Dialect, "SELECT creator_id,creator_realm,state,purpose,mime_type,size,expires_at FROM unicore_file_metadata WHERE id=?"), *avatar).Scan(&owner, &realm, &state, &purpose, &mime, &size, &expires)
		if errors.Is(err, sql.ErrNoRows) {
			return platform.ErrInput
		}
		if err != nil {
			return err
		}
		if owner != s.User.ID || realm != r.avatarRealm() || state != "ready" || purpose != "user" || size <= 0 || size > 2<<20 || (mime != "image/png" && mime != "image/jpeg" && mime != "image/gif") || (expires > 0 && expires <= time.Now().Unix()) {
			return platform.ErrInput
		}
	}
	if err = r.ensurePersonal(ctx, tx, s.User.ID); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET display_name=? WHERE user_id=?", name, s.User.ID); err != nil {
		return err
	}
	if avatar != nil {
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_account_avatars WHERE user_id=? AND creator_realm=?", s.User.ID, r.avatarRealm()); err != nil {
			return err
		}
		if *avatar != "" {
			if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_account_avatars(user_id,creator_realm,file_id,updated_at) VALUES(?,?,?,?)", s.User.ID, r.avatarRealm(), *avatar, time.Now().Unix()); err != nil {
				return err
			}
		}
	}
	if err = r.audit(ctx, tx, s.User.ID, "account.profile.updated"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) SaveTOTPSetup(ctx context.Context, hash, credential, sealed string, expires int) error {
	tx, s, err := r.ownTransaction(ctx, hash)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if s.State.Secret != "" {
		return platform.ErrConflict
	}
	var current string
	if err = r.row(ctx, tx, "SELECT password_hash FROM unicore_users WHERE id=?", s.User.ID).Scan(&current); err != nil {
		return err
	}
	if current != credential || current == "" {
		return platform.ErrCredentials
	}
	if err = r.ensurePersonal(ctx, tx, s.User.ID); err != nil {
		return err
	}
	_, err = r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET setup_secret=?,setup_session=?,setup_expires=?,setup_attempts=0 WHERE user_id=?", sealed, hash, expires, s.User.ID)
	if err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) CancelTOTPSetup(ctx context.Context, hash string) error {
	tx, s, err := r.ownTransaction(ctx, hash)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET setup_secret='',setup_session='',setup_expires=0 WHERE user_id=? AND setup_session=?", s.User.ID, hash); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) revokeOthers(ctx context.Context, tx *sql.Tx, user, hash string) error {
	if _, err := r.exec(ctx, tx, "DELETE FROM unicore_session_details WHERE user_id=? AND token_hash<>?", user, hash); err != nil {
		return err
	}
	if _, err := r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id=? AND token_hash<>?", user, hash); err != nil {
		return err
	}
	if err := r.cancelTokens(ctx, tx, user, ""); err != nil {
		return err
	}
	return r.cancelEmailChanges(ctx, tx, user)
}
func (r *Repository) EnableTOTP(ctx context.Context, hash, setup string, step int, recovery string) error {
	tx, s, err := r.ownTransaction(ctx, hash)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if s.State.Secret != "" || setup == "" || s.State.SetupSecret != setup || s.State.SetupSession != hash || s.State.SetupExpires <= int(time.Now().Unix()) || s.State.SetupAttempts >= 5 {
		return platform.ErrMFAInvalid
	}
	if step < 0 {
		if _, err = r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET setup_attempts=setup_attempts+1 WHERE user_id=?", s.User.ID); err != nil {
			return err
		}
		if err = tx.Commit(); err != nil {
			return err
		}
		return platform.ErrMFAInvalid
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET totp_secret=?,recovery_digests=?,last_step=?,setup_secret='',setup_session='',setup_expires=0 WHERE user_id=?", setup, recovery, step, s.User.ID); err != nil {
		return err
	}
	if err = r.revokeOthers(ctx, tx, s.User.ID, hash); err != nil {
		return err
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_session_details SET mfa_verified=1 WHERE token_hash=?", hash); err != nil {
		return err
	}
	// Legacy sessions may predate inventory; enabling must keep precisely this device verified.
	var count int
	if err = r.row(ctx, tx, "SELECT COUNT(*) FROM unicore_session_details WHERE token_hash=?", hash).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		if err = r.recordDevice(ctx, tx, hash, s.User.ID, 1); err != nil {
			return err
		}
	}
	if err = r.audit(ctx, tx, s.User.ID, "account.totp.enabled"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) UseFactor(ctx context.Context, hash, secret string, step int, recovery string, disable bool) error {
	tx, s, err := r.ownTransaction(ctx, hash)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if s.State.Secret == "" || secret != s.State.Secret || s.Attempts >= 8 {
		return platform.ErrMFAInvalid
	}
	if !disable && s.Verified != 1 && (s.Created == 0 || s.Created+300 <= int(time.Now().Unix())) {
		return platform.ErrCredentials
	}
	if disable {
		if err = fullFactor(s); err != nil {
			return err
		}
		values, err := r.securityValues(ctx, tx)
		if err != nil {
			return err
		}
		if settings.Force2FA(values, platform.HasManagementAccess(s.User)) {
			return platform.ErrForbidden
		}
		var value string
		value = ""
		err = r.Store.Row(ctx, tx, "SELECT setting_value FROM unicore_system_settings WHERE setting_key=?", "security.allow_disable_2fa").Scan(&value)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if value == "false" {
			return platform.ErrForbidden
		}
	}
	valid := step >= 0 && step > s.State.LastStep
	var digests []string
	if recovery != "" && !disable && json.Unmarshal([]byte(s.State.Recovery), &digests) == nil {
		for i, d := range digests {
			if platform.Equal(d, recovery) {
				digests = append(digests[:i], digests[i+1:]...)
				valid = true
				break
			}
		}
	}
	if !valid {
		if _, err = r.exec(ctx, tx, "UPDATE unicore_session_details SET mfa_attempts=mfa_attempts+1 WHERE token_hash=?", hash); err != nil {
			return err
		}
		if err = tx.Commit(); err != nil {
			return err
		}
		return platform.ErrMFAInvalid
	}
	if disable {
		if _, err = r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET totp_secret='',recovery_digests='',last_step=-1,setup_secret='',setup_session='',setup_expires=0 WHERE user_id=?", s.User.ID); err != nil {
			return err
		}
		if err = r.revokeOthers(ctx, tx, s.User.ID, hash); err != nil {
			return err
		}
	} else {
		if step < 0 {
			step = s.State.LastStep
		}
		payload := s.State.Recovery
		if recovery != "" {
			raw, _ := json.Marshal(digests)
			payload = string(raw)
		}
		if _, err = r.exec(ctx, tx, "UPDATE unicore_personal_accounts SET last_step=?,recovery_digests=? WHERE user_id=?", step, payload, s.User.ID); err != nil {
			return err
		}
	}
	if _, err = r.exec(ctx, tx, "UPDATE unicore_session_details SET mfa_verified=1,mfa_attempts=0 WHERE token_hash=?", hash); err != nil {
		return err
	}
	action := "auth.mfa.verified"
	if disable {
		action = "account.totp.disabled"
	}
	if err = r.audit(ctx, tx, s.User.ID, action); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) LoginDevices(ctx context.Context, hash string) (contracts.LoginDevices, error) {
	result := contracts.LoginDevices{Items: []contracts.LoginDevice{}}
	s, err := r.PersonalSession(ctx, hash)
	if err != nil {
		return result, err
	}
	if err = fullFactor(s); err != nil {
		return result, err
	}
	verifiedFilter := ""
	if s.State.Secret != "" {
		verifiedFilter = " AND COALESCE(d.mfa_verified,0)=1"
	}
	rows, err := r.rows(ctx, r.Store.DB, "SELECT s.token_hash,s.expires_at,COALESCE(d.ip_address,''),COALESCE(d.user_agent,''),COALESCE(d.created_at,0),COALESCE(d.last_seen_at,0) FROM unicore_sessions s LEFT JOIN unicore_session_details d ON d.token_hash=s.token_hash WHERE s.user_id=? AND s.expires_at>?"+verifiedFilter+" ORDER BY COALESCE(d.last_seen_at,0) DESC,s.token_hash", s.User.ID, time.Now().Unix())
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var device contracts.LoginDevice
		if err = rows.Scan(&device.ID, &device.ExpiresAt, &device.IpAddress, &device.UserAgent, &device.CreatedAt, &device.LastSeenAt); err != nil {
			return result, err
		}
		device.Current = platform.Equal(device.ID, hash)
		result.Items = append(result.Items, device)
	}
	return result, rows.Err()
}
func (r *Repository) RevokeDevice(ctx context.Context, hash, target string, others bool) error {
	tx, s, err := r.ownTransaction(ctx, hash)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = fullFactor(s); err != nil {
		return err
	}
	if others {
		err = r.revokeOthers(ctx, tx, s.User.ID, hash)
	} else {
		var count int
		if err = r.row(ctx, tx, "SELECT COUNT(*) FROM unicore_sessions WHERE user_id=? AND token_hash=?", s.User.ID, target).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			return platform.ErrInput
		}
		if _, err = r.exec(ctx, tx, "DELETE FROM unicore_session_details WHERE user_id=? AND token_hash=?", s.User.ID, target); err != nil {
			return err
		}
		_, err = r.exec(ctx, tx, "DELETE FROM unicore_sessions WHERE user_id=? AND token_hash=?", s.User.ID, target)
	}
	if err != nil {
		return err
	}
	if err = r.audit(ctx, tx, s.User.ID, "account.sessions.revoked"); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) avatarRealm() string {
	return "avatar"
}

// UserAvatar uses the fixed repository realm, including when both realms share an ID.
func (r *Repository) UserAvatar(ctx context.Context, userID string) (string, error) {
	var fileID string
	err := r.Store.Row(ctx, r.Store.DB, "SELECT file_id FROM unicore_account_avatars WHERE user_id=? AND creator_realm=?", userID, r.avatarRealm()).Scan(&fileID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return fileID, err
}
