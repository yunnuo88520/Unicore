// Author: yunnuo <ymz@ebox.vip>
// Description: Cross-dialect platform file metadata and durable cleanup transactions.
package filesql

import (
	"context"
	"database/sql"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"strings"
	"time"
)

type Repository struct{ Store *sqlstore.Store }

const locationColumns = "id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at"

func (r *Repository) Locations(ctx context.Context) ([]files.Location, error) {
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT "+locationColumns+" FROM storage_locations ORDER BY created_at,id")
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	v := []files.Location{}
	for rows.Next() {
		var l files.Location
		if e = rows.Scan(&l.ID, &l.Name, &l.Provider, &l.Endpoint, &l.Bucket, &l.Region, &l.Prefix, &l.PathStyle, &l.Credentials, &l.Tested, &l.CreatedAt); e != nil {
			return nil, e
		}
		v = append(v, l)
	}
	return v, rows.Err()
}
func (r *Repository) SaveLocation(ctx context.Context, l files.Location, create bool, actor string) error {
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if create {
		_, e = r.Store.Exec(ctx, tx, "INSERT INTO storage_locations("+locationColumns+") VALUES(?,?,?,?,?,?,?,?,?,?,?)", l.ID, l.Name, l.Provider, l.Endpoint, l.Bucket, l.Region, l.Prefix, l.PathStyle, l.Credentials, l.Tested, l.CreatedAt)
	} else {
		_, e = r.Store.Exec(ctx, tx, "UPDATE storage_locations SET name=?,credentials=?,tested=? WHERE id=?", l.Name, l.Credentials, l.Tested, l.ID)
	}
	if e != nil {
		return e
	}
	if e = r.Store.Audit(ctx, tx, actor, "storage.location.updated"); e != nil {
		return e
	}
	return tx.Commit()
}
func (r *Repository) CountLocation(ctx context.Context, id string) (int, error) {
	var n int
	e := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM file_metadata WHERE location_id=? AND state<>'deleted'", id).Scan(&n)
	return n, e
}
func (r *Repository) RemoveLocation(ctx context.Context, id, actor string) error {
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = r.Store.Exec(ctx, tx, "DELETE FROM file_upload_sessions WHERE file_id IN (SELECT id FROM file_metadata WHERE location_id=? AND state='deleted')", id); e != nil {
		return e
	}
	if _, e = r.Store.Exec(ctx, tx, "DELETE FROM file_metadata WHERE location_id=? AND state='deleted'", id); e != nil {
		return e
	}
	_, e = r.Store.Exec(ctx, tx, "DELETE FROM storage_locations WHERE id=?", id)
	if e != nil {
		return e
	}
	if e = r.Store.Audit(ctx, tx, actor, "storage.location.deleted"); e != nil {
		return e
	}
	return tx.Commit()
}

const columns = "id,original_name,storage_type,location_id,mime_type,size,creator_id,creator_realm,created_at,expires_at,state,file_key,staging_key,etag,purpose,upload_expires_at,cleanup_at"

type scanner interface{ Scan(...any) error }

func scan(row scanner) (f files.Record, e error) {
	e = row.Scan(&f.FileID, &f.OriginalName, &f.StorageType, &f.LocationID, &f.MimeType, &f.Size, &f.CreatorID, &f.CreatorRealm, &f.CreatedAt, &f.ExpiresAt, &f.State, &f.Key, &f.Staging, &f.ETag, &f.Purpose, &f.UploadExpires, &f.CleanupAt)
	if errors.Is(e, sql.ErrNoRows) {
		e = files.ErrNotFound
	}
	return
}
func (r *Repository) Get(ctx context.Context, id string) (files.Record, error) {
	return scan(r.Store.Row(ctx, r.Store.DB, "SELECT "+columns+" FROM file_metadata WHERE id=?", id))
}
func (r *Repository) List(ctx context.Context, a files.Actor, search string, page int) (contracts.FileList, error) {
	v := contracts.FileList{Items: []contracts.FileEntry{}, Page: page, PageSize: 20}
	where := "purpose='user' AND state<>'deleted'"
	args := []any{}
	if !a.Admin {
		where += " AND creator_id=? AND creator_realm=?"
		args = append(args, a.ID, a.Realm)
	}
	if search != "" {
		where += " AND LOWER(original_name) LIKE ?"
		search = strings.ReplaceAll(strings.ReplaceAll(strings.ToLower(search), "%", ""), "_", "")
		args = append(args, "%"+search+"%")
	}
	if e := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM file_metadata WHERE "+where, args...).Scan(&v.Total); e != nil {
		return v, e
	}
	args = append(args, 20, (page-1)*20)
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT "+columns+" FROM file_metadata WHERE "+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?", args...)
	if e != nil {
		return v, e
	}
	defer rows.Close()
	for rows.Next() {
		f, e := scan(rows)
		if e != nil {
			return v, e
		}
		v.Items = append(v.Items, f.FileEntry)
	}
	return v, rows.Err()
}
func args(f files.Record) []any {
	return []any{f.FileID, f.OriginalName, f.StorageType, f.LocationID, f.MimeType, f.Size, f.CreatorID, f.CreatorRealm, f.CreatedAt, f.ExpiresAt, f.State, f.Key, f.Staging, f.ETag, f.Purpose, f.UploadExpires, f.CleanupAt}
}
func (r *Repository) jobs(ctx context.Context, tx *sql.Tx, jobs []files.Job) error {
	for _, j := range jobs {
		if _, e := r.Store.Exec(ctx, tx, "INSERT INTO file_cleanup_jobs(id,location_id,file_key,due_at,attempts,last_error) VALUES(?,?,?,?,0,'')", j.ID, j.LocationID, j.Key, j.Due); e != nil {
			return e
		}
	}
	return nil
}
func (r *Repository) Create(ctx context.Context, f files.Record, jobs []files.Job) error {
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = r.Store.Exec(ctx, tx, "INSERT INTO file_metadata("+columns+") VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", args(f)...); e != nil {
		return e
	}
	if e = r.jobs(ctx, tx, jobs); e != nil {
		return e
	}
	if e = r.Store.Audit(ctx, tx, f.CreatorID, "file.created"); e != nil {
		return e
	}
	return tx.Commit()
}
func (r *Repository) Change(ctx context.Context, f files.Record, jobs []files.Job, actor string) error {
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	v := args(f)
	v = append(v[1:], f.FileID)
	if _, e = r.Store.Exec(ctx, tx, "UPDATE file_metadata SET original_name=?,storage_type=?,location_id=?,mime_type=?,size=?,creator_id=?,creator_realm=?,created_at=?,expires_at=?,state=?,file_key=?,staging_key=?,etag=?,purpose=?,upload_expires_at=?,cleanup_at=? WHERE id=?", v...); e != nil {
		return e
	}
	if e = r.jobs(ctx, tx, jobs); e != nil {
		return e
	}
	if e = r.Store.Audit(ctx, tx, actor, "file.updated"); e != nil {
		return e
	}
	return tx.Commit()
}
func (r *Repository) Jobs(ctx context.Context, now int64) ([]files.Job, error) {
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT id,location_id,file_key,due_at,attempts FROM file_cleanup_jobs WHERE due_at<=? ORDER BY due_at LIMIT 25", now)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	v := []files.Job{}
	for rows.Next() {
		var j files.Job
		if e = rows.Scan(&j.ID, &j.LocationID, &j.Key, &j.Due, &j.Attempts); e != nil {
			return nil, e
		}
		v = append(v, j)
	}
	return v, rows.Err()
}
func (r *Repository) JobDone(ctx context.Context, j files.Job, ok bool) error {
	if ok {
		_, e := r.Store.Exec(ctx, r.Store.DB, "DELETE FROM file_cleanup_jobs WHERE id=?", j.ID)
		return e
	}
	_, e := r.Store.Exec(ctx, r.Store.DB, "UPDATE file_cleanup_jobs SET attempts=attempts+1,last_error='STORAGE_UNAVAILABLE',due_at=? WHERE id=?", time.Now().Add(time.Hour).Unix(), j.ID)
	return e
}
func (r *Repository) Referenced(ctx context.Context, location, key string, now int64) (bool, error) {
	var n int
	e := r.Store.Row(ctx, r.Store.DB, "SELECT (SELECT COUNT(*) FROM file_metadata WHERE location_id=? AND state<>'deleted' AND (file_key=? OR staging_key=?))+(SELECT COUNT(*) FROM file_cleanup_jobs WHERE location_id=? AND file_key=? AND due_at>?)", location, key, key, location, key, now).Scan(&n)
	return n > 0, e
}
func (r *Repository) Expired(ctx context.Context, now int64) ([]files.Record, error) {
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT "+columns+" FROM file_metadata WHERE state<>'deleted' AND ((state<>'ready' AND cleanup_at<=?) OR (expires_at>0 AND expires_at<=?)) LIMIT 25", now, now)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	v := []files.Record{}
	for rows.Next() {
		f, e := scan(rows)
		if e != nil {
			return nil, e
		}
		v = append(v, f)
	}
	return v, rows.Err()
}
func (r *Repository) BrandKeys(ctx context.Context) ([]string, error) {
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT id FROM file_metadata WHERE purpose='branding' AND state='ready'")
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	v := []string{}
	for rows.Next() {
		var k string
		if e = rows.Scan(&k); e != nil {
			return nil, e
		}
		v = append(v, k)
	}
	return v, rows.Err()
}

func (r *Repository) Queue(ctx context.Context, jobs []files.Job) error {
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if e = r.jobs(ctx, tx, jobs); e != nil {
		return e
	}
	return tx.Commit()
}

func (r *Repository) BusyLocation(ctx context.Context, id string) (bool, error) {
	var n int
	e := r.Store.Row(ctx, r.Store.DB, "SELECT (SELECT COUNT(*) FROM file_metadata WHERE location_id=? AND state<>'deleted')+(SELECT COUNT(*) FROM file_cleanup_jobs WHERE location_id=?)", id, id).Scan(&n)
	return n > 0, e
}

func (r *Repository) Session(ctx context.Context, id string) (files.UploadSession, error) {
	var v files.UploadSession
	e := r.Store.Row(ctx, r.Store.DB, "SELECT file_id,upload_id,fingerprint,part_size FROM file_upload_sessions WHERE file_id=?", id).Scan(&v.FileID, &v.UploadID, &v.Fingerprint, &v.PartSize)
	if errors.Is(e, sql.ErrNoRows) {
		e = files.ErrNotFound
	}
	return v, e
}
func (r *Repository) SaveSession(ctx context.Context, v files.UploadSession, create bool) error {
	if create {
		_, e := r.Store.Exec(ctx, r.Store.DB, "INSERT INTO file_upload_sessions(file_id,upload_id,fingerprint,part_size) VALUES(?,?,?,?)", v.FileID, v.UploadID, v.Fingerprint, v.PartSize)
		return e
	}
	_, e := r.Store.Exec(ctx, r.Store.DB, "UPDATE file_upload_sessions SET upload_id=? WHERE file_id=?", v.UploadID, v.FileID)
	return e
}
