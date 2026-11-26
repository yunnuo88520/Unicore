// Author: yunnuo <ymz@ebox.vip>
// Description: Web-platform migration worker: bounded concurrency, batch cursors, crash-safe pause recovery.
package files

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
)

const (
	migrationPollInterval = 2 * time.Second
	migrationBatchSize    = 50
	migrationConcurrency  = 3
)

type batchOutcome struct {
	fileID string
	name   string
	reason string
}

// MigrationNotice is one terminal migration outcome bound for the instance
// notification center. RecipientID is the account that created the job.
type MigrationNotice struct {
	SourceID    string
	RecipientID string
	Title       string
	Body        string
}

// MigrationNotifier delivers terminal migration outcomes. Deliveries are best
// effort: a notification failure never blocks or reverts the job transition.
type MigrationNotifier interface {
	NotifyMigration(ctx context.Context, notice MigrationNotice)
}

// MigrationNotifierFunc adapts a plain function to MigrationNotifier.
type MigrationNotifierFunc func(ctx context.Context, notice MigrationNotice)

func (fn MigrationNotifierFunc) NotifyMigration(ctx context.Context, notice MigrationNotice) { fn(ctx, notice) }

// locationLabel renders a human-readable storage location name; removed or
// unknown locations fall back to their identifier.
func (s *Service) locationLabel(ctx context.Context, id string) string {
	if l, e := s.location(ctx, id); e == nil && l.Name != "" {
		return l.Name
	}
	return id
}

// migrationOutcomeNotice composes the inbox message for a terminal job.
func (s *Service) migrationOutcomeNotice(ctx context.Context, job MigrationJobRow, status string) MigrationNotice {
	direction := s.locationLabel(ctx, job.SourceLocationID) + " → " + s.locationLabel(ctx, job.TargetLocationID)
	notice := MigrationNotice{SourceID: job.ID, RecipientID: job.CreatedBy}
	switch status {
	case MigrationCompleted:
		notice.Title = "存储迁移完成"
		if job.FailedCount > 0 {
			notice.Body = fmt.Sprintf("%s：%d 个文件迁移成功，%d 个失败，可在存储迁移页重试失败项。", direction, job.SucceededCount, job.FailedCount)
			break
		}
		notice.Body = fmt.Sprintf("%s：%d 个文件全部迁移成功。", direction, job.SucceededCount)
	case MigrationFailed:
		notice.Title = "存储迁移失败"
		notice.Body = fmt.Sprintf("%s：任务已中止，已迁移的 %d 个文件保持现状。", direction, job.SucceededCount)
	}
	return notice
}

// deliverMigrationNotice pushes a terminal outcome to the notification center.
func (s *Service) deliverMigrationNotice(ctx context.Context, job MigrationJobRow, status string) {
	if s.MigrationNotifications == nil || job.CreatedBy == "" {
		return
	}
	// The inbox never blocks the worker; clients also recover through polling.
	s.MigrationNotifications.NotifyMigration(ctx, s.migrationOutcomeNotice(ctx, job, status))
}

// StartMigrationWorker recovers interrupted runs and drains the active
// migration job until stop. Compositions that prefer their own loop can call
// RecoverMigrations once and RunMigrationStep per tick instead.
func StartMigrationWorker(s *Service, logger *slog.Logger) (stop func()) {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		RecoverMigrations(ctx, s)
		ticker := time.NewTicker(migrationPollInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				// One batch per tick keeps pause and cancel responsive; a copy
				// already started by Migrate always finishes first.
				work, finish := context.WithTimeout(ctx, 30*time.Minute)
				RunMigrationStep(work, s, logger)
				finish()
			}
		}
	}()
	return func() { cancel(); <-done }
}

// RecoverMigrations demotes running jobs to paused after a service restart, so
// an administrator consciously resumes from the persisted cursor.
func RecoverMigrations(ctx context.Context, s *Service) {
	repo, e := migrationRepo(s)
	if e != nil {
		return
	}
	if e = repo.PauseRunningMigrations(ctx); e != nil {
		slog.Warn("migration recovery unavailable", "event", "files.migration_recover_unavailable")
	}
}

// RunMigrationStep processes at most one batch of the active migration job.
func RunMigrationStep(ctx context.Context, s *Service, logger *slog.Logger) {
	s.runMigrationStep(ctx, logger)
}

func (s *Service) runMigrationStep(ctx context.Context, logger *slog.Logger) {
	repo, e := migrationRepo(s)
	if e != nil {
		return
	}
	job, e := repo.ActiveMigrationJob(ctx)
	if e != nil || job.ID == "" || job.Status != MigrationRunning {
		return
	}
	// A removed source or target fails the run instead of failing every file.
	if _, e = s.location(ctx, job.SourceLocationID); e != nil {
		s.failMigration(ctx, repo, job)
		return
	}
	target, e := s.location(ctx, job.TargetLocationID)
	if e != nil || !target.Tested {
		s.failMigration(ctx, repo, job)
		return
	}
	if job.Mode == MigrationModeRetry {
		s.runRetryBatch(ctx, repo, job, logger)
		return
	}
	s.runScanBatch(ctx, repo, job, logger)
}

func (s *Service) failMigration(ctx context.Context, repo MigrationJobRepository, job MigrationJobRow) {
	if ok, _ := repo.TransitionMigrationJob(ctx, job.ID, job.Status, MigrationFailed, s.now().Unix()); ok {
		slog.Warn("storage migration failed", "event", "files.migration_failed", "job", job.ID, "source", job.SourceLocationID, "target", job.TargetLocationID)
		s.deliverMigrationNotice(ctx, job, MigrationFailed)
	}
}

// runScanBatch migrates the next cursor window of ready source files. The run
// completes when the cursor is exhausted; recorded failures stay listed for a
// manual retry-failed instead of looping automatically.
func (s *Service) runScanBatch(ctx context.Context, repo MigrationJobRepository, job MigrationJobRow, logger *slog.Logger) {
	batch, e := repo.NextMigrationBatch(ctx, job.SourceLocationID, job.ScanCursor, migrationBatchSize)
	if e != nil {
		return
	}
	if len(batch) == 0 {
		s.finishMigration(ctx, repo, job)
		return
	}
	s.migrateBatch(ctx, repo, job, batch, logger)
}

// runRetryBatch re-processes recorded failures, oldest first. One pass without
// progress completes the run; a drained list resumes the scan cursor.
func (s *Service) runRetryBatch(ctx context.Context, repo MigrationJobRepository, job MigrationJobRow, logger *slog.Logger) {
	before, e := repo.CountMigrationFailures(ctx, job.ID)
	if e != nil {
		return
	}
	if before == 0 {
		job.Mode = MigrationModeScan
		job.UpdatedAt = int(s.now().Unix())
		_ = repo.SaveMigrationProgress(ctx, job)
		return
	}
	recorded, e := repo.MigrationFailures(ctx, job.ID, migrationBatchSize)
	if e != nil || len(recorded) == 0 {
		return
	}
	batch := make([]Record, 0, len(recorded))
	for _, failure := range recorded {
		if record, e := s.Repo.Get(ctx, failure.FileID); e == nil && record.State == "ready" {
			batch = append(batch, record)
		} else {
			// The file vanished meanwhile and can never succeed again.
			if deleted, _ := repo.ClearMigrationFailure(ctx, job.ID, failure.FileID); deleted {
				job.FailedCount--
			}
		}
	}
	s.migrateBatch(ctx, repo, job, batch, logger)
	if after, e := repo.CountMigrationFailures(ctx, job.ID); e == nil && after >= before {
		// A full retry pass without progress completes the run.
		s.finishMigration(ctx, repo, job)
	}
}

// migrateBatch copies up to batchSize files with bounded concurrency and
// persists counters, cursor and mode. Status stays owned by the guarded
// transitions, so a concurrent pause or cancel is never overwritten.
func (s *Service) migrateBatch(ctx context.Context, repo MigrationJobRepository, job MigrationJobRow, batch []Record, logger *slog.Logger) {
	results := make(chan batchOutcome, len(batch))
	sem := make(chan struct{}, migrationConcurrency)
	spawned := 0
	for _, record := range batch {
		if ctx.Err() != nil {
			break
		}
		sem <- struct{}{}
		spawned++
		go func(record Record) {
			defer func() { <-sem }()
			actor := Actor{ID: job.CreatedBy, Realm: "user", Admin: true}
			if _, err := s.Migrate(ctx, actor, record.FileID, job.TargetLocationID); err != nil {
				results <- batchOutcome{fileID: record.FileID, name: record.OriginalName, reason: migrationReason(err)}
				return
			}
			results <- batchOutcome{fileID: record.FileID}
		}(record)
	}
	succeeded, failed := 0, 0
	for i := 0; i < spawned; i++ {
		result := <-results
		if result.reason == "" {
			succeeded++
			if deleted, _ := repo.ClearMigrationFailure(ctx, job.ID, result.fileID); deleted {
				job.FailedCount--
			}
			continue
		}
		failed++
		job.FailedCount++
		_ = repo.RecordMigrationFailure(ctx, job.ID, contracts.StorageMigrationFailure{FileID: result.fileID, OriginalName: result.name, Reason: result.reason, CreatedAt: int(s.now().Unix())})
	}
	job.SucceededCount += succeeded
	if spawned > 0 && job.Mode == MigrationModeScan {
		job.ScanCursor = batch[spawned-1].FileID
	}
	job.UpdatedAt = int(s.now().Unix())
	if e := repo.SaveMigrationProgress(ctx, job); e != nil {
		logger.Warn("migration progress unavailable", "event", "files.migration_progress_unavailable", "job", job.ID)
	}
}

// finishMigration marks the run completed. The global default must already
// point at the target so new files land there during the run; no activation
// happens afterwards.
func (s *Service) finishMigration(ctx context.Context, repo MigrationJobRepository, job MigrationJobRow) {
	ok, _ := repo.TransitionMigrationJob(ctx, job.ID, MigrationRunning, MigrationCompleted, s.now().Unix())
	if !ok {
		return
	}
	s.deliverMigrationNotice(ctx, job, MigrationCompleted)
}
