// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-only announcement persistence, fixed predicates, transaction authorization and atomic audit.
package announcementsql

import (
	"context"
	"database/sql"
	"errors"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/usecase"
	"strconv"
	"strings"
	"time"
)

type Repository struct{ Store *sqlstore.Store }

const columns = "id,content,content_html,format,type,note,status,publish_at,created_by,updated_by,created_at,updated_at,deleted_at,version,title,notify_mode,ends_at,audience"

type scanner interface{ Scan(...any) error }

func scan(row scanner) (a domain.Announcement, err error) {
	err = row.Scan(&a.ID, &a.Content, &a.ContentHTML, &a.Format, &a.Type, &a.Note, &a.Status, &a.PublishAt, &a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt, &a.Version, &a.Title, &a.NotifyMode, &a.EndsAt, &a.Audience)
	if errors.Is(err, sql.ErrNoRows) {
		err = usecase.ErrEntityNotFound
	}
	return
}
func (r *Repository) enabled(ctx context.Context, q sqlstore.Runner) (bool, error) {
	var value string
	err := r.Store.Row(ctx, q, "SELECT setting_value FROM unicore_system_settings WHERE setting_key='announcements.enabled'").Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return true, nil
	}
	return value == "true", err
}
func (r *Repository) Enabled(ctx context.Context) (bool, error) { return r.enabled(ctx, r.Store.DB) }
func (r *Repository) rows(ctx context.Context, tx *sql.Tx, where string, args []any, page, size int) ([]domain.Announcement, int, error) {
	result := []domain.Announcement{}
	var total int
	if err := r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_platform_announcements WHERE "+where, args...).Scan(&total); err != nil {
		return result, 0, err
	}
	values := append(append([]any{}, args...), size, domain.PageOffset(page, size))
	rows, err := r.Store.Rows(ctx, tx, "SELECT "+columns+" FROM unicore_platform_announcements WHERE "+where+" ORDER BY publish_at DESC,id DESC LIMIT ? OFFSET ?", values...)
	if err != nil {
		return result, 0, err
	}
	defer rows.Close()
	for rows.Next() {
		a, e := scan(rows)
		if e != nil {
			return result, 0, e
		}
		result = append(result, a)
	}
	if err := rows.Err(); err != nil {
		return result, 0, err
	}
	rows.Close()
	for i := range result {
		result[i].RecipientIDs, err = r.recipients(ctx, tx, result[i].ID)
		if err != nil {
			return nil, 0, err
		}
	}
	return result, total, nil
}
func (r *Repository) List(ctx context.Context, q contracts.AnnouncementQuery) ([]domain.Announcement, int, bool, error) {
	tx, err := r.Store.DB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, 0, false, err
	}
	defer tx.Rollback()
	enabled, err := r.enabled(ctx, tx)
	if err != nil {
		return nil, 0, false, err
	}
	where := "deleted_at=0"
	args := []any{}
	switch q.Status {
	case "draft", "archived":
		where += " AND status=?"
		args = append(args, q.Status)
	case "scheduled":
		where += " AND status='published' AND publish_at>?"
		args = append(args, time.Now().Unix())
	case "published":
		where += " AND status='published' AND publish_at<=? AND (ends_at=0 OR ends_at>?)"
		args = append(args, time.Now().Unix(), time.Now().Unix())
	case "expired":
		where += " AND status='published' AND ends_at>0 AND ends_at<=?"
		args = append(args, time.Now().Unix())
	}

	if q.Search != "" {
		where += " AND (LOWER(title) LIKE LOWER(?) ESCAPE '!' OR LOWER(content) LIKE LOWER(?) ESCAPE '!' OR LOWER(note) LIKE LOWER(?) ESCAPE '!')"
		term := "%" + strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(q.Search) + "%"
		args = append(args, term, term, term)
	}
	rows, total, err := r.rows(ctx, tx, where, args, q.Page, q.PageSize)
	return rows, total, enabled, err
}

// Eligibility is evaluated in SQL before pagination, counts and receipts.
const visible = "deleted_at=0 AND status='published' AND publish_at<=? AND (ends_at=0 OR ends_at>?) AND (audience='all' OR EXISTS (SELECT 1 FROM unicore_announcement_recipients target WHERE target.announcement_id=unicore_platform_announcements.id AND target.user_id=?)) AND NOT EXISTS (SELECT 1 FROM unicore_system_settings WHERE setting_key='announcements.enabled' AND setting_value<>'true')"

func (r *Repository) GetPublished(ctx context.Context, id, user string, now int) (domain.Announcement, error) {
	a, err := scan(r.Store.Row(ctx, r.Store.DB, "SELECT "+columns+" FROM unicore_platform_announcements WHERE id=? AND "+visible, id, now, now, user))
	if err != nil {
		return a, err
	}
	err = r.Store.Row(ctx, r.Store.DB, "SELECT read_at FROM unicore_announcement_reads WHERE announcement_id=? AND user_id=?", id, user).Scan(&a.ReadAt)
	if errors.Is(err, sql.ErrNoRows) {
		err = nil
	}
	return a, err
}
func (r *Repository) UserFeed(ctx context.Context, user string, page, size, now int, popupOnly bool) ([]domain.Announcement, int, int, bool, error) {
	tx, err := r.Store.DB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, 0, 0, false, err
	}
	defer tx.Rollback()
	enabled, err := r.enabled(ctx, tx)
	if err != nil || !enabled {
		return []domain.Announcement{}, 0, 0, enabled, err
	}
	var total, unread int
	filtered := visible
	if popupOnly {
		filtered += " AND notify_mode='popup' AND NOT EXISTS (SELECT 1 FROM unicore_announcement_reads receipt WHERE receipt.announcement_id=unicore_platform_announcements.id AND receipt.user_id=?)"
	}
	args := []any{now, now, user}
	if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_platform_announcements WHERE "+filtered, func() []any {
		if popupOnly {
			return append(append([]any{}, args...), user)
		}
		return args
	}()...).Scan(&total); err != nil {
		return nil, 0, 0, enabled, err
	}
	unreadWhere := " AND NOT EXISTS (SELECT 1 FROM unicore_announcement_reads receipt WHERE receipt.announcement_id=unicore_platform_announcements.id AND receipt.user_id=?)"
	if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_platform_announcements WHERE "+visible+unreadWhere, append(args, user)...).Scan(&unread); err != nil {
		return nil, 0, 0, enabled, err
	}
	listArgs := []any{user, now, now, user}
	if popupOnly {
		listArgs = append(listArgs, user)
	}
	listArgs = append(listArgs, user, size, domain.PageOffset(page, size))
	rows, err := r.Store.Rows(ctx, tx, "SELECT "+columns+",COALESCE((SELECT read_at FROM unicore_announcement_reads receipt WHERE receipt.announcement_id=unicore_platform_announcements.id AND receipt.user_id=?),0) AS read_at FROM unicore_platform_announcements WHERE "+filtered+" ORDER BY CASE WHEN EXISTS (SELECT 1 FROM unicore_announcement_reads receipt WHERE receipt.announcement_id=unicore_platform_announcements.id AND receipt.user_id=?) THEN 1 ELSE 0 END,publish_at DESC,id DESC LIMIT ? OFFSET ?", listArgs...)
	if err != nil {
		return nil, 0, 0, enabled, err
	}
	defer rows.Close()
	result := []domain.Announcement{}
	for rows.Next() {
		var a domain.Announcement
		err = rows.Scan(&a.ID, &a.Content, &a.ContentHTML, &a.Format, &a.Type, &a.Note, &a.Status, &a.PublishAt, &a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt, &a.Version, &a.Title, &a.NotifyMode, &a.EndsAt, &a.Audience, &a.ReadAt)
		if err != nil {
			return nil, 0, 0, enabled, err
		}
		result = append(result, a)
	}
	return result, total, unread, enabled, rows.Err()
}
func (r *Repository) recipients(ctx context.Context, q sqlstore.Runner, id string) ([]string, error) {
	rows, err := r.Store.Rows(ctx, q, "SELECT user_id FROM unicore_announcement_recipients WHERE announcement_id=? ORDER BY user_id", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
func (r *Repository) MarkRead(ctx context.Context, id, user string, now int) error {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	var eligible int
	if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_platform_announcements WHERE id=? AND "+visible, id, now, now, user).Scan(&eligible); err != nil {
		return err
	}
	if eligible == 0 {
		return usecase.ErrEntityNotFound
	}
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_announcement_reads(announcement_id,user_id,read_at) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM unicore_announcement_reads WHERE announcement_id=? AND user_id=?)", id, user, now, id, user); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) MarkAllRead(ctx context.Context, user string, now int) error {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	_, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_announcement_reads(announcement_id,user_id,read_at) SELECT id,?,? FROM unicore_platform_announcements WHERE "+visible+" AND NOT EXISTS (SELECT 1 FROM unicore_announcement_reads receipt WHERE receipt.announcement_id=unicore_platform_announcements.id AND receipt.user_id=?)", user, now, now, now, user, user)
	if err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) ReadStatus(ctx context.Context, id, search string, page, size int) (contracts.AnnouncementReadStatus, error) {
	out := contracts.AnnouncementReadStatus{Items: []contracts.AnnouncementReader{}, Page: page, PageSize: size}
	tx, err := r.Store.DB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	a, err := scan(r.Store.Row(ctx, tx, "SELECT "+columns+" FROM unicore_platform_announcements WHERE id=? AND deleted_at=0", id))
	if err != nil {
		return out, err
	}
	term := "%" + strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(search) + "%"
	where := "(LOWER(username) LIKE LOWER(?) ESCAPE '!' OR LOWER(email) LIKE LOWER(?) ESCAPE '!')"
	if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_users WHERE "+where, term, term).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err := r.Store.Rows(ctx, tx, "SELECT id,username,email,CASE WHEN ?='all' OR EXISTS (SELECT 1 FROM unicore_announcement_recipients target WHERE target.announcement_id=? AND target.user_id=unicore_users.id) THEN 1 ELSE 0 END,COALESCE((SELECT read_at FROM unicore_announcement_reads receipt WHERE receipt.announcement_id=? AND receipt.user_id=unicore_users.id),0) FROM unicore_users WHERE "+where+" ORDER BY username,id LIMIT ? OFFSET ?", a.Audience, id, id, term, term, size, domain.PageOffset(page, size))
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var u contracts.AnnouncementReader
		var eligible int
		if err = rows.Scan(&u.ID, &u.Username, &u.Email, &eligible, &u.ReadAt); err != nil {
			return out, err
		}
		u.Eligible = eligible == 1
		out.Items = append(out.Items, u)
	}
	return out, rows.Err()
}
func (r *Repository) transaction(ctx context.Context, actor string) (*sql.Tx, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	if err = r.Store.LockInstallation(ctx, tx); err == nil {
		err = (&platformsql.Repository{Store: r.Store}).AuthorizeAdministrator(ctx, tx, actor, "announcements:write")
	}
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	return tx, nil
}
func (r *Repository) Save(ctx context.Context, a domain.Announcement, actor string, create bool) (domain.Announcement, error) {
	tx, err := r.transaction(ctx, actor)
	if err != nil {
		return a, err
	}
	defer tx.Rollback()
	action := "announcements.created"
	detail := "status=" + a.Status + "; publish_at=" + strconv.Itoa(a.PublishAt)
	if create {
		_, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_platform_announcements("+columns+") VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", a.ID, a.Content, a.ContentHTML, a.Format, a.Type, a.Note, a.Status, a.PublishAt, a.CreatedBy, a.UpdatedBy, a.CreatedAt, a.UpdatedAt, a.DeletedAt, a.Version, a.Title, a.NotifyMode, a.EndsAt, a.Audience)
	} else {
		previous, e := scan(r.Store.Row(ctx, tx, "SELECT "+columns+" FROM unicore_platform_announcements WHERE id=? AND deleted_at=0", a.ID))
		if e != nil {
			return a, e
		}
		if previous.Version != a.Version {
			return a, usecase.ErrEntityConflict
		}
		previous.RecipientIDs, err = r.recipients(ctx, tx, a.ID)
		if err != nil {
			return a, err
		}
		changed := []string{}
		for _, field := range []struct{ name, before, after string }{{"title", previous.Title, a.Title}, {"notify_mode", previous.NotifyMode, a.NotifyMode}, {"ends_at", strconv.Itoa(previous.EndsAt), strconv.Itoa(a.EndsAt)}, {"audience", previous.Audience, a.Audience}, {"recipients", strings.Join(previous.RecipientIDs, ","), strings.Join(a.RecipientIDs, ",")}, {"content", previous.Content, a.Content}, {"format", previous.Format, a.Format}, {"type", previous.Type, a.Type}, {"note", previous.Note, a.Note}, {"status", previous.Status, a.Status}, {"publish_at", strconv.Itoa(previous.PublishAt), strconv.Itoa(a.PublishAt)}} {
			if field.before != field.after {
				changed = append(changed, field.name)
			}
		}
		detail = "fields=" + strings.Join(changed, ",") + "; version=" + strconv.Itoa(a.Version) + "->" + strconv.Itoa(a.Version+1)
		result, e := r.Store.Exec(ctx, tx, "UPDATE unicore_platform_announcements SET title=?,notify_mode=?,ends_at=?,audience=?,content=?,content_html=?,format=?,type=?,note=?,status=?,publish_at=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at=0", a.Title, a.NotifyMode, a.EndsAt, a.Audience, a.Content, a.ContentHTML, a.Format, a.Type, a.Note, a.Status, a.PublishAt, actor, a.UpdatedAt, a.ID, a.Version)
		if e != nil {
			return a, e
		}
		count, e := result.RowsAffected()
		if e != nil {
			return a, e
		}
		if count != 1 {
			return a, usecase.ErrEntityConflict
		}
		a.CreatedAt = previous.CreatedAt
		a.CreatedBy = previous.CreatedBy
		a.Version++
		action = "announcements.updated"
	}
	if err != nil {
		return a, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_announcement_recipients WHERE announcement_id=?", a.ID); err != nil {
		return a, err
	}
	for _, id := range a.RecipientIDs {
		var exists int
		if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_users WHERE id=?", id).Scan(&exists); err != nil {
			return a, err
		}
		if exists != 1 {
			return a, domain.ErrAnnouncementInvalid
		}
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_announcement_recipients(announcement_id,user_id) VALUES(?,?)", a.ID, id); err != nil {
			return a, err
		}
	}
	// Published announcements land in the personal inbox of their selected
	// audience so the bell and the SSE stream carry them (audience=all stays a
	// broadcast on the announcements feed itself).
	if a.Status == "published" && a.Audience == "selected" {
		if err = (&platformsql.Repository{Store: r.Store}).DeliverInbox(ctx, tx, a.RecipientIDs, "announcement", a.ID, a.Title, a.Content); err != nil {
			return a, err
		}
	}
	if err = r.Store.Audit(audit.Target(ctx, "announcement/"+a.ID, detail), tx, actor, action); err != nil {
		return a, err
	}
	return a, tx.Commit()
}
func (r *Repository) Delete(ctx context.Context, items []contracts.AnnouncementSelection, actor string) error {
	tx, err := r.transaction(ctx, actor)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, item := range items {
		var version int
		err = r.Store.Row(ctx, tx, "SELECT version FROM unicore_platform_announcements WHERE id=? AND deleted_at=0", item.ID).Scan(&version)
		if errors.Is(err, sql.ErrNoRows) {
			return usecase.ErrEntityNotFound
		}
		if err != nil {
			return err
		}
		if version != item.Version {
			return usecase.ErrEntityConflict
		}
		now := time.Now().Unix()
		result, e := r.Store.Exec(ctx, tx, "UPDATE unicore_platform_announcements SET deleted_at=?,updated_at=?,updated_by=?,version=version+1 WHERE id=? AND version=? AND deleted_at=0", now, now, actor, item.ID, item.Version)
		if e != nil {
			return e
		}
		count, e := result.RowsAffected()
		if e != nil {
			return e
		}
		if count != 1 {
			return usecase.ErrEntityConflict
		}
		if err = r.Store.Audit(audit.Target(ctx, "announcement/"+item.ID, "soft_deleted; version="+strconv.Itoa(item.Version)+"->"+strconv.Itoa(item.Version+1)), tx, actor, "announcements.deleted"); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (r *Repository) SetEnabled(ctx context.Context, enabled bool, actor string) error {
	tx, err := r.transaction(ctx, actor)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_system_settings WHERE setting_key='announcements.enabled'"); err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES('announcements.enabled',?)", strconv.FormatBool(enabled)); err != nil {
		return err
	}
	if err = r.Store.Audit(audit.Target(ctx, "announcements.enabled", "enabled="+strconv.FormatBool(enabled)), tx, actor, "announcements.configured"); err != nil {
		return err
	}
	return tx.Commit()
}
