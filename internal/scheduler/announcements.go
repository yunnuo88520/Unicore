// Author: yunnuo <ymz@ebox.vip>
// Description: Invalidate live announcement feeds only when a publication or expiration boundary passes.
package scheduler

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
)

func AnnouncementRefresh(store func() *sqlstore.Store, notify func()) func(context.Context) error {
	return announcementRefresh(store, notify, time.Now)
}
func announcementRefresh(store func() *sqlstore.Store, notify func(), now func() time.Time) func(context.Context) error {
	var mu sync.Mutex
	previous := now().Unix()
	return func(ctx context.Context) error {
		mu.Lock()
		defer mu.Unlock()
		current := now().Unix()
		db := store()
		if db == nil || db.DB == nil {
			return errors.New("announcement store unavailable")
		}
		var changed int
		// Visibility itself remains query-time and authoritative. This task merely
		// prompts connected clients when an existing row crosses its time boundary.
		err := db.Row(ctx, db.DB, "SELECT COUNT(*) FROM unicore_platform_announcements WHERE deleted_at=0 AND status='published' AND ((publish_at>? AND publish_at<=?) OR (ends_at>? AND ends_at<=?)) AND NOT EXISTS (SELECT 1 FROM unicore_system_settings WHERE setting_key='announcements.enabled' AND setting_value<>'true')", previous, current, previous, current).Scan(&changed)
		if err != nil {
			return err
		}
		previous = current
		if changed > 0 && notify != nil {
			notify()
		}
		return nil
	}
}
