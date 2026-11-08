// Author: yunnuo <ymz@ebox.vip>
// Description: Scheduler lifecycle, administrator transactions, overlap prevention and safe error bookkeeping.
package scheduler

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/migrations/runner"
)

func fixture(t *testing.T) (*sqlstore.Store, string) {
	t.Helper()
	ctx := context.Background()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "scheduler.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: "sqlite", Profile: "web-platform"}); err != nil {
		t.Fatal(err)
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,?)", "web-platform", sqlstore.ID(), time.Now().Unix()); err != nil {
		t.Fatal(err)
	}
	admin, err := (&platformsql.Repository{Store: store, Administrators: true}).Seed(ctx, tx, contracts.UserCreate{Username: "admin", Email: "admin@example.test", Role: "super_admin"}, "unused-test-hash")
	if err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return store, admin.ID
}
func waitRun(t *testing.T, s *Scheduler, name string) contracts.TaskEntry {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		list, err := s.ListTasks(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range list.Items {
			if entry.Name == name && entry.RunCount > 0 {
				return entry
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("job was not recorded")
	return contracts.TaskEntry{}
}
func TestSchedulerControlsAndSafeFailures(t *testing.T) {
	store, admin := fixture(t)
	ctx := context.Background()
	s := New(store)
	var calls atomic.Int32
	s.Register("test", "@every 1h", func(context.Context) error { calls.Add(1); return errors.New("secret smtp password") })
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer s.Stop()
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if len(s.cron.Entries()) != 1 {
		t.Fatal("duplicate registration")
	}
	if err := s.SetTaskEnabled(ctx, "test", false, "unknown"); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal(err)
	}
	if err := s.SetTaskEnabled(ctx, "test", false, admin); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTaskEnabled(ctx, "test", false, admin); err != nil {
		t.Fatal("idempotent toggle", err)
	}
	s.execute("test", false)
	if calls.Load() != 0 {
		t.Fatal("disabled task ran")
	}
	if err := s.TriggerTask(ctx, "test", admin); err != nil {
		t.Fatal(err)
	}
	entry := waitRun(t, s, "test")
	if entry.LastError != "TASK_FAILED" || strings.Contains(entry.LastError, "secret") || entry.LastStatus != "error" || entry.NextRunAt != 0 {
		t.Fatal(entry)
	}
	var auditCount int
	if err := store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_audit_logs WHERE action='tasks.triggered'").Scan(&auditCount); err != nil || auditCount != 1 {
		t.Fatal(auditCount, err)
	}
	if _, err := store.Exec(ctx, store.DB, "UPDATE unicore_administrators SET status='disabled' WHERE id=?", admin); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTaskEnabled(ctx, "test", true, admin); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("disabled administrator", err)
	}
}
func TestSchedulerManualShutdownAndOverlap(t *testing.T) {
	store, admin := fixture(t)
	s := New(store)
	entered := make(chan struct{})
	finished := make(chan struct{})
	s.Register("blocked", "@every 1h", func(ctx context.Context) error { close(entered); <-ctx.Done(); close(finished); return ctx.Err() })
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := s.TriggerTask(context.Background(), "blocked", admin); err != nil {
		t.Fatal(err)
	}
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("not started")
	}
	if err := s.TriggerTask(context.Background(), "blocked", admin); !errors.Is(err, platform.ErrConflict) {
		t.Fatal("overlapping manual run", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := s.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case <-finished:
	default:
		t.Fatal("shutdown did not wait")
	}
	entry := waitRun(t, s, "blocked")
	if entry.LastError != "TASK_CANCELED" {
		t.Fatal(entry)
	}
	if err := s.TriggerTask(context.Background(), "blocked", admin); !errors.Is(err, platform.ErrConflict) {
		t.Fatal(err)
	}
}
func TestSchedulerPanicAndEnablementFailure(t *testing.T) {
	store, _ := fixture(t)
	s := New(store)
	s.Register("panic", "@every 1h", func(context.Context) error { panic("private token") })
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer s.Stop()
	s.execute("panic", false)
	if entry := waitRun(t, s, "panic"); entry.LastError != "TASK_PANIC" {
		t.Fatal(entry)
	}
	if _, err := store.Exec(context.Background(), store.DB, "DELETE FROM unicore_scheduled_jobs WHERE name='panic'"); err != nil {
		t.Fatal(err)
	}
	if s.enabled(context.Background(), "panic") {
		t.Fatal("missing enablement must fail closed")
	}
}
func TestAnnouncementRefreshBoundaries(t *testing.T) {
	store, _ := fixture(t)
	ctx := context.Background()
	clock := time.Unix(100, 0)
	notifications := 0
	check := announcementRefresh(func() *sqlstore.Store { return store }, func() { notifications++ }, func() time.Time { return clock })
	if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_platform_announcements(id,content,content_html,format,type,note,status,publish_at,created_by,updated_by,created_at,updated_at,deleted_at,version,title,notify_mode,ends_at,audience) VALUES('a','x','x','markdown','info','','published',110,'x','x',1,1,0,1,'title','silent',130,'all')"); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		now  int64
		want int
	}{{109, 0}, {110, 1}, {110, 1}, {129, 1}, {130, 2}, {140, 2}} {
		clock = time.Unix(tc.now, 0)
		if err := check(ctx); err != nil {
			t.Fatal(err)
		}
		if notifications != tc.want {
			t.Fatalf("at %d: %d want %d", tc.now, notifications, tc.want)
		}
	}
	if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES('announcements.enabled','false')"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Exec(ctx, store.DB, "UPDATE unicore_platform_announcements SET publish_at=150,ends_at=0"); err != nil {
		t.Fatal(err)
	}
	clock = time.Unix(150, 0)
	if err := check(ctx); err != nil {
		t.Fatal(err)
	}
	if notifications != 2 {
		t.Fatal("disabled broadcast")
	}
}

func TestNormalizeSchedule(t *testing.T) {
	for input, want := range map[string]string{
		"*/5 * * * *":   "0 */5 * * * *",
		"0 3 * * *":     "0 0 3 * * *",
		"@daily":        "@daily",
		"@every 30m":    "@every 30m",
		"0 3 * * * *":   "0 3 * * * *",
		"  @hourly    ": "@hourly",
	} {
		got, err := NormalizeSchedule(input)
		if err != nil || got != want {
			t.Fatalf("%q -> %q, %v (want %q)", input, got, err, want)
		}
	}
	for _, bad := range []string{"", "   ", "not-a-cron", "* * * *", "@reboot", strings.Repeat("0 ", 40)} {
		if _, err := NormalizeSchedule(bad); !errors.Is(err, ErrScheduleInvalid) {
			t.Fatalf("accepted %q: %v", bad, err)
		}
	}
}

func TestCustomTaskLifecycle(t *testing.T) {
	store, admin := fixture(t)
	ctx := context.Background()
	s := New(store)
	s.RegisterExecutor("echo.demo", "演示执行器", func(context.Context) error { return nil })
	if _, err := s.CreateTask(ctx, contracts.TaskCreateInput{Name: "demo.one", Description: "d", Schedule: "@daily", Executor: "missing"}, admin); !errors.Is(err, ErrExecutorUnknown) {
		t.Fatal("unknown executor accepted", err)
	}
	if _, err := s.CreateTask(ctx, contracts.TaskCreateInput{Name: "demo.one", Description: "d", Schedule: "not-a-cron", Executor: "echo.demo"}, admin); !errors.Is(err, ErrScheduleInvalid) {
		t.Fatal("invalid schedule accepted", err)
	}
	entry, err := s.CreateTask(ctx, contracts.TaskCreateInput{Name: "demo.one", Description: "演示", Schedule: "*/5 * * * *", Executor: "echo.demo"}, admin)
	if err != nil || entry.Schedule != "0 */5 * * * *" || !entry.Custom {
		t.Fatal("create", entry, err)
	}
	if _, err = s.CreateTask(ctx, contracts.TaskCreateInput{Name: "demo.one", Description: "d", Schedule: "@daily", Executor: "echo.demo"}, admin); !errors.Is(err, ErrTaskExists) {
		t.Fatal("duplicate name accepted", err)
	}
	s.Register("builtin.one", "@hourly", func(context.Context) error { return nil })
	if err = s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer s.Stop()
	list, err := s.ListTasks(ctx)
	if err != nil || len(list.Executors) != 1 || list.Executors[0].Key != "echo.demo" {
		t.Fatal("executor list", list.Executors, err)
	}
	if _, err = s.UpdateTask(ctx, "builtin.one", contracts.TaskEditInput{Description: "x", Schedule: "@daily", Executor: "echo.demo"}, admin); !errors.Is(err, ErrBuiltinImmutable) {
		t.Fatal("builtin edit accepted", err)
	}
	if err = s.DeleteTask(ctx, "builtin.one", admin); !errors.Is(err, ErrBuiltinImmutable) {
		t.Fatal("builtin delete accepted", err)
	}
	if entry, err = s.UpdateTask(ctx, "demo.one", contracts.TaskEditInput{Description: "调整", Schedule: "0 3 * * *", Executor: "echo.demo"}, admin); err != nil || entry.Schedule != "0 0 3 * * *" || entry.Description != "调整" {
		t.Fatal("edit", entry, err)
	}
	if err = s.TriggerTask(ctx, "demo.one", admin); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	var runs contracts.TaskRunList
	for time.Now().Before(deadline) {
		if runs, err = s.TaskRuns(ctx, "demo.one"); err == nil && len(runs.Items) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(runs.Items) != 1 || runs.Items[0].Status != "ok" || runs.Items[0].DurationMs < 0 {
		t.Fatal("run history", runs.Items)
	}
	if _, err = s.CreateTask(ctx, contracts.TaskCreateInput{Name: "demo.two", Description: "d", Schedule: "@daily", Executor: "echo.demo"}, admin); err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteTask(ctx, "demo.two", admin); err != nil {
		t.Fatal(err)
	}
	var jobs, history int
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_scheduled_jobs WHERE name='demo.one'").Scan(&jobs); err != nil || jobs != 1 {
		t.Fatal(jobs, err)
	}
	if err = s.DeleteTask(ctx, "demo.one", admin); err != nil {
		t.Fatal(err)
	}
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_task_runs WHERE job_name='demo.one'").Scan(&history); err != nil || history != 0 {
		t.Fatal("history survived delete", history, err)
	}
}

func TestCustomTaskBrokenRowSkipped(t *testing.T) {
	store, admin := fixture(t)
	ctx := context.Background()
	s := New(store)
	s.RegisterExecutor("echo.demo", "演示执行器", func(context.Context) error { return nil })
	seed := func(name, schedule, executor string) {
		t.Helper()
		if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_scheduled_jobs(name,schedule,description,executor) VALUES(?,?,?,?)", name, schedule, "seed", executor); err != nil {
			t.Fatal(err)
		}
	}
	seed("bad.executor", "@daily", "gone.executor")
	seed("bad.schedule", "not-a-cron", "echo.demo")
	seed("good.one", "@daily", "echo.demo")
	if err := s.Start(ctx); err != nil {
		t.Fatal("broken custom row must not abort startup", err)
	}
	defer s.Stop()
	if err := s.TriggerTask(ctx, "good.one", admin); err != nil {
		t.Fatal("healthy custom row was not scheduled", err)
	}
	for name, code := range map[string]string{"bad.executor": "TASK_EXECUTOR_UNKNOWN", "bad.schedule": "TASK_SCHEDULE_INVALID"} {
		var status, lastError string
		if err := store.Row(ctx, store.DB, "SELECT last_status,last_error FROM unicore_scheduled_jobs WHERE name=?", name).Scan(&status, &lastError); err != nil || status != "error" || lastError != code {
			t.Fatal(name, status, lastError, err)
		}
		if err := s.DeleteTask(ctx, name, admin); err != nil {
			t.Fatal("broken row not deletable", name, err)
		}
	}
}

func TestCustomTaskHistoryTrim(t *testing.T) {
	store, admin := fixture(t)
	ctx := context.Background()
	s := New(store)
	s.RegisterExecutor("echo.demo", "演示执行器", func(context.Context) error { return nil })
	entry, err := s.CreateTask(ctx, contracts.TaskCreateInput{Name: "trim.one", Description: "d", Schedule: "@daily", Executor: "echo.demo"}, admin)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer s.Stop()
	for index := 0; index < 55; index++ {
		if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_task_runs(id,job_name,started_at,duration_ms,status,error) VALUES(?,?,?,?,?,?)", sqlstore.ID(), "trim.one", int64(index), 1, "ok", ""); err != nil {
			t.Fatal(err)
		}
	}
	if err = s.TriggerTask(ctx, entry.Name, admin); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	var count int
	for time.Now().Before(deadline) {
		if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_task_runs WHERE job_name='trim.one'").Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count == 50 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("history not trimmed to 50:", count)
}
