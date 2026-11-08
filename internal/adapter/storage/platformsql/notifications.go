// Author: yunnuo <ymz@ebox.vip>
// Description: Reuse mail_jobs for encrypted system events, with transactional metadata-only audit.
package platformsql

import (
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
	"strings"
	"time"
)

func (r *Repository) EnqueueNotification(ctx context.Context, encrypted, actor string, now, expires int) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Empty token_hash is not an account token and is excluded from account challenge cancellation.
	if _, err = r.exec(ctx, tx, "INSERT INTO unicore_mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')", sqlstore.ID(), "", encrypted, now, now, expires); err != nil {
		return err
	}
	if err = r.audit(ctx, tx, actor, "mail.notification.queued"); err != nil {
		return err
	}
	return tx.Commit()
}

// eventNotifications snapshots templates and recipients within the successful identity transaction.
func (r *Repository) eventNotifications(ctx context.Context, tx sqlstore.Runner, actor, action string) error {
	if r.NotificationSecrets == nil {
		return nil
	}
	m, _ := audit.From(ctx)
	kind := ""
	subject := actor
	switch action {
	case "auth.login", "auth.login.completed", "auth.oidc.login":
		kind = "login"
	case "auth.mfa.verified":
		kind = "login"
	case "account.password.changed", "auth.reset.completed":
		kind = "password_changed"
	case "account.totp.enabled":
		kind = "totp_enabled"
	case "account.totp.disabled":
		kind = "totp_disabled"
	case "account.sessions.revoked":
		kind = "sessions_revoked"
	case "account.email.changed":
		kind = "email_changed"
	case "auth.verify.completed":
		kind = "registered"
	case "users.created", "administrators.created":
		if actor == "bootstrap" {
			return nil
		}
		kind = "user_created"
		if actor == "registration" || actor == "oidc" {
			return nil
		}
		subject = strings.TrimPrefix(m.Target, r.roleID()+"/")
	case "users.updated", "administrators.updated":
		subject = strings.TrimPrefix(m.Target, r.roleID()+"/")
		if strings.Contains(m.Detail, "status=active->disabled") {
			kind = "account_disabled"
		} else if strings.Contains(m.Detail, "->active") && !strings.Contains(m.Detail, "status=active->active") {
			kind = "account_enabled"
		}
	}
	if kind == "" {
		return nil
	}
	if action == "auth.mfa.verified" {
		m.Detail = "mfa_complete"
	}
	return r.queueEvent(ctx, tx, kind, subject, m.Detail)
}
func (r *Repository) queueEvent(ctx context.Context, tx sqlstore.Runner, kind, subject, detail string) error {
	if r.NotificationSecrets == nil {
		return nil
	}
	values := settings.Defaults("web-platform")
	rows, err := r.Store.Rows(ctx, tx, "SELECT setting_key,setting_value FROM unicore_system_settings")
	if err != nil {
		return err
	}
	for rows.Next() {
		var k, v string
		if err = rows.Scan(&k, &v); err != nil {
			rows.Close()
			return err
		}
		values[k] = v
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if !settings.NotificationConfig(values).Enabled {
		return nil
	}
	for _, d := range settings.Definitions {
		if d.Sensitive && (d.Key == "mail.password" || settings.ManagedNotification(d.Key)) && values[d.Key] != "" {
			if d.Key == "mail.password" {
				values["_mail_credential_revision"] = values[d.Key]
			}
			values[d.Key], err = r.NotificationSecrets.Open(values[d.Key])
			if err != nil {
				return err
			}
		}
	}
	user := contracts.User{Username: "unknown"}
	if subject != "" {
		user, err = r.user(ctx, tx, subject)
		if err != nil {
			return err
		}
	}
	if kind == "login" {
		state, err := r.personalState(ctx, tx, subject)
		if err != nil {
			return err
		}
		// Password/email/OIDC proof is only the first step when TOTP is enabled.
		if state.Secret != "" && detail != "mfa_complete" {
			return nil
		}
	}
	if kind == "user_created" && platform.HasManagementAccess(user) {
		kind = "admin_created"
	}
	m, _ := audit.From(ctx)
	now := int(time.Now().Unix())
	messages, err := mailer.Plan(values, mailer.Event{Kind: kind, Username: user.Username, Email: user.Email, IP: m.IP, Detail: detail, Administrator: platform.HasManagementAccess(user), At: now})
	if err != nil {
		return err
	}
	for _, message := range messages {
		payload, _ := json.Marshal(message)
		encrypted := r.NotificationSecrets.Seal(string(payload))
		if len(encrypted) > 65535 {
			return settings.ErrInvalid
		}
		channel := message.Channel
		if channel == "" {
			channel = "email"
		}
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')", "notify-"+channel+"-"+sqlstore.ID(), "", encrypted, now, now, now+86400); err != nil {
			return err
		}
	}
	return nil
}

// QueueIPBan only targets administrators because an IP failure does not establish an account identity.
func (r *Repository) QueueIPBan(ctx context.Context, ip string) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	m, _ := audit.From(ctx)
	m.IP = ip
	if err = r.queueEvent(audit.With(ctx, m), tx, "ip_banned", "", "login_ip_temporarily_blocked"); err != nil {
		return err
	}
	return tx.Commit()
}

// SaveNotificationSettings serializes configuration changes and rechecks the administrator in the write transaction.
func (r *Repository) SaveNotificationSettings(ctx context.Context, values map[string]string, actor string) error {
	tx, err := r.accountTransaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = r.actor(ctx, tx, actor, "settings:write"); err != nil {
		return err
	}
	for key, value := range values {
		if !settings.ManagedNotification(key) {
			return settings.ErrInvalid
		}
		if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_system_settings WHERE setting_key=?", key); err != nil {
			return err
		}
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES(?,?)", key, value); err != nil {
			return err
		}
	}
	if err = r.Store.Audit(ctx, tx, actor, "notifications.updated"); err != nil {
		return err
	}
	return tx.Commit()
}
