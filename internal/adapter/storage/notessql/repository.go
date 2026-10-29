// Author: yunnuo <ymz@ebox.vip>
// Description: Scoped SQL example with bound values, optimistic concurrency and transactionally written audit records.
package notessql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
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
type scanner interface{ Scan(...any) error }

func scan(row scanner) (n contracts.NoteEntry, err error) {
	var ids string
	var entity domain.Note
	err = row.Scan(&entity.ID, &entity.Title, &entity.Body, &entity.Status, &ids, &entity.Version, &entity.CreatedAt, &entity.UpdatedAt)
	n = contracts.NoteEntry{ID: entity.ID, Title: entity.Title, Body: entity.Body, Status: entity.Status, Version: entity.Version, CreatedAt: entity.CreatedAt, UpdatedAt: entity.UpdatedAt}
	if errors.Is(err, sql.ErrNoRows) {
		err = usecase.ErrNoteNotFound
	}
	if err == nil {
		err = json.Unmarshal([]byte(ids), &n.AttachmentIds)
	}
	return
}

const columns = "id,title,body,status,attachment_ids,version,created_at,updated_at"

func (r *Repository) List(ctx context.Context, scope string, q contracts.NoteQuery) (contracts.NoteList, error) {
	result := contracts.NoteList{Items: []contracts.NoteEntry{}, Page: q.Page, PageSize: 20}
	where := "scope_key=? AND deleted_at=0"
	args := []any{scope}
	if q.Status != "" {
		where += " AND status=?"
		args = append(args, q.Status)
	}
	if q.Search != "" {
		where += " AND LOWER(title) LIKE LOWER(?) ESCAPE '!'"
		escape := strings.NewReplacer("!", "!!", "%", "!%", "_", "!_")
		args = append(args, "%"+escape.Replace(q.Search)+"%")
	}
	if err := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM example_notes WHERE "+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	sort := "updated_at"
	if q.Sort == "title" {
		sort = "title"
	}
	direction := "DESC"
	if q.Direction == "asc" {
		direction = "ASC"
	}
	args = append(args, result.PageSize, domain.PageOffset(q.Page, result.PageSize))
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT "+columns+" FROM example_notes WHERE "+where+" ORDER BY "+sort+" "+direction+",id "+direction+" LIMIT ? OFFSET ?", args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		n, e := scan(rows)
		if e != nil {
			return result, e
		}
		result.Items = append(result.Items, n)
	}
	return result, rows.Err()
}
func (r *Repository) Create(ctx context.Context, scope string, in contracts.NoteInput) (contracts.NoteEntry, error) {
	if in.AttachmentIds == nil {
		in.AttachmentIds = []string{}
	}
	entity := domain.NewEntity(time.Now())
	n := contracts.NoteEntry{ID: entity.ID, Title: in.Title, Body: in.Body, Status: in.Status, AttachmentIds: in.AttachmentIds, Version: entity.Version, CreatedAt: entity.CreatedAt, UpdatedAt: entity.UpdatedAt}
	ids, _ := json.Marshal(n.AttachmentIds)
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return n, e
	}
	defer tx.Rollback()
	if _, e = r.Store.Exec(ctx, tx, "INSERT INTO example_notes(scope_key,"+columns+") VALUES(?,?,?,?,?,?,?,?,?)", scope, n.ID, n.Title, n.Body, n.Status, string(ids), n.Version, n.CreatedAt, n.UpdatedAt); e != nil {
		return n, e
	}
	if e = r.Store.Audit(noteAudit(ctx, scope, n.ID, "status="+n.Status+"; version=1"), tx, scope, "notes.created"); e != nil {
		return n, e
	}
	return n, tx.Commit()
}
func (r *Repository) Update(ctx context.Context, scope, id string, in contracts.NoteUpdate) (contracts.NoteEntry, error) {
	if in.AttachmentIds == nil {
		in.AttachmentIds = []string{}
	}
	ids, _ := json.Marshal(in.AttachmentIds)
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return contracts.NoteEntry{}, e
	}
	defer tx.Rollback()
	before, e := scan(r.Store.Row(ctx, tx, "SELECT "+columns+" FROM example_notes WHERE scope_key=? AND id=? AND deleted_at=0", scope, id))
	if e != nil {
		return contracts.NoteEntry{}, e
	}
	changed := []string{}
	if before.Title != in.Title {
		changed = append(changed, "title")
	}
	if before.Body != in.Body {
		changed = append(changed, "body")
	}
	if before.Status != in.Status {
		changed = append(changed, "status")
	}
	oldIDs, _ := json.Marshal(before.AttachmentIds)
	if string(oldIDs) != string(ids) {
		changed = append(changed, "attachment_ids")
	}
	result, e := r.Store.Exec(ctx, tx, "UPDATE example_notes SET title=?,body=?,status=?,attachment_ids=?,version=version+1,updated_at=? WHERE scope_key=? AND id=? AND version=? AND deleted_at=0", in.Title, in.Body, in.Status, string(ids), time.Now().Unix(), scope, id, in.Version)
	if e != nil {
		return contracts.NoteEntry{}, e
	}
	count, e := result.RowsAffected()
	if e != nil {
		return contracts.NoteEntry{}, e
	}
	if count == 0 {
		return contracts.NoteEntry{}, r.missing(ctx, tx, scope, id)
	}
	n, e := scan(r.Store.Row(ctx, tx, "SELECT "+columns+" FROM example_notes WHERE scope_key=? AND id=? AND deleted_at=0", scope, id))
	if e != nil {
		return n, e
	}
	if e = r.Store.Audit(noteAudit(ctx, scope, id, "fields="+strings.Join(changed, ",")+"; version="+strconv.Itoa(in.Version)+"->"+strconv.Itoa(n.Version)), tx, scope, "notes.updated"); e != nil {
		return n, e
	}
	return n, tx.Commit()
}
func (r *Repository) Delete(ctx context.Context, scope, id string, version int) error {
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	result, e := r.Store.Exec(ctx, tx, "UPDATE example_notes SET deleted_at=?,updated_at=?,version=version+1 WHERE scope_key=? AND id=? AND version=? AND deleted_at=0", time.Now().Unix(), time.Now().Unix(), scope, id, version)
	if e != nil {
		return e
	}
	count, e := result.RowsAffected()
	if e != nil {
		return e
	}
	if count == 0 {
		return r.missing(ctx, tx, scope, id)
	}
	if e = r.Store.Audit(noteAudit(ctx, scope, id, "soft_deleted; version="+strconv.Itoa(version)+"->"+strconv.Itoa(version+1)), tx, scope, "notes.deleted"); e != nil {
		return e
	}
	return tx.Commit()
}
func (r *Repository) missing(ctx context.Context, tx *sql.Tx, scope, id string) error {
	var version int
	e := r.Store.Row(ctx, tx, "SELECT version FROM example_notes WHERE scope_key=? AND id=? AND deleted_at=0", scope, id).Scan(&version)
	if errors.Is(e, sql.ErrNoRows) {
		return usecase.ErrNoteNotFound
	}
	if e != nil {
		return e
	}
	return usecase.ErrNoteConflict
}

// Local profiles intentionally have no platform metadata table.
func noteAudit(ctx context.Context, scope, id, detail string) context.Context {
	if scope == "local" {
		return ctx
	}
	return audit.Target(ctx, "note/"+id, detail)
}
