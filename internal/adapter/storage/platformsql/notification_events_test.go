// Author: yunnuo <ymz@ebox.vip>
package platformsql

import (
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/secret"
	"github.com/yunnuo/unicore/internal/settings"
	"testing"
	"time"
)

func exerciseNotificationEvents(t *testing.T, ctx context.Context, store *sqlstore.Store, admin contracts.User) {
	t.Helper()
	key, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	admins := &Repository{Store: store, Administrators: true, NotificationSecrets: key}
	members := &Repository{Store: store, NotificationSecrets: key}
	config := &settings.Service{Store: store, Secrets: key, Profile: "web-platform", NotificationWriter: admins}
	c, err := config.Notifications(ctx)
	if err != nil {
		t.Fatal(err)
	}
	c.Enabled = true
	c.Provider = "webhook"
	c.ChannelEnabled = true
	c.WebhookUrl = "https://notify.example.test/hook"
	c.SigningSecret = "synthetic"
	if _, err = config.SaveNotifications(ctx, c, admin.ID); err != nil {
		t.Fatal(err)
	}
	member, err := platform.New(members).Create(ctx, contracts.UserCreate{Username: "notify_member", Email: "notify@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	var encrypted string
	if err = store.Row(ctx, store.DB, "SELECT payload FROM unicore_mail_jobs WHERE token_hash='' AND state='pending' ORDER BY created_at DESC,id DESC LIMIT 1").Scan(&encrypted); err != nil {
		t.Fatal(err)
	}
	plain, err := key.Open(encrypted)
	var message struct{ Channel, Event string }
	if err != nil || json.Unmarshal([]byte(plain), &message) != nil || message.Channel != "webhook" || message.Event != "user_created" {
		t.Fatalf("event payload %v %v", message, err)
	}
	// Configuration and credential changes must reject a non-administrator.
	if _, err = config.SaveNotifications(ctx, c, member.ID); err == nil {
		t.Fatal("ordinary user wrote notification settings")
	}
	jobs, err := members.MailJobs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	before := len(jobs.Items)
	if _, err = members.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: rolePtr("user"), Status: "disabled"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	jobs, err = members.MailJobs(ctx)
	if err != nil || len(jobs.Items) != before+1 {
		t.Fatal("status event not atomic", err)
	}
	now := int(time.Now().Unix())
	job, err := members.ClaimMail(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	if job.ID != "" {
		if err = members.FinishMail(ctx, job, false, now); err != nil {
			t.Fatal(err)
		}
	}
	c.Enabled = false
	c.WecomKey = ""
	c.WebhookUrl = ""
	c.SigningSecret = ""
	if _, err = config.SaveNotifications(ctx, c, admin.ID); err != nil {
		t.Fatal(err)
	}
}
