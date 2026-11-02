// Author: yunnuo <ymz@ebox.vip>
// Description: Server-enforced idle and administrator absolute session limits using existing device timestamps.
package platformsql

import (
	"context"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/platform"
	"strconv"
	"time"
)

func (r *Repository) securityValues(ctx context.Context, q sqlstore.Runner) (map[string]string, error) {
	rows, err := r.Store.Rows(ctx, q, "SELECT setting_key,setting_value FROM unicore_system_settings WHERE setting_key LIKE 'security.%'")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := map[string]string{}
	for rows.Next() {
		var k, v string
		if err = rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		values[k] = v
	}
	return values, rows.Err()
}
func (r *Repository) sessionPolicy(ctx context.Context, q sqlstore.Runner, s *platform.PersonalSession) error {
	values, err := r.securityValues(ctx, q)
	if err != nil {
		return err
	}
	minutes := func(key string, fallback int) int {
		n, e := strconv.Atoi(values[key])
		if e != nil || n < 1 {
			return fallback
		}
		return n
	}
	idle := minutes("security.user_idle_minutes", 1440)
	if r.Administrators {
		idle = minutes("security.admin_idle_minutes", 360)
		if s.Created > 0 {
			s.Expires = min(s.Expires, s.Created+minutes("security.admin_max_minutes", 1440)*60)
		}
	}
	now := int(time.Now().Unix())
	if s.Expires <= now || (s.LastSeen > 0 && s.LastSeen+idle*60 <= now) {
		return platform.ErrCredentials
	}
	return nil
}
