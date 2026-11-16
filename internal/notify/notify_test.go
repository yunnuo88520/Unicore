// Author: yunnuo <ymz@ebox.vip>
// Description: Registered-type governance: duplicate registration, unregistered
// rejection, transaction-path delivery and the post-commit publish convenience.
package notify

import (
	"context"
	"database/sql"
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

func TestDeliverValidatesActionButtons(t *testing.T) {
	notifier, inbox, _ := newTestNotifier(t)
	href := func(v string) *string { return &v }
	cases := []struct {
		name    string
		actions []contracts.InboxAction
	}{
		{"five buttons", []contracts.InboxAction{{ID: "1", Label: "一"}, {ID: "2", Label: "二"}, {ID: "3", Label: "三"}, {ID: "4", Label: "四"}, {ID: "5", Label: "五"}}},
		{"empty id", []contracts.InboxAction{{ID: " ", Label: "下载"}}},
		{"overlong id", []contracts.InboxAction{{ID: strings.Repeat("i", 65), Label: "下载"}}},
		{"empty label", []contracts.InboxAction{{ID: "download", Label: "  "}}},
		{"overlong label", []contracts.InboxAction{{ID: "download", Label: strings.Repeat("标", 33)}}},
		{"foreign scheme", []contracts.InboxAction{{ID: "download", Label: "下载", Href: href("javascript:alert(1)")}}},
		{"line break in href", []contracts.InboxAction{{ID: "download", Label: "下载", Href: href("/files/a\r\nX")}}},
		{"overlong href", []contracts.InboxAction{{ID: "download", Label: "下载", Href: href("/" + strings.Repeat("p", 512))}}},
	}
	for _, tc := range cases {
		if err := notifier.Deliver(context.Background(), nil, []string{"u1"}, "system", "s1", "标题", "正文", tc.actions); !errors.Is(err, ErrInvalidActions) {
			t.Fatalf("%s: want ErrInvalidActions, got %v", tc.name, err)
		}
	}
	if len(inbox.rows) != 0 {
		t.Fatal("rejected actions must not reach storage")
	}
	// Boundaries from the OpenAPI InboxAction schema pass: four buttons,
	// 64-character ids, 32-character labels and a site-relative href.
	long := strings.Repeat("i", 64)
	label := strings.Repeat("标", 32)
	path := "/" + strings.Repeat("p", 511)
	valid := []contracts.InboxAction{
		{ID: long, Label: label, Href: href(path)},
		{ID: "b", Label: "二"}, {ID: "c", Label: "三", Href: href("https://example.test/x")}, {ID: "d", Label: "四"},
	}
	if err := notifier.Deliver(context.Background(), nil, []string{"u1"}, "system", "s2", "标题", "正文", valid); err != nil {
		t.Fatalf("boundary actions must deliver: %v", err)
	}
	if len(inbox.rows) != 1 {
		t.Fatalf("boundary actions must reach storage: %v", inbox.rows)
	}
}

type transactingStore struct {
	committed   bool
	rolledBack  bool
	failStorage bool
	failCommit  bool
}

// Runner methods are never exercised: NotifyUsers only checks the
// BatchTransactor upgrade, and the batch runs against the runner handed to
// WithinTx.
func (s *transactingStore) ExecContext(context.Context, string, ...any) (sql.Result, error) {
	return nil, errors.New("not used")
}
func (s *transactingStore) QueryContext(context.Context, string, ...any) (*sql.Rows, error) {
	return nil, errors.New("not used")
}
func (s *transactingStore) QueryRowContext(context.Context, string, ...any) *sql.Row {
	return nil
}

func (s *transactingStore) WithinTx(_ context.Context, fn func(runner sqlstore.Runner) error) error {
	if err := fn(nil); err != nil {
		s.rolledBack = true
		return err
	}
	if s.failCommit {
		s.rolledBack = true
		return errors.New("commit failed")
	}
	s.committed = true
	return nil
}

func TestNotifyUsersBatchesAtomically(t *testing.T) {
	notifier, inbox, hub := newTestNotifier(t)
	store := &transactingStore{}
	if err := notifier.NotifyUsers(context.Background(), store, []string{"u1", "u2"}, "system", "s1", "标题", "正文", nil); err != nil {
		t.Fatalf("batched delivery: %v", err)
	}
	if !store.committed || store.rolledBack {
		t.Fatalf("successful batch must commit: %+v", store)
	}
	if len(hub.published) != 1 {
		t.Fatalf("publish once after commit: %v", hub.published)
	}
	// A storage failure inside the transaction rolls the whole batch back and
	// never publishes, so callers cannot observe a half-batch result.
	store2 := &transactingStore{failStorage: true}
	inbox.err = errors.New("storage down")
	if err := notifier.NotifyUsers(context.Background(), store2, []string{"u1"}, "system", "s2", "标题", "正文", nil); err == nil {
		t.Fatal("storage failure must surface")
	}
	if !store2.rolledBack || store2.committed {
		t.Fatalf("failed batch must roll back: %+v", store2)
	}
	if len(hub.published) != 1 {
		t.Fatal("failed batch must not publish")
	}
	// A commit failure publishes nothing either: rows never became visible.
	inbox.err = nil
	store3 := &transactingStore{failCommit: true}
	if err := notifier.NotifyUsers(context.Background(), store3, []string{"u1"}, "system", "s3", "标题", "正文", nil); err == nil {
		t.Fatal("commit failure must surface")
	}
	if len(hub.published) != 1 {
		t.Fatal("commit failure must not publish")
	}
}
