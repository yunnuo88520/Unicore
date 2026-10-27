// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator-only audit records without a duplicate dashboard page.
package platformsql

import (
	"context"
	"github.com/yunnuo/unicore/internal/contracts"
)

func (r *Repository) SystemLogs(ctx context.Context) (contracts.AuditLogList, error) {
	result := contracts.AuditLogList{Items: []contracts.AuditEntry{}, Page: 1, PageSize: 50}
	if err := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM audit_logs").Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT id,actor_id,action,created_at FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT 50")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry contracts.AuditEntry
		if err = rows.Scan(&entry.ID, &entry.ActorID, &entry.Action, &entry.CreatedAt); err != nil {
			return result, err
		}
		result.Items = append(result.Items, entry)
	}
	return result, rows.Err()
}
