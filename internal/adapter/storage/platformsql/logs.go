// Author: yunnuo <ymz@ebox.vip>
// Description: Bound audit filters, deterministic pagination and historical metadata compatibility.
package platformsql

import (
	"context"
	"github.com/yunnuo/unicore/internal/contracts"
	"strings"
)

func (r *Repository) SystemLogs(ctx context.Context, queries ...contracts.AuditLogQuery) (contracts.AuditLogList, error) {
	q := contracts.AuditLogQuery{Page: 1, PageSize: 20, Sort: "created_at", Direction: "desc"}
	if len(queries) > 0 {
		q = queries[0]
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 || q.PageSize > 10000 {
		q.PageSize = 20
	}
	result := contracts.AuditLogList{Items: []contracts.AuditEntry{}, Actions: []string{}, Page: q.Page, PageSize: q.PageSize}
	where := "1=1"
	args := []any{}
	if q.Action != "" {
		where += " AND a.action=?"
		args = append(args, q.Action)
	}
	if q.Start > 0 {
		where += " AND a.created_at>=?"
		args = append(args, q.Start)
	}
	if q.End > 0 {
		where += " AND a.created_at<?"
		args = append(args, q.End)
	}
	if q.Search != "" {
		where += " AND (LOWER(a.actor_id) LIKE LOWER(?) ESCAPE '!' OR LOWER(m.actor_name) LIKE LOWER(?) ESCAPE '!' OR LOWER(m.target) LIKE LOWER(?) ESCAPE '!' OR LOWER(m.detail) LIKE LOWER(?) ESCAPE '!' OR LOWER(m.ip_address) LIKE LOWER(?) ESCAPE '!')"
		v := "%" + strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(q.Search) + "%"
		for range 5 {
			args = append(args, v)
		}
	}
	from := " FROM audit_logs a LEFT JOIN audit_metadata m ON m.audit_id=a.id"
	if e := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*)"+from+" WHERE "+where, args...).Scan(&result.Total); e != nil {
		return result, e
	}
	sort := "a.created_at"
	if q.Sort == "id" {
		sort = "a.id"
	}
	direction := " DESC"
	if q.Direction == "asc" {
		direction = " ASC"
	}
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT a.id,a.actor_id,a.action,a.created_at,COALESCE(m.actor_name,''),COALESCE(m.realm,''),COALESCE(m.target,''),COALESCE(m.detail,''),COALESCE(m.ip_address,'')"+from+" WHERE "+where+" ORDER BY "+sort+direction+",a.id"+direction+" LIMIT ? OFFSET ?", append(args, q.PageSize, (q.Page-1)*q.PageSize)...)
	if e != nil {
		return result, e
	}
	for rows.Next() {
		var v contracts.AuditEntry
		if e = rows.Scan(&v.ID, &v.ActorID, &v.Action, &v.CreatedAt, &v.ActorName, &v.Realm, &v.Target, &v.Detail, &v.IpAddress); e != nil {
			break
		}
		result.Items = append(result.Items, v)
	}
	if e == nil {
		e = rows.Err()
	}
	rows.Close()
	if e != nil {
		return result, e
	}
	actions, e := r.Store.Rows(ctx, r.Store.DB, "SELECT DISTINCT action FROM audit_logs ORDER BY action")
	if e != nil {
		return result, e
	}
	defer actions.Close()
	for actions.Next() {
		var action string
		if e = actions.Scan(&action); e != nil {
			return result, e
		}
		result.Actions = append(result.Actions, action)
	}
	return result, actions.Err()
}
