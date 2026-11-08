// Author: yunnuo <ymz@ebox.vip>
// Description: Cron jobs with persisted enablement, non-overlapping execution and transactional administrator controls.
package scheduler

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

type Job struct {
	Name     string
	Schedule string
	Fn       func(context.Context) error
}

type Scheduler struct {
	mu      sync.Mutex
	Store   *sqlstore.Store
	cron    *cron.Cron
	jobs    map[string]Job
	ids     map[string]cron.EntryID
	running map[string]bool
	started bool
	ctx     context.Context
	cancel  context.CancelFunc
	done    sync.WaitGroup
}

func New(store *sqlstore.Store) *Scheduler {
	return &Scheduler{Store: store, cron: cron.New(cron.WithSeconds()), jobs: map[string]Job{}, ids: map[string]cron.EntryID{}, running: map[string]bool{}}
}

// SetStore attaches the installed instance before Start.
func (s *Scheduler) SetStore(store *sqlstore.Store) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.started {
		s.Store = store
	}
}

// Register declares a builtin before Start. Runtime mutation of the registry is
// intentionally unsupported; operator enablement survives process restarts.
func (s *Scheduler) Register(name, schedule string, fn func(context.Context) error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.started {
		s.jobs[name] = Job{Name: name, Schedule: schedule, Fn: fn}
	}
}

func (s *Scheduler) EnsureRows(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.ensureRows(ctx)
}
func (s *Scheduler) ensureRows(ctx context.Context) error {
	if s.Store == nil || s.Store.DB == nil {
		return errors.New("scheduler store is not attached")
	}
	names := make([]string, 0, len(s.jobs))
	for name := range s.jobs {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		job := s.jobs[name]
		if _, err := s.Store.Exec(ctx, s.Store.DB, "INSERT INTO unicore_scheduled_jobs(name,schedule) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM unicore_scheduled_jobs WHERE name=?)", name, job.Schedule, name); err != nil {
			return err
		}
	}
	return nil
}

func (s *Scheduler) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.started {
		return nil
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := s.ensureRows(ctx); err != nil {
		return err
	}
	runner := cron.New(cron.WithSeconds())
	ids := map[string]cron.EntryID{}
	for name, job := range s.jobs {
		if job.Fn == nil {
			return fmt.Errorf("job %q has no function", name)
		}
		var schedule string
		if err := s.Store.Row(ctx, s.Store.DB, "SELECT schedule FROM unicore_scheduled_jobs WHERE name=?", name).Scan(&schedule); err != nil {
			return err
		}
		id, err := runner.AddFunc(schedule, func() { s.execute(name, false) })
		if err != nil {
			return fmt.Errorf("schedule %q: %w", name, err)
		}
		ids[name] = id
	}
	s.ctx, s.cancel = context.WithCancel(ctx)
	s.cron, s.ids, s.started = runner, ids, true
	runner.Start()
	return nil
}

// Shutdown prevents new automatic and manual runs, cancels in-flight work and
// waits for both cron and manually triggered work before storage is released.
func (s *Scheduler) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	s.started = false
	if s.cancel != nil {
		s.cancel()
	}
	cronDone := s.cron.Stop()
	s.mu.Unlock()
	done := make(chan struct{})
	go func() { <-cronDone.Done(); s.done.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (s *Scheduler) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = s.Shutdown(ctx)
}

func (s *Scheduler) reserve(name string) (Job, context.Context, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	job, ok := s.jobs[name]
	if !ok {
		return Job{}, nil, platform.ErrInput
	}
	if !s.started || s.ctx.Err() != nil {
		return Job{}, nil, platform.ErrConflict
	}
	if s.running[name] {
		return Job{}, nil, platform.ErrConflict
	}
	s.running[name] = true
	s.done.Add(1)
	return job, s.ctx, nil
}
func (s *Scheduler) release(name string) {
	s.mu.Lock()
	delete(s.running, name)
	s.mu.Unlock()
	s.done.Done()
}
func (s *Scheduler) execute(name string, manual bool) {
	job, ctx, err := s.reserve(name)
	if err != nil {
		return
	}
	defer s.release(name)
	if !manual && !s.enabled(ctx, name) {
		return
	}
	s.run(ctx, job)
}
func (s *Scheduler) run(ctx context.Context, job Job) {
	status, code := "ok", ""
	defer func() {
		if recover() != nil {
			status, code = "error", "TASK_PANIC"
		}
		// Completion bookkeeping must survive cancellation of the job itself, but
		// still has a bounded deadline and never retains raw errors or panic values.
		recordCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.record(recordCtx, job.Name, status, code)
	}()
	runCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	if err := job.Fn(runCtx); err != nil {
		status, code = "error", "TASK_FAILED"
		if errors.Is(err, context.Canceled) {
			code = "TASK_CANCELED"
		}
		if errors.Is(err, context.DeadlineExceeded) {
			code = "TASK_TIMEOUT"
		}
	}
}
func (s *Scheduler) enabled(ctx context.Context, name string) bool {
	var enabled int
	err := s.Store.Row(ctx, s.Store.DB, "SELECT enabled FROM unicore_scheduled_jobs WHERE name=?", name).Scan(&enabled)
	return err == nil && enabled != 0
}
func (s *Scheduler) record(ctx context.Context, name, status, code string) error {
	next := s.nextRun(name)
	_, err := s.Store.Exec(ctx, s.Store.DB, "UPDATE unicore_scheduled_jobs SET last_run_at=?,last_status=?,last_error=?,run_count=run_count+1,next_run_at=? WHERE name=?", time.Now().Unix(), status, code, next, name)
	return err
}
func (s *Scheduler) nextRun(name string) int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.started {
		return 0
	}
	e := s.cron.Entry(s.ids[name])
	if e.Next.IsZero() {
		return 0
	}
	return e.Next.Unix()
}

func (s *Scheduler) ListTasks(ctx context.Context) (contracts.TaskList, error) {
	result := contracts.TaskList{Items: []contracts.TaskEntry{}}
	if s.Store == nil || s.Store.DB == nil {
		return result, nil
	}
	rows, err := s.Store.Rows(ctx, s.Store.DB, "SELECT name,schedule,enabled,last_run_at,last_status,last_error,run_count FROM unicore_scheduled_jobs ORDER BY name")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item contracts.TaskEntry
		var enabled int
		if err = rows.Scan(&item.Name, &item.Schedule, &enabled, &item.LastRunAt, &item.LastStatus, &item.LastError, &item.RunCount); err != nil {
			return result, err
		}
		item.Enabled = enabled != 0
		if item.Enabled {
			item.NextRunAt = int(s.nextRun(item.Name))
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}
func (s *Scheduler) transaction(ctx context.Context, actor string) (*sql.Tx, error) {
	if s.Store == nil || s.Store.DB == nil {
		return nil, platform.ErrInput
	}
	tx, err := s.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	if err = s.Store.LockInstallation(ctx, tx); err == nil {
		err = (&platformsql.Repository{Store: s.Store}).AuthorizeAdministrator(ctx, tx, actor, "tasks:write")
	}
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	return tx, nil
}
func (s *Scheduler) SetTaskEnabled(ctx context.Context, name string, enabled bool, actor string) error {
	s.mu.Lock()
	_, ok := s.jobs[name]
	s.mu.Unlock()
	if !ok {
		return platform.ErrInput
	}
	tx, err := s.transaction(ctx, actor)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	value := 0
	if enabled {
		value = 1
	}
	result, err := s.Store.Exec(ctx, tx, "UPDATE unicore_scheduled_jobs SET enabled=? WHERE name=?", value, name)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	// MySQL reports zero affected rows for an idempotent toggle; existence is
	// checked separately so repeated toggles remain successful on every dialect.
	if count == 0 {
		var found string
		if err = s.Store.Row(ctx, tx, "SELECT name FROM unicore_scheduled_jobs WHERE name=?", name).Scan(&found); err != nil {
			return err
		}
	}
	if err = s.Store.Audit(audit.Target(ctx, "task/"+name, fmt.Sprintf("enabled=%v", enabled)), tx, actor, "tasks.updated"); err != nil {
		return err
	}
	return tx.Commit()
}

// TriggerTask accepts a single manual run, including disabled jobs. Conflicting
// runs are rejected; accepted work belongs to the scheduler shutdown context.
func (s *Scheduler) TriggerTask(ctx context.Context, name, actor string) error {
	job, runCtx, err := s.reserve(name)
	if err != nil {
		return err
	}
	tx, err := s.transaction(ctx, actor)
	if err != nil {
		s.release(name)
		return err
	}
	defer tx.Rollback()
	if err = s.Store.Audit(audit.Target(ctx, "task/"+name, "manual trigger"), tx, actor, "tasks.triggered"); err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.release(name)
		return err
	}
	go func() { defer s.release(name); s.run(runCtx, job) }()
	return nil
}
