// Author: yunnuo <ymz@ebox.vip>
// Description: Cross-dialect storage migration job persistence with atomic guarded transitions.
package filesql

import (
	"context"
	"database/sql"
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"time"
)

const migrationColumns = "id,source_location_id,target_location_id,status,mode,activate_on_complete,total_count,succeeded_count,failed_count,scan_cursor,created_by,created_at,updated_at,finished_at"

func scanMigration(row scanner) (files.MigrationJobRow, error) {
	var job files.MigrationJobRow
	e := row.Scan(&job.ID, &job.SourceLocationID, &job.TargetLocationID, &job.Status, &job.Mode, &job.ActivateOnComplete, &job.TotalCount, &job.SucceededCount, &job.FailedCount, &job.ScanCursor, &job.CreatedBy, &job.CreatedAt, &job.UpdatedAt, &job.FinishedAt)
	if errors.Is(e, sql.ErrNoRows) {
		e = files.ErrNotFound
	}
	return job, e
}

func (r *Repository) CreateMigrationJob(ctx context.Context, job files.MigrationJobRow, actor string) error {
	tx, e := r.Store.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = r.Store.Exec(ctx, tx, "INSERT INTO unicore_storage_migration_jobs("+migrationColumns+") VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		job.ID, job.SourceLocationID, job.TargetLocationID, job.Status, job.Mode, job.ActivateOnComplete, job.TotalCount, job.SucceededCount, job.FailedCount, job.ScanCursor, job.CreatedBy, job.CreatedAt, job.UpdatedAt, job.FinishedAt); e != nil {
		return e
	}
	if e = r.Store.Audit(ctx, tx, actor, "storage.migration.created"); e != nil {
		return e
	}
	return tx.Commit()
}

func (r *Repository) MigrationJob(ctx context.Context, id string) (files.MigrationJobRow, error) {
	return scanMigration(r.Store.Row(ctx, r.Store.DB, "SELECT "+migrationColumns+" FROM unicore_storage_migration_jobs WHERE id=?", id))
}

func (r *Repository) ActiveMigrationJob(ctx context.Context) (files.MigrationJobRow, error) {
	row, e := scanMigration(r.Store.Row(ctx, r.Store.DB, "SELECT "+migrationColumns+" FROM unicore_storage_migration_jobs WHERE status IN ('running','paused') ORDER BY created_at DESC,id LIMIT 1"))
	if errors.Is(e, files.ErrNotFound) {
		return files.MigrationJobRow{}, nil
	}
	return row, e
}

func (r *Repository) MigrationJobs(ctx context.Context, limit int) ([]files.MigrationJobRow, error) {
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT "+migrationColumns+" FROM unicore_storage_migration_jobs ORDER BY created_at DESC,id LIMIT ?", limit)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	jobs := []files.MigrationJobRow{}
	for rows.Next() {
		job, e := scanMigration(rows)
		if e != nil {
			return nil, e
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (r *Repository) PauseRunningMigrations(ctx context.Context) error {
	_, e := r.Store.Exec(ctx, r.Store.DB, "UPDATE unicore_storage_migration_jobs SET status='paused',updated_at=? WHERE status='running'", time.Now().Unix())
	return e
}

func (r *Repository) TransitionMigrationJob(ctx context.Context, id, from, to string, finishedAt int64) (bool, error) {
	result, e := r.Store.Exec(ctx, r.Store.DB, "UPDATE unicore_storage_migration_jobs SET status=?,finished_at=?,updated_at=? WHERE id=? AND status=?", to, finishedAt, time.Now().Unix(), id, from)
	if e != nil {
		return false, e
	}
	affected, e := result.RowsAffected()
	return affected > 0, e
}

func (r *Repository) RestartMigrationJob(ctx context.Context, id string, now int64) (bool, error) {
	result, e := r.Store.Exec(ctx, r.Store.DB, "UPDATE unicore_storage_migration_jobs SET status='running',mode='retry',finished_at=0,updated_at=? WHERE id=? AND status NOT IN ('running','paused')", now, id)
	if e != nil {
		return false, e
	}
	affected, e := result.RowsAffected()
	return affected > 0, e
}

// SaveMigrationProgress never touches status: transitions own it exclusively.
func (r *Repository) SaveMigrationProgress(ctx context.Context, job files.MigrationJobRow) error {
	_, e := r.Store.Exec(ctx, r.Store.DB, "UPDATE unicore_storage_migration_jobs SET succeeded_count=?,failed_count=?,scan_cursor=?,mode=?,updated_at=? WHERE id=?", job.SucceededCount, job.FailedCount, job.ScanCursor, job.Mode, job.UpdatedAt, job.ID)
	return e
}

func (r *Repository) RecordMigrationFailure(ctx context.Context, jobID string, failure contracts.StorageMigrationFailure) error {
	upsert := "INSERT INTO unicore_storage_migration_failures(job_id,file_id,original_name,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(job_id,file_id) DO UPDATE SET original_name=?,reason=?,created_at=?"
	args := []any{jobID, failure.FileID, failure.OriginalName, failure.Reason, failure.CreatedAt, failure.OriginalName, failure.Reason, failure.CreatedAt}
	if r.Store.Dialect == "mysql" {
		upsert = "INSERT INTO unicore_storage_migration_failures(job_id,file_id,original_name,reason,created_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE original_name=?,reason=?,created_at=?"
	}
	_, e := r.Store.Exec(ctx, r.Store.DB, upsert, args...)
	return e
}

func (r *Repository) ClearMigrationFailure(ctx context.Context, jobID, fileID string) (bool, error) {
	result, e := r.Store.Exec(ctx, r.Store.DB, "DELETE FROM unicore_storage_migration_failures WHERE job_id=? AND file_id=?", jobID, fileID)
	if e != nil {
		return false, e
	}
	affected, e := result.RowsAffected()
	return affected > 0, e
}

func (r *Repository) MigrationFailures(ctx context.Context, jobID string, limit int) ([]contracts.StorageMigrationFailure, error) {
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT file_id,original_name,reason,created_at FROM unicore_storage_migration_failures WHERE job_id=? ORDER BY created_at,file_id LIMIT ?", jobID, limit)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	failures := []contracts.StorageMigrationFailure{}
	for rows.Next() {
		var f contracts.StorageMigrationFailure
		if e = rows.Scan(&f.FileID, &f.OriginalName, &f.Reason, &f.CreatedAt); e != nil {
			return nil, e
		}
		failures = append(failures, f)
	}
	return failures, rows.Err()
}

func (r *Repository) CountMigrationFailures(ctx context.Context, jobID string) (int, error) {
	var n int
	e := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_storage_migration_failures WHERE job_id=?", jobID).Scan(&n)
	return n, e
}

func (r *Repository) CountReadyForMigration(ctx context.Context, locationID string) (int, error) {
	var n int
	e := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_file_metadata WHERE location_id=? AND state='ready' AND (expires_at=0 OR expires_at>?)", locationID, time.Now().Unix()).Scan(&n)
	return n, e
}

func (r *Repository) NextMigrationBatch(ctx context.Context, locationID, afterID string, limit int) ([]files.Record, error) {
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT "+columns+" FROM unicore_file_metadata WHERE location_id=? AND state='ready' AND (expires_at=0 OR expires_at>?) AND id>? ORDER BY id LIMIT ?", locationID, time.Now().Unix(), afterID, limit)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	batch := []files.Record{}
	for rows.Next() {
		record, e := scan(rows)
		if e != nil {
			return nil, e
		}
		batch = append(batch, record)
	}
	return batch, rows.Err()
}

func (r *Repository) LocationReadyTotals(ctx context.Context, excludeLocation string) ([]contracts.StorageMigrationSummaryItem, error) {
	rows, e := r.Store.Rows(ctx, r.Store.DB, "SELECT m.location_id,l.provider,l.name,COUNT(*),COALESCE(SUM(m.size),0) FROM unicore_file_metadata m JOIN unicore_storage_locations l ON l.id=m.location_id WHERE m.state='ready' AND (m.expires_at=0 OR m.expires_at>?) AND m.location_id<>? GROUP BY m.location_id,l.provider,l.name ORDER BY m.location_id", time.Now().Unix(), excludeLocation)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	items := []contracts.StorageMigrationSummaryItem{}
	for rows.Next() {
		var item contracts.StorageMigrationSummaryItem
		var total int64
		if e = rows.Scan(&item.LocationID, &item.Provider, &item.Name, &item.FileCount, &total); e != nil {
			return nil, e
		}
		item.TotalSize = int(total)
		items = append(items, item)
	}
	return items, rows.Err()
}
