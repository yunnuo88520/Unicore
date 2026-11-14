// Author: yunnuo <ymz@ebox.vip>
// Description: Inbox ownership, stable delivery and live announcement visibility are enforced on stored message copies.
package platformsql

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/migrations/runner"
)

func TestInboxOwnershipDeliveryAndVisibility(t *testing.T) {
	ctx := context.Background()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "inbox.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: "sqlite", Profile: "web-platform"}); err != nil {
		t.Fatal(err)
	}
	r := &Repository{Store: store}
	now := time.Now().Unix()
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_platform_announcements(id,content,content_html,format,type,note,status,publish_at,created_by,updated_by,created_at,updated_at,deleted_at,version,title,notify_mode,ends_at,audience) VALUES('a','body','body','markdown','info','','published',?,'x','x',1,1,0,1,'title','silent',0,'selected')", now-1); err != nil {
		t.Fatal(err)
	}
	// The recipient relation requires a real account; the message delivery port
	// itself also supports system events without announcement relations.
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_users(id,username,email,password_hash,status,created_at,updated_at,last_login_at) VALUES('u','member','member@example.test','unused','active',1,1,0)"); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_announcement_recipients(announcement_id,user_id) VALUES('a','u')"); err != nil {
		t.Fatal(err)
	}
	if err = r.DeliverInbox(ctx, store.DB, []string{"u", "u"}, "announcement", "a", "title", "body", ""); err != nil {
		t.Fatal(err)
	}
	feed, err := r.InboxFeed(ctx, "u", 1, 20)
	if err != nil || len(feed.Items) != 1 || feed.Unread != 1 {
		t.Fatal(feed, err)
	}
	id := feed.Items[0].ID
	other, err := r.InboxRead(ctx, "other", id)
	if err != nil || len(other.Items) != 0 {
		t.Fatal(other, err)
	}
	feed, err = r.InboxFeed(ctx, "u", 1, 20)
	if err != nil || feed.Unread != 1 {
		t.Fatal(feed, err)
	}
	if _, err = r.InboxRead(ctx, "u", id); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, store.DB, "UPDATE unicore_platform_announcements SET title='updated',content='updated body'"); err != nil {
		t.Fatal(err)
	}
	if err = r.DeliverInbox(ctx, store.DB, []string{"u"}, "announcement", "a", "updated", "updated body", ""); err != nil {
		t.Fatal(err)
	}
	feed, err = r.InboxFeed(ctx, "u", 1, 20)
	if err != nil || len(feed.Items) != 1 || feed.Unread != 0 || feed.Items[0].Body != "updated body" {
		t.Fatal(feed, err)
	}
	cases := []struct {
		name, sql string
		args      []any
	}{
		{"future", "UPDATE unicore_platform_announcements SET publish_at=?", []any{now + 3600}},
		{"expired", "UPDATE unicore_platform_announcements SET ends_at=?", []any{now - 1}},
		{"archived", "UPDATE unicore_platform_announcements SET status='archived'", nil},
		{"deleted", "UPDATE unicore_platform_announcements SET deleted_at=1", nil},
		{"revoked audience", "DELETE FROM unicore_announcement_recipients", nil},
		{"disabled", "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES('announcements.enabled','false')", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tx, err := store.DB.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = store.Exec(ctx, tx, tc.sql, tc.args...); err != nil {
				t.Fatal(err)
			}
			if err = tx.Commit(); err != nil {
				t.Fatal(err)
			}
			feed, err := r.InboxFeed(ctx, "u", 1, 20)
			if err != nil || len(feed.Items) != 0 || feed.Unread != 0 {
				t.Fatal("invisible message leaked", feed, err)
			}
			// Restore the baseline for the next visibility dimension.
			for _, q := range []string{"UPDATE unicore_platform_announcements SET publish_at=1,ends_at=0,status='published',deleted_at=0", "DELETE FROM unicore_system_settings WHERE setting_key='announcements.enabled'", "DELETE FROM unicore_announcement_recipients", "INSERT INTO unicore_announcement_recipients(announcement_id,user_id) VALUES('a','u')"} {
				if _, err = store.Exec(ctx, store.DB, q); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
	if err = r.DeliverInbox(ctx, store.DB, []string{"u"}, "system", "", "system", "system body", ""); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, store.DB, "UPDATE unicore_platform_announcements SET status='archived'"); err != nil {
		t.Fatal(err)
	}
	feed, err = r.InboxReadAll(ctx, "u")
	if err != nil || len(feed.Items) != 1 || feed.Items[0].Type != "system" || feed.Unread != 0 {
		t.Fatal(feed, err)
	}
	if _, err = r.InboxFeed(ctx, "u", 100001, 20); err == nil {
		t.Fatal("unbounded page")
	}
}
