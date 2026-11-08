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
	coredomain "github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/modules/notes/domain"
	"github.com/yunnuo/unicore/internal/modules/notes/usecase"
	"sort"
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

// scopeBatches keeps every SQL statement below dialect bind limits. All is
// meaningful only in the user realm; explicit scope keys cannot cross realms.
func scopeBatches(scope string, visibility usecase.NoteVisibility) [][]string {
	if visibility.All && strings.HasPrefix(scope, "user/") {
		return nil
	}
	ids := []string{scope}
	seen := map[string]bool{scope: true}
	if strings.HasPrefix(scope, "user/") {
		for _, id := range visibility.Scopes {
			if strings.HasPrefix(id, "user/") && !seen[id] {
				seen[id] = true
				ids = append(ids, id)
			}
		}
	}
	var batches [][]string
	for len(ids) > 0 {
		n := min(100, len(ids))
		batches = append(batches, ids[:n])
		ids = ids[n:]
	}
	return batches
}

func (r *Repository) List(ctx context.Context, scope string, q contracts.NoteQuery, visibility usecase.NoteVisibility) (contracts.NoteList, error) {
	result := contracts.NoteList{Items: []contracts.NoteEntry{}, Page: q.Page, PageSize: 20}
	batches := scopeBatches(scope, visibility)
	if batches == nil {
		batches = [][]string{nil}
	}
	var options *sql.TxOptions
	if r.Store.Dialect != "sqlite" {
		options = &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true}
	}
	tx, err := r.Store.DB.BeginTx(ctx, options)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	sortColumn := "updated_at"
	if q.Sort == "title" {
		sortColumn = "title COLLATE BINARY"
		if r.Store.Dialect == "postgres" {
			sortColumn = `title COLLATE "C"`
		} else if r.Store.Dialect == "mysql" {
			sortColumn = "BINARY title"
		}
	}
	direction := "DESC"
	if q.Direction == "asc" {
		direction = "ASC"
	}
	offset := coredomain.PageOffset(q.Page, result.PageSize)
	limit := offset + result.PageSize
	for _, batch := range batches {
		where := "deleted_at=0"
		args := []any{}
		if batch == nil {
			where += " AND scope_key LIKE 'user/%'"
		} else {
			where += " AND scope_key IN (?" + strings.Repeat(",?", len(batch)-1) + ")"
			for _, id := range batch {
				args = append(args, id)
			}
		}
		if q.Status != "" {
			where += " AND status=?"
			args = append(args, q.Status)
		}
		if q.Search != "" {
			where += " AND LOWER(title) LIKE LOWER(?) ESCAPE '!'"
			args = append(args, "%"+strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(q.Search)+"%")
		}
		var count int
		if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_example_notes WHERE "+where, args...).Scan(&count); err != nil {
			return result, err
		}
		result.Total += count
		args = append(args, limit)
		rows, e := r.Store.Rows(ctx, tx, "SELECT "+columns+",scope_key FROM unicore_example_notes WHERE "+where+" ORDER BY "+sortColumn+" "+direction+",id "+direction+" LIMIT ?", args...)
		if e != nil {
			return result, e
		}
		for rows.Next() {
			var owner string
			n, e := scan(withOwner{row: rows, owner: &owner})
			if e != nil {
				rows.Close()
				return result, e
			}
			n.Capabilities = contracts.NoteCapabilities{Update: owner == scope, Delete: owner == scope}
			result.Items = append(result.Items, n)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return result, e
		}
		// Keep only the global prefix needed for this page, never every note.
		sort.Slice(result.Items, func(i, j int) bool {
			a, b := result.Items[i], result.Items[j]
			if q.Sort == "title" && a.Title != b.Title {
				if q.Direction == "asc" {
					return a.Title < b.Title
				}
				return a.Title > b.Title
			}
			if q.Sort != "title" && a.UpdatedAt != b.UpdatedAt {
				if q.Direction == "asc" {
					return a.UpdatedAt < b.UpdatedAt
				}
				return a.UpdatedAt > b.UpdatedAt
			}
			if q.Direction == "asc" {
				return a.ID < b.ID
			}
			return a.ID > b.ID
		})
		if len(result.Items) > limit {
			result.Items = result.Items[:limit]
		}
	}
	if offset >= len(result.Items) {
		result.Items = []contracts.NoteEntry{}
	} else {
		result.Items = result.Items[offset:]
	}
	return result, tx.Commit()
}

type withOwner struct {
	row   scanner
	owner *string
}

func (w withOwner) Scan(args ...any) error { return w.row.Scan(append(args, w.owner)...) }
func scopeArgs(batch []string) []any {
	args := make([]any, 0, len(batch))
	for _, id := range batch {
		args = append(args, id)
	}
	return args
}

// Read resolves one note the session may read: its own scope key, one of the
// resolved data-scope keys, or any user-realm note for All. Deleted and
// out-of-scope notes are indistinguishable from missing ones.
func (r *Repository) Read(ctx context.Context, scope, id string, visibility usecase.NoteVisibility) (contracts.NoteEntry, error) {
	batches := scopeBatches(scope, visibility)
	if batches == nil {
		return scan(r.Store.Row(ctx, r.Store.DB, "SELECT "+columns+" FROM unicore_example_notes WHERE id=? AND deleted_at=0 AND scope_key LIKE 'user/%'", id))
	}
	for _, batch := range batches {
		n, err := scan(r.Store.Row(ctx, r.Store.DB, "SELECT "+columns+" FROM unicore_example_notes WHERE id=? AND deleted_at=0 AND scope_key IN (?"+strings.Repeat(",?", len(batch)-1)+")", append([]any{id}, scopeArgs(batch)...)...))
		if errors.Is(err, usecase.ErrNoteNotFound) {
			continue
		}
		return n, err
	}
	return contracts.NoteEntry{}, usecase.ErrNoteNotFound
}
func (r *Repository) Create(ctx context.Context, scope string, in contracts.NoteInput) (contracts.NoteEntry, error) {
	attachments := []string{}
	if in.AttachmentIds != nil {
		attachments = *in.AttachmentIds
	}
	entity := coredomain.NewEntity(time.Now())
	n := contracts.NoteEntry{ID: entity.ID, Title: in.Title, Body: in.Body, Status: in.Status, AttachmentIds: attachments, Version: entity.Version, CreatedAt: entity.CreatedAt, UpdatedAt: entity.UpdatedAt}
	ids, _ := json.Marshal(n.AttachmentIds)
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return n, e
	}
	defer tx.Rollback()
	if _, e = r.Store.Exec(ctx, tx, "INSERT INTO unicore_example_notes(scope_key,"+columns+") VALUES(?,?,?,?,?,?,?,?,?)", scope, n.ID, n.Title, n.Body, n.Status, string(ids), n.Version, n.CreatedAt, n.UpdatedAt); e != nil {
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
	before, e := scan(r.Store.Row(ctx, tx, "SELECT "+columns+" FROM unicore_example_notes WHERE scope_key=? AND id=? AND deleted_at=0", scope, id))
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
	result, e := r.Store.Exec(ctx, tx, "UPDATE unicore_example_notes SET title=?,body=?,status=?,attachment_ids=?,version=version+1,updated_at=? WHERE scope_key=? AND id=? AND version=? AND deleted_at=0", in.Title, in.Body, in.Status, string(ids), time.Now().Unix(), scope, id, in.Version)
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
	n, e := scan(r.Store.Row(ctx, tx, "SELECT "+columns+" FROM unicore_example_notes WHERE scope_key=? AND id=? AND deleted_at=0", scope, id))
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
	result, e := r.Store.Exec(ctx, tx, "UPDATE unicore_example_notes SET deleted_at=?,updated_at=?,version=version+1 WHERE scope_key=? AND id=? AND version=? AND deleted_at=0", time.Now().Unix(), time.Now().Unix(), scope, id, version)
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
	e := r.Store.Row(ctx, tx, "SELECT version FROM unicore_example_notes WHERE scope_key=? AND id=? AND deleted_at=0", scope, id).Scan(&version)
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
