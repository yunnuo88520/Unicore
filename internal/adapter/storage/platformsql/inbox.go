// Author: yunnuo <ymz@ebox.vip>
// Description: Per-user inbox with announcement visibility rechecked at every projection and idempotent internal delivery.
package platformsql

import (
	"context"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/platform"
)

// Announcement copies are never an independent authorization source. Revoked,
// scheduled, expired, disabled and deleted announcements disappear immediately.
const inboxVisible = "recipient_id=? AND (type<>'announcement' OR EXISTS (SELECT 1 FROM unicore_platform_announcements a WHERE a.id=unicore_inbox_messages.source_id AND a.deleted_at=0 AND a.status='published' AND a.publish_at<=? AND (a.ends_at=0 OR a.ends_at>?) AND (a.audience='all' OR EXISTS (SELECT 1 FROM unicore_announcement_recipients target WHERE target.announcement_id=a.id AND target.user_id=unicore_inbox_messages.recipient_id)) AND NOT EXISTS (SELECT 1 FROM unicore_system_settings WHERE setting_key='announcements.enabled' AND setting_value<>'true')))"

func (r *Repository) InboxFeed(ctx context.Context, userID string, page, size int) (contracts.InboxList, error) {
	result := contracts.InboxList{Items: []contracts.InboxEntry{}}
	if !domain.ValidPage(page, size) {
		return result, platform.ErrInput
	}
	now := time.Now().Unix()
	if err := r.row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_inbox_messages WHERE "+inboxVisible+" AND read_at=0", userID, now, now).Scan(&result.Unread); err != nil {
		return result, err
	}
	rows, err := r.rows(ctx, r.Store.DB, "SELECT id,type,source_id,CASE WHEN type='announcement' THEN (SELECT a.title FROM unicore_platform_announcements a WHERE a.id=source_id) ELSE title END,CASE WHEN type='announcement' THEN (SELECT a.content FROM unicore_platform_announcements a WHERE a.id=source_id) ELSE body END,created_at,read_at FROM unicore_inbox_messages WHERE "+inboxVisible+" ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", userID, now, now, size, (page-1)*size)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry contracts.InboxEntry
		if err = rows.Scan(&entry.ID, &entry.Type, &entry.SourceID, &entry.Title, &entry.Body, &entry.CreatedAt, &entry.ReadAt); err != nil {
			return result, err
		}
		result.Items = append(result.Items, entry)
	}
	return result, rows.Err()
}

func (r *Repository) InboxRead(ctx context.Context, userID, id string) (contracts.InboxList, error) {
	now := time.Now().Unix()
	if _, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_inbox_messages SET read_at=? WHERE id=? AND "+inboxVisible+" AND read_at=0", now, id, userID, now, now); err != nil {
		return contracts.InboxList{}, err
	}
	return r.InboxFeed(ctx, userID, 1, 20)
}
func (r *Repository) InboxReadAll(ctx context.Context, userID string) (contracts.InboxList, error) {
	now := time.Now().Unix()
	if _, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_inbox_messages SET read_at=? WHERE "+inboxVisible+" AND read_at=0", now, userID, now, now); err != nil {
		return contracts.InboxList{}, err
	}
	return r.InboxFeed(ctx, userID, 1, 20)
}

// DeliverInbox runs within the caller's transaction. Stable nonempty source IDs
// update existing copies, preserving read state and avoiding duplicate alerts
// when an announcement is edited; empty IDs represent independent messages.
func (r *Repository) DeliverInbox(ctx context.Context, q sqlstore.Runner, recipients []string, messageType, sourceID, title, body string) error {
	now := time.Now().Unix()
	seen := map[string]bool{}
	for _, recipient := range recipients {
		if seen[recipient] {
			continue
		}
		seen[recipient] = true
		if sourceID != "" {
			var count int
			if err := r.row(ctx, q, "SELECT COUNT(*) FROM unicore_inbox_messages WHERE recipient_id=? AND type=? AND source_id=?", recipient, messageType, sourceID).Scan(&count); err != nil {
				return err
			}
			if count > 0 {
				if _, err := r.exec(ctx, q, "UPDATE unicore_inbox_messages SET title=?,body=? WHERE recipient_id=? AND type=? AND source_id=?", title, body, recipient, messageType, sourceID); err != nil {
					return err
				}
				continue
			}
		}
		if _, err := r.exec(ctx, q, "INSERT INTO unicore_inbox_messages(id,recipient_id,type,source_id,title,body,created_at) VALUES(?,?,?,?,?,?,?)", sqlstore.ID(), recipient, messageType, sourceID, title, body, now); err != nil {
			return err
		}
	}
	return nil
}
