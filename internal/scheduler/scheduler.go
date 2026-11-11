// Author: yunnuo <ymz@ebox.vip>
// Description: Cron jobs with persisted enablement, non-overlapping execution and transactional administrator controls.
package scheduler

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// Job is one schedulable unit. Builtin jobs carry an empty Executor; custom
// tasks reference a registered executor by key and are stored in the database.
type Job struct {
	Name     string
	Schedule string
	Executor string
	Fn       func(context.Context) error
}

// Executor is a code-registered function custom tasks may reference. The
// whitelist is the security boundary: the admin surface can only schedule
// these named functions, never arbitrary code.
type Executor struct {
	Key         string
	Description string
	Fn          func(context.Context) error
}

var (
	ErrScheduleInvalid  = errors.New("task schedule is invalid")
	ErrExecutorUnknown  = errors.New("task executor is unknown")
	ErrBuiltinImmutable = errors.New("builtin tasks cannot be edited or deleted")
	ErrTaskNotFound     = errors.New("task not found")
	ErrTaskExists       = errors.New("task name already exists")
)

type Scheduler struct {
	mu        sync.Mutex
	Store     *sqlstore.Store
	cron      *cron.Cron
	jobs      map[string]Job
	executors map[string]Executor
	ids       map[string]cron.EntryID
	running   map[string]bool
	started   bool
	ctx       context.Context
	cancel    context.CancelFunc
	done      sync.WaitGroup
	resultHook ResultHook
}

func New(store *sqlstore.Store) *Scheduler {
	return &Scheduler{Store: store, cron: cron.New(cron.WithSeconds()), jobs: map[string]Job{}, executors: map[string]Executor{}, ids: map[string]cron.EntryID{}, running: map[string]bool{}}
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

// RegisterExecutor declares a whitelisted function custom tasks may reference.
// Like Register it only accepts declarations before Start.
func (s *Scheduler) RegisterExecutor(key, description string, fn func(context.Context) error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.started {
		s.executors[key] = Executor{Key: key, Description: description, Fn: fn}
	}
}

// Executors lists the whitelist in stable key order for the admin surface.
func (s *Scheduler) Executors() []contracts.TaskExecutor {
	s.mu.Lock()
	defer s.mu.Unlock()
	keys := make([]string, 0, len(s.executors))
	for key := range s.executors {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	items := make([]contracts.TaskExecutor, 0, len(keys))
	for _, key := range keys {
		executor := s.executors[key]
		items = append(items, contracts.TaskExecutor{Key: executor.Key, Description: executor.Description})
	}
	return items
}

var (
	// The runtime cron carries a seconds field; the standard five-field form is
	// accepted from operators and normalized by prefixing a zero second.
	secondParser = cron.NewParser(cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
	dayParser    = cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
)

// NormalizeSchedule validates an operator-provided schedule and returns the
// seconds-form used by the runtime. Invalid schedules must never reach the
// database: one bad row aborts the whole scheduler start.
func NormalizeSchedule(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" || len(trimmed) > 64 {
		return "", ErrScheduleInvalid
	}
	if _, err := secondParser.Parse(trimmed); err == nil {
		return trimmed, nil
	}
	if _, err := dayParser.Parse(trimmed); err == nil {
		return "0 " + trimmed, nil
	}
	return "", ErrScheduleInvalid
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
	// Custom rows schedule dynamically; a broken one (unknown executor or an
	// invalid stored schedule) is skipped and flagged instead of aborting the
	// whole scheduler, and stays editable and deletable in the admin surface.
	// All rows are read and the result set closed before any write: the single
	// connection pool cannot run an UPDATE while the reader is still open.
	type customRow struct{ name, schedule, executor string }
	customRows := []customRow{}
	rows, err := s.Store.Rows(ctx, s.Store.DB, "SELECT name,schedule,executor FROM unicore_scheduled_jobs WHERE executor<>'' ORDER BY name")
	if err != nil {
		return err
	}
	for rows.Next() {
		var row customRow
		if err := rows.Scan(&row.name, &row.schedule, &row.executor); err != nil {
			rows.Close()
			return err
		}
		customRows = append(customRows, row)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, row := range customRows {
		whitelisted, ok := s.executors[row.executor]
		if !ok {
			s.flagCustom(ctx, row.name, "TASK_EXECUTOR_UNKNOWN")
			continue
		}
		normalized, err := NormalizeSchedule(row.schedule)
		if err != nil {
			s.flagCustom(ctx, row.name, "TASK_SCHEDULE_INVALID")
			continue
		}
		id, err := runner.AddFunc(normalized, func() { s.execute(row.name, false) })
		if err != nil {
			s.flagCustom(ctx, row.name, "TASK_SCHEDULE_INVALID")
			continue
		}
		s.jobs[row.name] = Job{Name: row.name, Schedule: normalized, Executor: row.executor, Fn: whitelisted.Fn}
		ids[row.name] = id
	}
	s.ctx, s.cancel = context.WithCancel(ctx)
	s.cron, s.ids, s.started = runner, ids, true
	runner.Start()
	return nil
}

// flagCustom marks a custom row that cannot be scheduled right now; the
// bounded bookkeeping context mirrors the run() completion path.
func (s *Scheduler) flagCustom(ctx context.Context, name, code string) {
	recordCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _ = s.Store.Exec(recordCtx, s.Store.DB, "UPDATE unicore_scheduled_jobs SET last_status='error',last_error=? WHERE name=?", code, name)
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
// ResultHook receives every task completion straight from the run site, so
// observers see failures and recoveries even when no monitor page is open.
// Set it once during assembly; runs read it without locking.
type ResultHook func(name, status, code string)

// OnResult installs the completion hook; pass nil to detach.
func (s *Scheduler) OnResult(hook ResultHook) { s.resultHook = hook }

func (s *Scheduler) run(ctx context.Context, job Job) {
	startedAt := time.Now()
	status, code := "ok", ""
	defer func() {
		if recover() != nil {
			status, code = "error", "TASK_PANIC"
		}
		// Completion bookkeeping must survive cancellation of the job itself, but
		// still has a bounded deadline and never retains raw errors or panic values.
		recordCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.record(recordCtx, job, startedAt, status, code)
		if s.resultHook != nil {
			s.resultHook(job.Name, status, code)
		}
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

// record updates the last-run columns and, for custom tasks, appends a
// bounded history row (kept at 50 per task). The existence guard keeps an
// in-flight run from recreating history for a just-deleted task.
func (s *Scheduler) record(ctx context.Context, job Job, startedAt time.Time, status, code string) error {
	next := s.nextRun(job.Name)
	if _, err := s.Store.Exec(ctx, s.Store.DB, "UPDATE unicore_scheduled_jobs SET last_run_at=?,last_status=?,last_error=?,run_count=run_count+1,next_run_at=? WHERE name=?", startedAt.Unix(), status, code, next, job.Name); err != nil {
		return err
	}
	if job.Executor == "" {
		return nil
	}
	if _, err := s.Store.Exec(ctx, s.Store.DB, "INSERT INTO unicore_task_runs(id,job_name,started_at,duration_ms,status,error) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM unicore_scheduled_jobs WHERE name=?)", sqlstore.ID(), job.Name, startedAt.Unix(), time.Since(startedAt).Milliseconds(), status, code, job.Name); err != nil {
		return err
	}
	_, err := s.Store.Exec(ctx, s.Store.DB, "DELETE FROM unicore_task_runs WHERE job_name=? AND id NOT IN (SELECT id FROM (SELECT id FROM unicore_task_runs WHERE job_name=? ORDER BY started_at DESC, id DESC LIMIT 50) latest)", job.Name, job.Name)
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
	result := contracts.TaskList{Items: []contracts.TaskEntry{}, Executors: []contracts.TaskExecutor{}}
	if s.Store == nil || s.Store.DB == nil {
		return result, nil
	}
	rows, err := s.Store.Rows(ctx, s.Store.DB, "SELECT name,schedule,description,executor,enabled,last_run_at,last_status,last_error,run_count FROM unicore_scheduled_jobs ORDER BY name")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item contracts.TaskEntry
		var enabled int
		if err = rows.Scan(&item.Name, &item.Schedule, &item.Description, &item.Executor, &enabled, &item.LastRunAt, &item.LastStatus, &item.LastError, &item.RunCount); err != nil {
			return result, err
		}
		item.Enabled = enabled != 0
		item.Custom = item.Executor != ""
		if item.Enabled {
			item.NextRunAt = int(s.nextRun(item.Name))
		}
		result.Items = append(result.Items, item)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	result.Executors = s.Executors()
	return result, nil
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

// SetTaskEnabled toggles any persisted task; custom rows are matched by their
// database presence rather than the in-memory registry so enablement keeps
// working before Start and for rows whose executor disappeared.
func (s *Scheduler) SetTaskEnabled(ctx context.Context, name string, enabled bool, actor string) error {
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
			if errors.Is(err, sql.ErrNoRows) {
				return ErrTaskNotFound
			}
			return err
		}
	}
	if err = s.Store.Audit(audit.Target(ctx, "task/"+name, fmt.Sprintf("enabled=%v", enabled)), tx, actor, "tasks.updated"); err != nil {
		return err
	}
	return tx.Commit()
}

// CreateTask validates the whitelist and schedule, persists the row inside the
// authorized transaction, and registers the job immediately when the runtime is
// already running.
func (s *Scheduler) CreateTask(ctx context.Context, input contracts.TaskCreateInput, actor string) (contracts.TaskEntry, error) {
	entry := contracts.TaskEntry{Name: input.Name, Description: input.Description, Enabled: true}
	executor, err := s.executor(input.Executor)
	if err != nil {
		return entry, err
	}
	schedule, err := NormalizeSchedule(input.Schedule)
	if err != nil {
		return entry, err
	}
	entry.Schedule, entry.Executor, entry.Custom = schedule, input.Executor, true
	tx, err := s.transaction(ctx, actor)
	if err != nil {
		return entry, err
	}
	defer tx.Rollback()
	if err = s.Store.Row(ctx, tx, "SELECT name FROM unicore_scheduled_jobs WHERE name=?", input.Name).Scan(&entry.Name); err == nil {
		return entry, ErrTaskExists
	} else if !errors.Is(err, sql.ErrNoRows) {
		return entry, err
	}
	if _, err = s.Store.Exec(ctx, tx, "INSERT INTO unicore_scheduled_jobs(name,schedule,enabled,description,executor) VALUES(?,?,1,?,?)", input.Name, schedule, input.Description, input.Executor); err != nil {
		return entry, err
	}
	if err = s.Store.Audit(audit.Target(ctx, "task/"+input.Name, fmt.Sprintf("executor=%s schedule=%s", input.Executor, schedule)), tx, actor, "tasks.created"); err != nil {
		return entry, err
	}
	if err = tx.Commit(); err != nil {
		return entry, err
	}
	s.scheduleJob(Job{Name: input.Name, Schedule: schedule, Executor: input.Executor, Fn: executor.Fn})
	entry.NextRunAt = int(s.nextRun(input.Name))
	return entry, nil
}

// UpdateTask edits a custom task; builtin rows (empty executor) are immutable.
func (s *Scheduler) UpdateTask(ctx context.Context, name string, input contracts.TaskEditInput, actor string) (contracts.TaskEntry, error) {
	entry := contracts.TaskEntry{Name: name, Description: input.Description, Enabled: true}
	executor, err := s.executor(input.Executor)
	if err != nil {
		return entry, err
	}
	schedule, err := NormalizeSchedule(input.Schedule)
	if err != nil {
		return entry, err
	}
	entry.Schedule, entry.Executor, entry.Custom = schedule, input.Executor, true
	tx, err := s.transaction(ctx, actor)
	if err != nil {
		return entry, err
	}
	defer tx.Rollback()
	var storedExecutor string
	if err = s.Store.Row(ctx, tx, "SELECT executor FROM unicore_scheduled_jobs WHERE name=?", name).Scan(&storedExecutor); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return entry, ErrTaskNotFound
		}
		return entry, err
	}
	if storedExecutor == "" {
		return entry, ErrBuiltinImmutable
	}
	if _, err = s.Store.Exec(ctx, tx, "UPDATE unicore_scheduled_jobs SET description=?,schedule=?,executor=? WHERE name=?", input.Description, schedule, input.Executor, name); err != nil {
		return entry, err
	}
	if err = s.Store.Audit(audit.Target(ctx, "task/"+name, fmt.Sprintf("executor=%s schedule=%s", input.Executor, schedule)), tx, actor, "tasks.updated"); err != nil {
		return entry, err
	}
	if err = tx.Commit(); err != nil {
		return entry, err
	}
	s.rescheduleJob(name, Job{Name: name, Schedule: schedule, Executor: input.Executor, Fn: executor.Fn})
	entry.NextRunAt = int(s.nextRun(name))
	return entry, nil
}

// DeleteTask removes a custom task with its history; builtin rows are refused.
func (s *Scheduler) DeleteTask(ctx context.Context, name, actor string) error {
	tx, err := s.transaction(ctx, actor)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var storedExecutor string
	if err = s.Store.Row(ctx, tx, "SELECT executor FROM unicore_scheduled_jobs WHERE name=?", name).Scan(&storedExecutor); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrTaskNotFound
		}
		return err
	}
	if storedExecutor == "" {
		return ErrBuiltinImmutable
	}
	if _, err = s.Store.Exec(ctx, tx, "DELETE FROM unicore_scheduled_jobs WHERE name=?", name); err != nil {
		return err
	}
	if _, err = s.Store.Exec(ctx, tx, "DELETE FROM unicore_task_runs WHERE job_name=?", name); err != nil {
		return err
	}
	if err = s.Store.Audit(audit.Target(ctx, "task/"+name, "deleted"), tx, actor, "tasks.deleted"); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	s.unscheduleJob(name)
	return nil
}

// TaskRuns lists the bounded run history of one task, newest first.
func (s *Scheduler) TaskRuns(ctx context.Context, name string) (contracts.TaskRunList, error) {
	result := contracts.TaskRunList{Items: []contracts.TaskRunEntry{}}
	if err := s.Store.Row(ctx, s.Store.DB, "SELECT name FROM unicore_scheduled_jobs WHERE name=?", name).Scan(&name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return result, ErrTaskNotFound
		}
		return result, err
	}
	rows, err := s.Store.Rows(ctx, s.Store.DB, "SELECT started_at,duration_ms,status,error FROM unicore_task_runs WHERE job_name=? ORDER BY started_at DESC, id DESC LIMIT 50", name)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item contracts.TaskRunEntry
		if err = rows.Scan(&item.StartedAt, &item.DurationMs, &item.Status, &item.Error); err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

// executor resolves the whitelist; a missing key is a hard input error.
func (s *Scheduler) executor(key string) (Executor, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	executor, ok := s.executors[key]
	if !ok {
		return Executor{}, ErrExecutorUnknown
	}
	return executor, nil
}

// scheduleJob registers a committed custom row into a running runtime. When
// the runtime has not started yet, Start loads the row from the database.
func (s *Scheduler) scheduleJob(job Job) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.started {
		return
	}
	if id, err := s.cron.AddFunc(job.Schedule, func() { s.execute(job.Name, false) }); err == nil {
		s.jobs[job.Name], s.ids[job.Name] = job, id
	} else {
		s.flagCustom(s.ctx, job.Name, "TASK_SCHEDULE_INVALID")
	}
}

// rescheduleJob swaps the schedule of a running custom task.
func (s *Scheduler) rescheduleJob(name string, job Job) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.started {
		return
	}
	if id, ok := s.ids[name]; ok {
		s.cron.Remove(id)
	}
	if id, err := s.cron.AddFunc(job.Schedule, func() { s.execute(name, false) }); err == nil {
		s.jobs[name], s.ids[name] = job, id
	} else {
		s.flagCustom(s.ctx, name, "TASK_SCHEDULE_INVALID")
	}
}

func (s *Scheduler) unscheduleJob(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.started {
		return
	}
	if id, ok := s.ids[name]; ok {
		s.cron.Remove(id)
		delete(s.ids, name)
	}
	delete(s.jobs, name)
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
