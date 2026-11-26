// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-only storage migration jobs: one active run, atomic transitions, resumable scan cursor.
package files

import (
	"context"
	"errors"

	"github.com/yunnuo/unicore/internal/contracts"
)

// migrationReason maps a per-file failure onto a stable error code.
func migrationReason(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, ErrNotFound):
		return "FILE_NOT_FOUND"
	case errors.Is(err, ErrInvalid):
		return "INVALID_INPUT"
	case errors.Is(err, ErrBusy):
		return "FILE_BUSY"
	case errors.Is(err, ErrNotReady):
		return "STORAGE_NOT_READY"
	default:
		return "STORAGE_UNAVAILABLE"
	}
}

func migrationRepo(s *Service) (MigrationJobRepository, error) {
	repo, ok := s.Repo.(MigrationJobRepository)
	if !ok {
		return nil, ErrUnavailable
	}
	return repo, nil
}

func (s *Service) CreateMigration(ctx context.Context, a Actor, input contracts.StorageMigrationCreateInput) (contracts.StorageMigrationJob, error) {
	var job contracts.StorageMigrationJob
	if !a.Admin {
		return job, ErrNotFound
	}
	if len(input.TargetLocationID) > 64 || input.SourceLocationID != nil && len(*input.SourceLocationID) > 64 {
		return job, ErrInvalid
	}
	repo, e := migrationRepo(s)
	if e != nil {
		return job, e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	target, e := s.location(ctx, input.TargetLocationID)
	if e != nil {
		return job, ErrNotFound
	}
	if !target.Tested || target.ID == "legacy-brand" {
		return job, ErrNotReady
	}
	sourceID := ""
	if input.SourceLocationID != nil {
		sourceID = *input.SourceLocationID
	}
	if sourceID == "" {
		// An omitted source drains the single leftover location, when unambiguous.
		items, e := repo.LocationReadyTotals(ctx, target.ID)
		if e != nil {
			return job, ErrUnavailable
		}
		if len(items) != 1 {
			return job, ErrInvalid
		}
		sourceID = items[0].LocationID
	}
	source, e := s.location(ctx, sourceID)
	if e != nil {
		return job, ErrNotFound
	}
	if source.ID == target.ID || source.Provider != "local" && target.Provider != "local" {
		return job, ErrInvalid
	}
	if active, e := repo.ActiveMigrationJob(ctx); e != nil {
		return job, ErrUnavailable
	} else if active.ID != "" {
		return job, ErrBusy
	}
	total, e := repo.CountReadyForMigration(ctx, source.ID)
	if e != nil {
		return job, ErrUnavailable
	}
	now := int(s.now().Unix())
	row := MigrationJobRow{StorageMigrationJob: contracts.StorageMigrationJob{
		ID: id(), SourceLocationID: source.ID, TargetLocationID: target.ID,
		Status: MigrationRunning, Mode: MigrationModeScan,
		TotalCount: total, CreatedBy: a.ID, CreatedAt: now, UpdatedAt: now,
	}}
	if e = repo.CreateMigrationJob(ctx, row, a.ID); e != nil {
		return job, ErrUnavailable
	}
	return row.StorageMigrationJob, nil
}

func (s *Service) PauseMigration(ctx context.Context, a Actor, jobID string) error {
	if !a.Admin {
		return ErrNotFound
	}
	repo, e := migrationRepo(s)
	if e != nil {
		return e
	}
	ok, e := repo.TransitionMigrationJob(ctx, jobID, MigrationRunning, MigrationPaused, 0)
	if e != nil {
		return ErrUnavailable
	}
	if !ok {
		return ErrBusy
	}
	return nil
}

func (s *Service) ResumeMigration(ctx context.Context, a Actor, jobID string) error {
	if !a.Admin {
		return ErrNotFound
	}
	repo, e := migrationRepo(s)
	if e != nil {
		return e
	}
	ok, e := repo.TransitionMigrationJob(ctx, jobID, MigrationPaused, MigrationRunning, 0)
	if e != nil {
		return ErrUnavailable
	}
	if !ok {
		return ErrBusy
	}
	return nil
}

func (s *Service) CancelMigration(ctx context.Context, a Actor, jobID string) error {
	if !a.Admin {
		return ErrNotFound
	}
	repo, e := migrationRepo(s)
	if e != nil {
		return e
	}
	now := s.now().Unix()
	for _, from := range []string{MigrationRunning, MigrationPaused} {
		ok, e := repo.TransitionMigrationJob(ctx, jobID, from, MigrationCancelled, now)
		if e != nil {
			return ErrUnavailable
		}
		if ok {
			return nil
		}
	}
	return ErrBusy
}

// RetryFailed re-runs every recorded failure of a non-active job before its
// cursor resumes; the worker switches back to scan mode once failures drain.
func (s *Service) RetryFailedMigration(ctx context.Context, a Actor, jobID string) error {
	if !a.Admin {
		return ErrNotFound
	}
	repo, e := migrationRepo(s)
	if e != nil {
		return e
	}
	if _, e = repo.MigrationJob(ctx, jobID); e != nil {
		return ErrNotFound
	}
	count, e := repo.CountMigrationFailures(ctx, jobID)
	if e != nil {
		return ErrUnavailable
	}
	if count == 0 {
		return ErrInvalid
	}
	ok, e := repo.RestartMigrationJob(ctx, jobID, s.now().Unix())
	if e != nil {
		return ErrUnavailable
	}
	if !ok {
		return ErrBusy
	}
	return nil
}

func (s *Service) MigrationSummary(ctx context.Context, a Actor) (contracts.StorageMigrationSummary, error) {
	var summary contracts.StorageMigrationSummary
	if !a.Admin {
		return summary, ErrNotFound
	}
	repo, e := migrationRepo(s)
	if e != nil {
		return summary, e
	}
	active, e := s.active(ctx)
	if e != nil {
		return summary, ErrUnavailable
	}
	items, e := repo.LocationReadyTotals(ctx, active)
	if e != nil {
		return summary, ErrUnavailable
	}
	summary.ActiveLocationID = active
	summary.Items = items
	return summary, nil
}

// CurrentMigration returns the active run with its first recorded failures.
func (s *Service) CurrentMigration(ctx context.Context, a Actor) (contracts.StorageMigrationCurrent, error) {
	var current contracts.StorageMigrationCurrent
	if !a.Admin {
		return current, ErrNotFound
	}
	repo, e := migrationRepo(s)
	if e != nil {
		return current, e
	}
	job, e := repo.ActiveMigrationJob(ctx)
	if e != nil {
		return current, ErrUnavailable
	}
	if job.ID == "" {
		return current, nil
	}
	if failures, e := repo.MigrationFailures(ctx, job.ID, 100); e != nil {
		return current, ErrUnavailable
	} else if len(failures) > 0 {
		job.Failures = &failures
	}
	current.Job = &job.StorageMigrationJob
	return current, nil
}

// MigrationJobs lists recent runs, newest first.
func (s *Service) MigrationJobs(ctx context.Context, a Actor) (contracts.StorageMigrationList, error) {
	var list contracts.StorageMigrationList
	if !a.Admin {
		return list, ErrNotFound
	}
	repo, e := migrationRepo(s)
	if e != nil {
		return list, e
	}
	rows, e := repo.MigrationJobs(ctx, 20)
	if e != nil {
		return list, ErrUnavailable
	}
	list.Items = make([]contracts.StorageMigrationJob, 0, len(rows))
	for _, row := range rows {
		list.Items = append(list.Items, row.StorageMigrationJob)
	}
	return list, nil
}
