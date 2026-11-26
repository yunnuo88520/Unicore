// Author: yunnuo <ymz@ebox.vip>
// Description: Platform migration state machine: single active run, guarded transitions, resumable cursor, retry-failed.
package files_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
)

type migrationFailingPut struct{ blob.Store }

func (b migrationFailingPut) Put(context.Context, string, io.Reader, int64, string) (blob.Object, error) {
	return blob.Object{}, errors.New("destination unavailable")
}

func migrationLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func migrationJob(t *testing.T, s *files.Service, jobID string) files.MigrationJobRow {
	t.Helper()
	repo, ok := s.Repo.(files.MigrationJobRepository)
	if !ok {
		t.Fatal("platform repository lacks migration persistence")
	}
	job, err := repo.MigrationJob(t.Context(), jobID)
	if err != nil {
		t.Fatal(err)
	}
	return job
}

// runMigrationSteps drives the worker deterministically until the run leaves
// the running state or the step budget is exhausted.
func runMigrationSteps(t *testing.T, s *files.Service, maxSteps int) files.MigrationJobRow {
	t.Helper()
	logger := migrationLogger()
	ctx := t.Context()
	repo := s.Repo.(files.MigrationJobRepository)
	var job files.MigrationJobRow
	for step := 0; step < maxSteps; step++ {
		active, err := repo.ActiveMigrationJob(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if active.ID == "" {
			// The run reached a terminal state; report the latest job.
			jobs, err := repo.MigrationJobs(ctx, 1)
			if err != nil || len(jobs) == 0 {
				t.Fatal("migration history empty", err)
			}
			return jobs[0]
		}
		job = active
		if job.Status != files.MigrationRunning {
			return job
		}
		files.RunMigrationStep(ctx, s, logger)
	}
	return migrationJob(t, s, job.ID)
}

func TestMigrationJobLifecycleCompletes(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "vault", Name: "Vault", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	original := s.Factory
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		if l.ID == "vault" {
			return bloblocal.New(t.TempDir()), nil
		}
		return original(l, c)
	}
	payload := []byte("migrate me")
	for i := 0; i < 3; i++ {
		grant, err := s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "job.txt", MimeType: "text/plain", Size: len(payload)})
		if err != nil {
			t.Fatal(err)
		}
		if err = s.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
			t.Fatal(err)
		}
		if _, err = s.Complete(ctx, admin, grant.FileID); err != nil {
			t.Fatal(err)
		}
	}
	created, err := s.CreateMigration(ctx, admin, contracts.StorageMigrationCreateInput{SourceLocationID: ptr("local"), TargetLocationID: "vault"})
	if err != nil {
		t.Fatal(err)
	}
	if created.Status != files.MigrationRunning || created.TotalCount != 3 || created.Mode != files.MigrationModeScan {
		t.Fatal("created job", created)
	}
	// A second active run is refused.
	if _, err = s.CreateMigration(ctx, admin, contracts.StorageMigrationCreateInput{SourceLocationID: ptr("local"), TargetLocationID: "vault"}); !errors.Is(err, files.ErrBusy) {
		t.Fatal("second active job accepted", err)
	}
	job := runMigrationSteps(t, s, 5)
	if job.Status != files.MigrationCompleted || job.SucceededCount != 3 || job.FailedCount != 0 || job.FinishedAt == 0 {
		t.Fatal("completed job", job)
	}
	list, err := s.MigrationJobs(ctx, admin)
	if err != nil || len(list.Items) != 1 {
		t.Fatal("history", list, err)
	}
	// The global default is switched before migrating and stays untouched.
	locations, err := s.Locations(ctx)
	if err != nil || locations.ActiveID != "local" {
		t.Fatal("default location unchanged", locations, err)
	}
	summary, err := s.MigrationSummary(ctx, admin)
	if err != nil || summary.ActiveLocationID != "local" || len(summary.Items) != 1 || summary.Items[0].LocationID != "vault" || summary.Items[0].FileCount != 3 {
		t.Fatal("summary after drain", summary, err)
	}
	// Only a super administrator drives the state machine.
	if _, err = s.CreateMigration(ctx, files.Actor{ID: "member", Realm: "user"}, contracts.StorageMigrationCreateInput{TargetLocationID: "vault"}); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("member create", err)
	}
	if err = s.PauseMigration(ctx, files.Actor{ID: "member", Realm: "user"}, job.ID); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("member pause", err)
	}
}

func TestMigrationPauseResumeAndCancel(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "vault", Name: "Vault", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	original := s.Factory
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		if l.ID == "vault" {
			return bloblocal.New(t.TempDir()), nil
		}
		return original(l, c)
	}
	payload := []byte("pause me")
	for i := 0; i < 2; i++ {
		grant, err := s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "pause.txt", MimeType: "text/plain", Size: len(payload)})
		if err != nil {
			t.Fatal(err)
		}
		if err = s.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
			t.Fatal(err)
		}
		if _, err = s.Complete(ctx, admin, grant.FileID); err != nil {
			t.Fatal(err)
		}
	}
	created, err := s.CreateMigration(ctx, admin, contracts.StorageMigrationCreateInput{SourceLocationID: ptr("local"), TargetLocationID: "vault"})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.PauseMigration(ctx, admin, created.ID); err != nil {
		t.Fatal("pause", err)
	}
	paused := migrationJob(t, s, created.ID)
	if paused.Status != files.MigrationPaused || paused.ScanCursor != "" {
		t.Fatal("paused job", paused)
	}
	// A paused run is inert and cannot pause again.
	files.RunMigrationStep(ctx, s, migrationLogger())
	if steped := migrationJob(t, s, created.ID); steped.SucceededCount != 0 {
		t.Fatal("paused step moved files", steped)
	}
	if err = s.PauseMigration(ctx, admin, created.ID); !errors.Is(err, files.ErrBusy) {
		t.Fatal("double pause", err)
	}
	if err = s.ResumeMigration(ctx, admin, created.ID); err != nil {
		t.Fatal("resume", err)
	}
	job := runMigrationSteps(t, s, 5)
	if job.Status != files.MigrationCompleted || job.SucceededCount != 2 {
		t.Fatal("resumed job", job)
	}
	// Cancel applies to running or paused runs and is terminal.
	created2, err := s.CreateMigration(ctx, admin, contracts.StorageMigrationCreateInput{SourceLocationID: ptr("vault"), TargetLocationID: "local"})
	if err != nil {
		t.Fatal("reverse job", err)
	}
	if err = s.CancelMigration(ctx, admin, created2.ID); err != nil {
		t.Fatal("cancel", err)
	}
	cancelled := migrationJob(t, s, created2.ID)
	if cancelled.Status != files.MigrationCancelled || cancelled.FinishedAt == 0 {
		t.Fatal("cancelled job", cancelled)
	}
	if err = s.CancelMigration(ctx, admin, created2.ID); !errors.Is(err, files.ErrBusy) {
		t.Fatal("double cancel", err)
	}
	if err = s.ResumeMigration(ctx, admin, created2.ID); !errors.Is(err, files.ErrBusy) {
		t.Fatal("resume cancelled", err)
	}
}

func TestMigrationRestartRecoversToPaused(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "vault", Name: "Vault", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	payload := []byte("recover me")
	grant, err := s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "recover.txt", MimeType: "text/plain", Size: len(payload)})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Complete(ctx, admin, grant.FileID); err != nil {
		t.Fatal(err)
	}
	created, err := s.CreateMigration(ctx, admin, contracts.StorageMigrationCreateInput{SourceLocationID: ptr("local"), TargetLocationID: "vault"})
	if err != nil {
		t.Fatal(err)
	}
	// A restart demotes running work; the cursor survives for a manual resume.
	files.RecoverMigrations(ctx, s)
	recovered := migrationJob(t, s, created.ID)
	if recovered.Status != files.MigrationPaused {
		t.Fatal("recovery status", recovered)
	}
	files.RecoverMigrations(ctx, s)
	if again := migrationJob(t, s, created.ID); again.Status != files.MigrationPaused {
		t.Fatal("recovery rerun", again)
	}
	if err = s.ResumeMigration(ctx, admin, created.ID); err != nil {
		t.Fatal(err)
	}
	job := runMigrationSteps(t, s, 5)
	if job.Status != files.MigrationCompleted || job.SucceededCount != 1 {
		t.Fatal("resumed after recovery", job)
	}
}

func TestMigrationRetryFailed(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "vault", Name: "Vault", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	original := s.Factory
	failing := true
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		if l.ID == "vault" {
			destination := bloblocal.New(t.TempDir())
			if failing {
				return migrationFailingPut{Store: destination}, nil
			}
			return destination, nil
		}
		return original(l, c)
	}
	payload := []byte("retry me")
	var err error
	for i := 0; i < 2; i++ {
		var grant contracts.FileUploadGrant
		grant, err = s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "retry.txt", MimeType: "text/plain", Size: len(payload)})
		if err != nil {
			t.Fatal(err)
		}
		if err = s.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
			t.Fatal(err)
		}
		if _, err = s.Complete(ctx, admin, grant.FileID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = s.CreateMigration(ctx, admin, contracts.StorageMigrationCreateInput{SourceLocationID: ptr("local"), TargetLocationID: "vault"}); err != nil {
		t.Fatal(err)
	}
	job := runMigrationSteps(t, s, 5)
	if job.Status != files.MigrationCompleted || job.SucceededCount != 0 || job.FailedCount != 2 {
		t.Fatal("failed run", job)
	}
	failing = false
	if err = s.RetryFailedMigration(ctx, admin, job.ID); err != nil {
		t.Fatal("retry", err)
	}
	retried := runMigrationSteps(t, s, 5)
	if retried.Status != files.MigrationCompleted || retried.SucceededCount != 2 || retried.FailedCount != 0 {
		t.Fatal("retried run", retried)
	}
	// Retry without recorded failures is invalid; active runs cannot restart.
	if err = s.RetryFailedMigration(ctx, admin, job.ID); !errors.Is(err, files.ErrInvalid) {
		t.Fatal("empty retry", err)
	}
}

type migrationNoticeRecorder struct {
	mu      sync.Mutex
	notices []files.MigrationNotice
}

func (r *migrationNoticeRecorder) NotifyMigration(_ context.Context, notice files.MigrationNotice) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.notices = append(r.notices, notice)
}

func TestMigrationTerminalStatesNotifyCreator(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	recorder := &migrationNoticeRecorder{}
	s.MigrationNotifications = recorder
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "vault", Name: "Vault", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	original := s.Factory
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		if l.ID == "vault" {
			return bloblocal.New(t.TempDir()), nil
		}
		return original(l, c)
	}
	payload := []byte("notify me")
	for i := 0; i < 2; i++ {
		grant, err := s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "notice.txt", MimeType: "text/plain", Size: len(payload)})
		if err != nil {
			t.Fatal(err)
		}
		if err = s.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
			t.Fatal(err)
		}
		if _, err = s.Complete(ctx, admin, grant.FileID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.CreateMigration(ctx, admin, contracts.StorageMigrationCreateInput{SourceLocationID: ptr("local"), TargetLocationID: "vault"}); err != nil {
		t.Fatal(err)
	}
	job := runMigrationSteps(t, s, 5)
	if job.Status != files.MigrationCompleted {
		t.Fatal("completed run expected", job)
	}
	if len(recorder.notices) != 1 {
		t.Fatal("completion notice count", recorder.notices)
	}
	completed := recorder.notices[0]
	if completed.RecipientID != admin.ID || completed.SourceID != job.ID || completed.Title != "存储迁移完成" {
		t.Fatal("completion notice", completed)
	}
	if !strings.Contains(completed.Body, "2 个文件全部迁移成功") {
		t.Fatal("completion notice body", completed.Body)
	}
	// A target turned untested after creation fails the run and notifies the
	// same administrator (removal is blocked while the job references it).
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "ghost", Name: "Ghost", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	ghost, err := s.CreateMigration(ctx, admin, contracts.StorageMigrationCreateInput{SourceLocationID: ptr("local"), TargetLocationID: "ghost"})
	if err != nil {
		t.Fatal("create against ghost target", err)
	}
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "ghost", Name: "Ghost", Provider: "local", Tested: false}}, false, admin.ID); err != nil {
		t.Fatal(err)
	}
	runMigrationSteps(t, s, 5)
	// Fetch by id: several jobs share one created_at second, so ordering is random.
	failed := migrationJob(t, s, ghost.ID)
	if failed.Status != files.MigrationFailed {
		t.Fatal("failed run expected", failed)
	}
	if len(recorder.notices) != 2 || recorder.notices[1].Title != "存储迁移失败" || !strings.Contains(recorder.notices[1].Body, "保持现状") {
		t.Fatal("failure notice", recorder.notices)
	}
	// A cancelled run is user-observed and stays silent.
	created, err := s.CreateMigration(ctx, admin, contracts.StorageMigrationCreateInput{SourceLocationID: ptr("local"), TargetLocationID: "vault"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.CancelMigration(ctx, admin, created.ID); err != nil {
		t.Fatal(err)
	}
	if len(recorder.notices) != 2 {
		t.Fatal("cancel must not notify", recorder.notices)
	}
}

func ptr[T any](value T) *T { return &value }
