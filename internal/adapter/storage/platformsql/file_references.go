// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-owned file references used to protect account and branding assets from deletion.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/yunnuo/unicore/internal/files"
)

var _ files.ReferenceChecker = (*Repository)(nil)

func (r *Repository) FileCreators(ctx context.Context, ids []string) (map[string]files.Creator, error) {
	result := map[string]files.Creator{}
	if len(ids) == 0 {
		return result, nil
	}
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT u.id,u.username,COALESCE(p.display_name,'') FROM unicore_users u LEFT JOIN unicore_personal_accounts p ON p.user_id=u.id WHERE u.id IN (?"+strings.Repeat(",?", len(ids)-1)+")", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var creator files.Creator
		if err := rows.Scan(&id, &creator.Username, &creator.Name); err != nil {
			return nil, err
		}
		result[id] = creator
	}
	return result, rows.Err()
}

func (r *Repository) Referenced(ctx context.Context, fileID string) (bool, error) {
	for _, query := range []struct {
		sql  string
		args []any
	}{
		{"SELECT 1 FROM unicore_account_avatars WHERE file_id=? LIMIT 1", []any{fileID}},
		{"SELECT 1 FROM unicore_system_settings WHERE setting_key IN ('branding.logo','branding.logo_dark','branding.favicon') AND setting_value=? LIMIT 1", []any{fileID}},
	} {
		var found int
		err := r.Store.Row(ctx, r.Store.DB, query.sql, query.args...).Scan(&found)
		if err == nil {
			return true, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return false, err
		}
	}
	return false, nil
}
