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

const columns = "id,content,content_html,format,type,note,status,publish_at,created_by,updated_by,created_at,updated_at,deleted_at,version"

type scanner interface{ Scan(...any) error }

func scan(row scanner) (a domain.Announcement, err error) {
	err = row.Scan(&a.ID, &a.Content, &a.ContentHTML, &a.Format, &a.Type, &a.Note, &a.Status, &a.PublishAt, &a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt, &a.Version)
	if errors.Is(err, sql.ErrNoRows) {
		err = usecase.ErrEntityNotFound
	}
	return
}
func (r *Repository) enabled(ctx context.Context, q sqlstore.Runner) (bool, error) {
	var value string
	err := r.Store.Row(ctx, q, "SELECT setting_value FROM system_settings WHERE setting_key='announcements.enabled'").Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return true, nil
	}
	return value == "true", err
}
func (r *Repository) Enabled(ctx context.Context) (bool, error) { return r.enabled(ctx, r.Store.DB) }
func (r *Repository) rows(ctx context.Context, tx *sql.Tx, where string, args []any, page, size int) ([]domain.Announcement, int, error) {
	result := []domain.Announcement{}
	var total int
	if err := r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM platform_announcements WHERE "+where, args...).Scan(&total); err != nil {
		return result, 0, err
	}
	values := append(append([]any{}, args...), size, domain.PageOffset(page, size))
	rows, err := r.Store.Rows(ctx, tx, "SELECT "+columns+" FROM platform_announcements WHERE "+where+" ORDER BY publish_at DESC,id DESC LIMIT ? OFFSET ?", values...)
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
	return result, total, rows.Err()
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
	if q.Status == "draft" {
		where += " AND status='draft'"
	} else if q.Status != "" {
		where += " AND status='published' AND publish_at"
		if q.Status == "scheduled" {
			where += ">?"
		} else {
			where += "<=?"
		}
		args = append(args, time.Now().Unix())
	}
	if q.Search != "" {
		where += " AND (LOWER(content) LIKE LOWER(?) ESCAPE '!' OR LOWER(note) LIKE LOWER(?) ESCAPE '!')"
		term := "%" + strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(q.Search) + "%"
		args = append(args, term, term)
	}
	rows, total, err := r.rows(ctx, tx, where, args, q.Page, q.PageSize)
	return rows, total, enabled, err
}
func (r *Repository) Feed(ctx context.Context, page, size, now int) ([]domain.Announcement, int, bool, error) {
	tx, err := r.Store.DB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, 0, false, err
	}
	defer tx.Rollback()
	enabled, err := r.enabled(ctx, tx)
	if err != nil || !enabled {
		return []domain.Announcement{}, 0, enabled, err
	}
	rows, total, err := r.rows(ctx, tx, "deleted_at=0 AND status='published' AND publish_at<=?", []any{now}, page, size)
	return rows, total, enabled, err
}
func (r *Repository) GetPublished(ctx context.Context, id string, now int) (domain.Announcement, error) {
	// One SQL statement prevents disabled settings and publication checks from using different snapshots.
	return scan(r.Store.Row(ctx, r.Store.DB, "SELECT "+columns+" FROM platform_announcements WHERE id=? AND deleted_at=0 AND status='published' AND publish_at<=? AND NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key='announcements.enabled' AND setting_value<>'true')", id, now))
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
		_, err = r.Store.Exec(ctx, tx, "INSERT INTO platform_announcements("+columns+") VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", a.ID, a.Content, a.ContentHTML, a.Format, a.Type, a.Note, a.Status, a.PublishAt, a.CreatedBy, a.UpdatedBy, a.CreatedAt, a.UpdatedAt, a.DeletedAt, a.Version)
	} else {
		previous, e := scan(r.Store.Row(ctx, tx, "SELECT "+columns+" FROM platform_announcements WHERE id=? AND deleted_at=0", a.ID))
		if e != nil {
			return a, e
		}
		if previous.Version != a.Version {
			return a, usecase.ErrEntityConflict
		}
		changed := []string{}
		for _, field := range []struct{ name, before, after string }{{"content", previous.Content, a.Content}, {"format", previous.Format, a.Format}, {"type", previous.Type, a.Type}, {"note", previous.Note, a.Note}, {"status", previous.Status, a.Status}, {"publish_at", strconv.Itoa(previous.PublishAt), strconv.Itoa(a.PublishAt)}} {
			if field.before != field.after {
				changed = append(changed, field.name)
			}
		}
		detail = "fields=" + strings.Join(changed, ",") + "; version=" + strconv.Itoa(a.Version) + "->" + strconv.Itoa(a.Version+1)
		result, e := r.Store.Exec(ctx, tx, "UPDATE platform_announcements SET content=?,content_html=?,format=?,type=?,note=?,status=?,publish_at=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at=0", a.Content, a.ContentHTML, a.Format, a.Type, a.Note, a.Status, a.PublishAt, actor, a.UpdatedAt, a.ID, a.Version)
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
		err = r.Store.Row(ctx, tx, "SELECT version FROM platform_announcements WHERE id=? AND deleted_at=0", item.ID).Scan(&version)
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
		result, e := r.Store.Exec(ctx, tx, "UPDATE platform_announcements SET deleted_at=?,updated_at=?,updated_by=?,version=version+1 WHERE id=? AND version=? AND deleted_at=0", now, now, actor, item.ID, item.Version)
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
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM system_settings WHERE setting_key='announcements.enabled'"); err != nil {
		return err
	}
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO system_settings(setting_key,setting_value) VALUES('announcements.enabled',?)", strconv.FormatBool(enabled)); err != nil {
		return err
	}
	if err = r.Store.Audit(audit.Target(ctx, "announcements.enabled", "enabled="+strconv.FormatBool(enabled)), tx, actor, "announcements.configured"); err != nil {
		return err
	}
	return tx.Commit()
}
