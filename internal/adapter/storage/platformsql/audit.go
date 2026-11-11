// Author: yunnuo <ymz@ebox.vip>
// Description: Snapshot the actor in the same transaction as each successful platform mutation.
package platformsql

import (
	"context"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"strings"
)

func (r *Repository) audit(ctx context.Context, tx sqlstore.Runner, actor, action string) error {
	m, _ := audit.From(ctx)
	if m.Realm == "" {
		m.Realm = "user"
		if r.Administrators || strings.HasPrefix(action, "users.") || strings.HasPrefix(action, "administrators.") {
			m.Realm = "administrator"
		}
	}
	if m.ActorName == "" {
		table := "unicore_users"
		_ = r.Store.Row(ctx, tx, "SELECT username FROM "+table+" WHERE id=?", actor).Scan(&m.ActorName)
	}
	if m.Target == "" {
		m.Target = strings.Split(action, ".")[0]
	}
	if err := r.Store.Audit(audit.With(ctx, m), tx, actor, action); err != nil {
		return err
	}
	return r.eventNotifications(audit.With(ctx, m), tx, actor, action)
}
