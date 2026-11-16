// Author: yunnuo <ymz@ebox.vip>
// Description: Platform inbox projection delegates to the shared persistence adapter.
package platformsql

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/storage/inboxsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func (r *Repository) inbox() *inboxsql.Repository {
	return &inboxsql.Repository{Store: r.Store, Announcements: true}
}
func (r *Repository) InboxFeed(ctx context.Context, recipient string, page, size int) (contracts.InboxList, error) {
	result, err := r.inbox().InboxFeed(ctx, recipient, page, size)
	if errors.Is(err, inboxsql.ErrInvalid) {
		err = platform.ErrInput
	}
	return result, err
}
func (r *Repository) InboxRead(ctx context.Context, recipient, id string) (contracts.InboxList, error) {
	return r.inbox().InboxRead(ctx, recipient, id)
}
func (r *Repository) InboxReadAll(ctx context.Context, recipient string) (contracts.InboxList, error) {
	return r.inbox().InboxReadAll(ctx, recipient)
}
func (r *Repository) DeliverInbox(ctx context.Context, q sqlstore.Runner, recipients []string, messageType, sourceID, title, body, actions string) error {
	return r.inbox().DeliverInbox(ctx, q, recipients, messageType, sourceID, title, body, actions)
}
