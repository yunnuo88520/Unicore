// Author: yunnuo <ymz@ebox.vip>
// Description: Scoped SQL example with bound values, optimistic concurrency and transactionally written audit records.
package notessql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	coredomain "github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/modules/notes/domain"
	"github.com/yunnuo/unicore/internal/modules/notes/usecase"
)

// Repository persists notes under scope keys. ManageAll — set per request for
// super administrators on the management surface — widens mutations to any
// user-realm note, mirroring the files module Admin rule; reads stay
// visibility-scoped.
type Repository struct {
	Store     *sqlstore.Store
	ManageAll bool
}

// Management lists operational metadata only. The exact owner filter is
// intersected with the already resolved server-side visibility.
func (r *Repository) Management(ctx context.Context, scope, ownerID, search, status string, page int, visibility usecase.NoteVisibility) (contracts.NoteManagementList, error) {
	const size = 20
	result := contracts.NoteManagementList{Items: []contracts.NoteManagementEntry{}, Page: page, PageSize: size}
	if !coredomain.ValidPage(page, size) || len(ownerID) > 64 || (status != "" && status != "open" && status != "done") {
		return result, domain.ErrNoteInvalid
	}
	if ownerID != "" {
		target := "user/" + ownerID
		if !visibility.All && scope != target && !slices.Contains(visibility.Scopes, target) {
			return result, nil
		}
		scope, visibility = target, usecase.NoteVisibility{}
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
	batches := scopeBatches(scope, visibility)
	if batches == nil {
		batches = [][]string{nil}
	}
	offset := coredomain.PageOffset(page, size)
	limit := offset + size
	search = strings.TrimSpace(search)
	pattern := "%" + strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(search) + "%"
	const source = " FROM unicore_example_notes n LEFT JOIN unicore_users u ON u.id=SUBSTR(n.scope_key,6) LEFT JOIN unicore_personal_accounts p ON p.user_id=u.id WHERE "
	for _, batch := range batches {
		where := "n.deleted_at=0 AND n.scope_key LIKE 'user/%'"
		args := []any{}
		if batch != nil {
			where += " AND scope_key IN (" + strings.Repeat("?,", len(batch)-1) + "?)"
			for _, key := range batch {
				args = append(args, key)
			}
		}
		if status != "" {
			where += " AND n.status=?"
			args = append(args, status)
		}
		if search != "" {
			where += " AND (LOWER(n.title) LIKE LOWER(?) ESCAPE '!' OR LOWER(u.username) LIKE LOWER(?) ESCAPE '!' OR LOWER(p.display_name) LIKE LOWER(?) ESCAPE '!')"
			args = append(args, pattern, pattern, pattern)
		}
		var count int
		if err := r.Store.Row(ctx, tx, "SELECT COUNT(*)"+source+where, args...).Scan(&count); err != nil {
			return result, err
		}
		result.Total += count
		rows, err := r.Store.Rows(ctx, tx, "SELECT n.id,n.scope_key,n.title,n.status,n.updated_at,n.version,COALESCE(NULLIF(p.display_name,''),u.username,''),COALESCE(u.username,'')"+source+where+" ORDER BY n.updated_at DESC,n.id DESC,n.scope_key DESC LIMIT ?", append(args, limit)...)
		if err != nil {
			return result, err
		}
		for rows.Next() {
			var item contracts.NoteManagementEntry
			var key string
			if err := rows.Scan(&item.ID, &key, &item.Title, &item.Status, &item.UpdatedAt, &item.Version, &item.OwnerName, &item.OwnerUsername); err != nil {
				rows.Close()
				return result, err
			}
			item.OwnerID = strings.TrimPrefix(key, "user/")
			result.Items = append(result.Items, item)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return result, err
		}
		sort.Slice(result.Items, func(i, j int) bool {
			a, b := result.Items[i], result.Items[j]
			if a.UpdatedAt != b.UpdatedAt {
				return a.UpdatedAt > b.UpdatedAt
			}
			if a.ID != b.ID {
				return a.ID > b.ID
			}
			return a.OwnerID > b.OwnerID
		})
		result.Items = result.Items[:min(len(result.Items), limit)]
	}
	result.Items = result.Items[min(offset, len(result.Items)):]
	return result, tx.Commit()
}

func (r *Repository) ReadManaged(ctx context.Context, owner, id string) (contracts.ManagedNoteDetail, error) {
	var note contracts.ManagedNoteDetail
	if !validManagedKey(owner, id) {
		return note, domain.ErrNoteInvalid
	}
	err := r.Store.Row(ctx, r.Store.DB, "SELECT title,body,status,version FROM unicore_example_notes WHERE scope_key=? AND id=? AND deleted_at=0", "user/"+owner, id).Scan(&note.Title, &note.Body, &note.Status, &note.Version)
	if errors.Is(err, sql.ErrNoRows) {
		err = usecase.ErrNoteNotFound
	}
	return note, err
}

func (r *Repository) EditManaged(ctx context.Context, actor, owner, id string, in contracts.ManagedNoteEditInput, authorize func(*sql.Tx) error) error {
	in.Title = strings.TrimSpace(in.Title)
	if err := domain.ValidateNote(in.Title, in.Body, "open", nil); err != nil {
		return err
	}
	return r.mutateManaged(ctx, actor, owner, id, in.Version, "notes.management.edited", "fields=title,body", authorize, func(tx *sql.Tx, scope string) error {
		res, err := r.Store.Exec(ctx, tx, "UPDATE unicore_example_notes SET title=?,body=?,updated_at=?,version=version+1 WHERE scope_key=? AND id=? AND version=? AND deleted_at=0", in.Title, in.Body, time.Now().Unix(), scope, id, in.Version)
		return r.checkMutation(ctx, tx, scope, id, res, err)
	})
}

func (r *Repository) UpdateManagedStatus(ctx context.Context, actor, owner, id string, in contracts.NoteManagementStatusInput, authorize func(*sql.Tx) error) error {
	if in.Status != "open" && in.Status != "done" {
		return domain.ErrNoteInvalid
	}
	return r.mutateManaged(ctx, actor, owner, id, in.Version, "notes.management.status_changed", "status="+in.Status, authorize, func(tx *sql.Tx, scope string) error {
		res, err := r.Store.Exec(ctx, tx, "UPDATE unicore_example_notes SET status=?,updated_at=?,version=version+1 WHERE scope_key=? AND id=? AND version=? AND deleted_at=0", in.Status, time.Now().Unix(), scope, id, in.Version)
		return r.checkMutation(ctx, tx, scope, id, res, err)
	})
}

func (r *Repository) DeleteManaged(ctx context.Context, actor, owner, id string, version int, authorize func(*sql.Tx) error) error {
	return r.mutateManaged(ctx, actor, owner, id, version, "notes.management.deleted", "soft_deleted", authorize, func(tx *sql.Tx, scope string) error {
		return r.softDelete(ctx, tx, scope, id, version)
	})
}

func (r *Repository) mutateManaged(ctx context.Context, actor, owner, id string, version int, action, detail string, authorize func(*sql.Tx) error, write func(*sql.Tx, string) error) error {
	if !validManagedKey(owner, id) || version < 1 {
		return domain.ErrNoteInvalid
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	if err = authorize(tx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return usecase.ErrNoteNotFound
		}
		return err
	}
	scope := "user/" + owner
	if err := write(tx, scope); err != nil {
		return err
	}
	if err := r.Store.Audit(noteAudit(ctx, scope, id, detail+"; version="+strconv.Itoa(version)), tx, actor, action); err != nil {
		return err
	}
	return tx.Commit()
}

func validManagedKey(owner, id string) bool {
	return owner != "" && len(owner) <= 64 && id != "" && len(id) <= 64
}

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
			n.Capabilities = contracts.NoteCapabilities{Update: owner == scope || r.ManageAll, Delete: owner == scope || r.ManageAll}
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

// manageTarget resolves the scope key a mutation applies to: the session's own
// key, or — for ManageAll sessions — the owner key of any user-realm note.
func (r *Repository) manageTarget(ctx context.Context, tx *sql.Tx, scope, id string) (string, error) {
	if !r.ManageAll {
		return scope, nil
	}
	var owner string
	if e := r.Store.Row(ctx, tx, "SELECT scope_key FROM unicore_example_notes WHERE id=? AND deleted_at=0 AND scope_key LIKE 'user/%'", id).Scan(&owner); e != nil {
		if errors.Is(e, sql.ErrNoRows) {
			return "", usecase.ErrNoteNotFound
		}
		return "", e
	}
	return owner, nil
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
	target, e := r.manageTarget(ctx, tx, scope, id)
	if e != nil {
		return contracts.NoteEntry{}, e
	}
	before, e := scan(r.Store.Row(ctx, tx, "SELECT "+columns+" FROM unicore_example_notes WHERE scope_key=? AND id=? AND deleted_at=0", target, id))
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
	result, e := r.Store.Exec(ctx, tx, "UPDATE unicore_example_notes SET title=?,body=?,status=?,attachment_ids=?,version=version+1,updated_at=? WHERE scope_key=? AND id=? AND version=? AND deleted_at=0", in.Title, in.Body, in.Status, string(ids), time.Now().Unix(), target, id, in.Version)
	if e != nil {
		return contracts.NoteEntry{}, e
	}
	count, e := result.RowsAffected()
	if e != nil {
		return contracts.NoteEntry{}, e
	}
	if count == 0 {
		return contracts.NoteEntry{}, r.missing(ctx, tx, target, id)
	}
	n, e := scan(r.Store.Row(ctx, tx, "SELECT "+columns+" FROM unicore_example_notes WHERE scope_key=? AND id=? AND deleted_at=0", target, id))
	if e != nil {
		return n, e
	}
	if e = r.Store.Audit(noteAudit(ctx, target, id, "fields="+strings.Join(changed, ",")+"; version="+strconv.Itoa(in.Version)+"->"+strconv.Itoa(n.Version)), tx, target, "notes.updated"); e != nil {
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
	target, e := r.manageTarget(ctx, tx, scope, id)
	if e != nil {
		return e
	}
	if e := r.softDelete(ctx, tx, target, id, version); e != nil {
		return e
	}
	if e = r.Store.Audit(noteAudit(ctx, target, id, "soft_deleted; version="+strconv.Itoa(version)+"->"+strconv.Itoa(version+1)), tx, target, "notes.deleted"); e != nil {
		return e
	}
	return tx.Commit()
}

func (r *Repository) softDelete(ctx context.Context, tx *sql.Tx, scope, id string, version int) error {
	now := time.Now().Unix()
	res, err := r.Store.Exec(ctx, tx, "UPDATE unicore_example_notes SET deleted_at=?,updated_at=?,version=version+1 WHERE scope_key=? AND id=? AND version=? AND deleted_at=0", now, now, scope, id, version)
	return r.checkMutation(ctx, tx, scope, id, res, err)
}

func (r *Repository) checkMutation(ctx context.Context, tx *sql.Tx, scope, id string, result sql.Result, err error) error {
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err == nil && count == 0 {
		return r.missing(ctx, tx, scope, id)
	}
	return err
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
