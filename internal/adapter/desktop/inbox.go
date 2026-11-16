// Author: yunnuo <ymz@ebox.vip>
// Description: Native local inbox and post-commit refresh events without platform identity.
package desktop

import (
	"context"
	"errors"
	"sync"

	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/adapter/storage/inboxsql"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/notify"
	"github.com/yunnuo/unicore/internal/realtime"
)

type inboxPublisher struct {
	mu   sync.RWMutex
	emit func(string)
}

func (p *inboxPublisher) PublishMany(recipients []string, event realtime.Event) {
	for _, recipient := range recipients {
		if recipient != notify.LocalRecipient {
			continue
		}
		p.mu.RLock()
		emit := p.emit
		p.mu.RUnlock()
		if emit != nil {
			emit(event.Name)
		}
		return
	}
}

// SetInboxEventEmitter attaches the native runtime after Wails starts. Modules
// receive the notifier through BridgeDeps; refreshes are emitted after commit.
func (b *Bridge) SetInboxEventEmitter(emit func(string)) {
	b.inboxEvents.mu.Lock()
	b.inboxEvents.emit = emit
	b.inboxEvents.mu.Unlock()
}

func (b *Bridge) inboxResponse(load func() (contracts.InboxList, error)) contracts.InboxListResponse {
	requestID := presenter.RequestID()
	if b.inbox == nil {
		return contracts.InboxListResponse{Code: "NOT_AVAILABLE", Message: notAvailable(), RequestID: requestID}
	}
	data, err := load()
	if err != nil {
		code := "INTERNAL_ERROR"
		if errors.Is(err, inboxsql.ErrInvalid) {
			code = "INVALID_INPUT"
		}
		return contracts.InboxListResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, RequestID: requestID}
	}
	return contracts.InboxListResponse{Code: "OK", Data: data, RequestID: requestID}
}

// Inbox never accepts a recipient from the frontend: a native instance owns
// exactly the local inbox, including when historical account rows exist.
func (b *Bridge) Inbox(page, size int) contracts.InboxListResponse {
	return b.inboxResponse(func() (contracts.InboxList, error) {
		return b.inbox.InboxFeed(context.Background(), notify.LocalRecipient, page, size)
	})
}
func (b *Bridge) ReadInbox(id string) contracts.InboxListResponse {
	return b.inboxResponse(func() (contracts.InboxList, error) {
		return b.inbox.InboxRead(context.Background(), notify.LocalRecipient, id)
	})
}
func (b *Bridge) ReadAllInbox() contracts.InboxListResponse {
	return b.inboxResponse(func() (contracts.InboxList, error) {
		return b.inbox.InboxReadAll(context.Background(), notify.LocalRecipient)
	})
}
