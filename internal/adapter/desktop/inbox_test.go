// Author: yunnuo <ymz@ebox.vip>
// Description: Native notifications persist across restart, stay local and publish only after successful delivery.
package desktop

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/notify"
)

func TestNativeInboxLifecycle(t *testing.T) {
	ctx := context.Background()
	directory := filepath.Join(t.TempDir(), "desktop")
	store, settings, err := local.Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	bridge := NewLocal(bootstrap.Core(), settings, store)
	if err = bridge.Notifications.Registry.Register(notify.Definition{Type: "report_ready", TitleZh: "报表完成", TitleEn: "Report ready"}); err != nil {
		t.Fatal(err)
	}
	events := 0
	bridge.SetInboxEventEmitter(func(event string) {
		if event != "inbox.new" {
			t.Fatal(event)
		}
		events++
	})
	link := "/notes"
	for i := 0; i < 23; i++ {
		if err = bridge.Notifications.NotifyLocal(ctx, store, "report_ready", fmt.Sprint(i), "Report ready", "Open the report", []contracts.InboxAction{{ID: "open", Label: "Open", Href: &link}}); err != nil {
			t.Fatal(err)
		}
	}
	if events != 23 {
		t.Fatal("missing native refresh events", events)
	}
	if err = bridge.Notifications.NotifyUsers(ctx, store, []string{"another-account"}, "system", "", "Foreign", "Private", nil); err != nil {
		t.Fatal(err)
	}
	if events != 23 {
		t.Fatal("foreign account refreshed local inbox")
	}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_inbox_messages(id,recipient_id,type,source_id,title,body,created_at) VALUES('old-announcement','local','announcement','','Announcement','hidden',1)"); err != nil {
		t.Fatal(err)
	}
	first := bridge.Inbox(1, 20)
	if first.Code != "OK" || first.Data.Total != 23 || first.Data.Unread != 23 || len(first.Data.Items) != 20 || (first.Data.Items[0].Actions == nil || len(*first.Data.Items[0].Actions) != 1) {
		t.Fatalf("bad native inbox: %+v", first)
	}
	id := first.Data.Items[0].ID
	if read := bridge.ReadInbox(id); read.Code != "OK" || read.Data.Unread != 22 {
		t.Fatal(read)
	}
	if second := bridge.Inbox(2, 20); second.Code != "OK" || len(second.Data.Items) != 3 {
		t.Fatal(second)
	}
	for _, q := range [][2]int{{0, 20}, {1, 51}, {100001, 20}} {
		if response := bridge.Inbox(q[0], q[1]); response.Code != "INVALID_INPUT" || response.RequestID == "" {
			t.Fatal(response)
		}
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = bridge.Notifications.Deliver(ctx, tx, []string{notify.LocalRecipient}, "report_ready", "rolled-back", "Failed report", "Should disappear", nil); err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	tx.Rollback()
	if response := bridge.Inbox(1, 20); response.Data.Total != 23 || events != 23 {
		t.Fatal("rolled-back delivery leaked", response, events)
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	store, settings, err = local.Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	bridge = NewLocal(bootstrap.Core(), settings, store)
	if response := bridge.Inbox(1, 20); response.Data.Total != 23 || response.Data.Unread != 22 {
		t.Fatal("restart lost inbox or read state", response)
	}
	if response := bridge.ReadAllInbox(); response.Code != "OK" || response.Data.Unread != 0 {
		t.Fatal(response)
	}
	if response := New(bootstrap.Core()).Inbox(1, 20); response.Code != "NOT_AVAILABLE" {
		t.Fatal(response)
	}
}
