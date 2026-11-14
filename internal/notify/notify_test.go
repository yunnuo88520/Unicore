// Author: yunnuo <ymz@ebox.vip>
// Description: Registered-type governance: duplicate registration, unregistered
// rejection, transaction-path delivery and the post-commit publish convenience.
package notify

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/realtime"
)

type recordingHub struct{ published [][]string }

func (h *recordingHub) PublishMany(userIDs []string, event realtime.Event) {
	if event.Name != "inbox.new" {
		return
	}
	h.published = append(h.published, userIDs)
}

type recordingInbox struct {
	rows []string
	err  error
}

func (r *recordingInbox) DeliverInbox(_ context.Context, _ sqlstore.Runner, recipients []string, messageType, sourceID, title, body, actions string) error {
	if r.err != nil {
		return r.err
	}
	r.rows = append(r.rows, messageType+"|"+sourceID+"|"+title+"|"+body+"|"+actions+"|"+recipients[0])
	return nil
}

func newTestNotifier(t *testing.T) (*Notifier, *recordingInbox, *recordingHub) {
	t.Helper()
	registry := NewRegistry()
	for _, def := range []Definition{{Type: "announcement", TitleZh: "公告", TitleEn: "Announcement"}, {Type: "system", TitleZh: "系统", TitleEn: "System"}} {
		if err := registry.Register(def); err != nil {
			t.Fatalf("register %s: %v", def.Type, err)
		}
	}
	inbox := &recordingInbox{}
	hub := &recordingHub{}
	return &Notifier{Registry: registry, Inbox: inbox, Hub: hub}, inbox, hub
}

func TestRegistryGovernsTypes(t *testing.T) {
	registry := NewRegistry()
	if err := registry.Register(Definition{Type: "", TitleZh: "x", TitleEn: "x"}); err == nil {
		t.Fatal("empty type must be rejected")
	}
	if err := registry.Register(Definition{Type: "tasks", TitleZh: "", TitleEn: "Tasks"}); err == nil {
		t.Fatal("missing bilingual titles must be rejected")
	}
	if err := registry.Register(Definition{Type: "tasks", TitleZh: "任务", TitleEn: "Tasks"}); err != nil {
		t.Fatalf("first registration: %v", err)
	}
	if err := registry.Register(Definition{Type: "tasks", TitleZh: "任务", TitleEn: "Tasks"}); err == nil {
		t.Fatal("duplicate registration must be rejected")
	}
	if len(registry.Registered()) != 1 || registry.Registered()[0].Type != "tasks" {
		t.Fatalf("snapshot mismatch: %+v", registry.Registered())
	}
}

func TestDeliverRejectsUnregisteredTypes(t *testing.T) {
	notifier, inbox, _ := newTestNotifier(t)
	err := notifier.Deliver(context.Background(), nil, []string{"u1"}, "typo", "s1", "标题", "正文", nil)
	if !errors.Is(err, ErrUnregisteredType) {
		t.Fatalf("want ErrUnregisteredType, got %v", err)
	}
	if len(inbox.rows) != 0 {
		t.Fatal("rejected deliveries must not reach storage")
	}
	if err := notifier.Deliver(context.Background(), nil, []string{"u1"}, "system", "s1", "标题", "正文", nil); err != nil {
		t.Fatalf("registered delivery: %v", err)
	}
	if len(inbox.rows) != 1 {
		t.Fatalf("registered delivery must reach storage: %v", inbox.rows)
	}
}

func TestNotifyUsersPublishesOnlyAfterStorageSucceeds(t *testing.T) {
	notifier, inbox, hub := newTestNotifier(t)
	if err := notifier.NotifyUsers(context.Background(), nil, []string{"u1", "u2", "u1"}, "system", "", "标题", "正文", nil); err != nil {
		t.Fatalf("delivery: %v", err)
	}
	if len(hub.published) != 1 {
		t.Fatalf("one publish after success: %v", hub.published)
	}
	if len(hub.published[0]) != 3 {
		t.Fatalf("publish mirrors the caller's recipient list; storage dedupes rows: %v", hub.published[0])
	}
	inbox.err = errors.New("storage down")
	if err := notifier.NotifyUsers(context.Background(), nil, []string{"u1"}, "system", "", "标题", "正文", nil); err == nil {
		t.Fatal("storage failure must surface")
	}
	if len(hub.published) != 1 {
		t.Fatal("failed storage must not publish")
	}
}

func TestDeliverCarriesActionButtons(t *testing.T) {
	notifier, inbox, _ := newTestNotifier(t)
	first, second := "/files/build-9", "/approvals/42"
	actions := []contracts.InboxAction{{ID: "download", Label: "下载", Href: &first}, {ID: "approve", Label: "审批", Href: &second}}
	if err := notifier.Deliver(context.Background(), nil, []string{"u1"}, "system", "task-9", "构建完成", "产物已就绪", actions); err != nil {
		t.Fatalf("delivery with actions: %v", err)
	}
	if len(inbox.rows) != 1 || !strings.Contains(inbox.rows[0], `"download"`) || !strings.Contains(inbox.rows[0], "/approvals/42") {
		t.Fatalf("actions payload must reach storage: %v", inbox.rows)
	}
	// Announcement-style delivery without buttons keeps an empty payload.
	if err := notifier.Deliver(context.Background(), nil, []string{"u1"}, "announcement", "a1", "标题", "正文", nil); err != nil {
		t.Fatalf("delivery without actions: %v", err)
	}
	if strings.Contains(inbox.rows[1], "download") {
		t.Fatalf("nil actions must store an empty payload: %v", inbox.rows[1])
	}
}
