// Author: yunnuo <ymz@ebox.vip>
// Description: Web composition root with validated configuration and reverse-order resource cleanup.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/robfig/cron/v3"

	webassets "github.com/yunnuo/unicore/apps/web"
	httpadapter "github.com/yunnuo/unicore/internal/adapter/http"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/config"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/lifecycle"
	"github.com/yunnuo/unicore/internal/logging"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/module"
	notesmodule "github.com/yunnuo/unicore/internal/modules/notes"
	"github.com/yunnuo/unicore/internal/monitor"
	"github.com/yunnuo/unicore/internal/notify"
	"github.com/yunnuo/unicore/internal/observability"
	"github.com/yunnuo/unicore/internal/realtime"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/scheduler"
)

// logSink outlives run so the final stop_failed record still reaches the log
// file before the process exits.
var logSink *logging.FileSink

func main() {
	defer func() {
		if logSink != nil {
			_ = logSink.Close()
		}
	}()
	if handled, err := managementMain(); handled {
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if handled, err := updateHelper(os.Args[1:]); handled {
		if err != nil {
			os.Exit(1)
		}
		return
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(os.Args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			_, _ = management([]string{"help"}, os.Stdout)
			return
		}
		slog.Error("server stopped", "event", "server.stop_failed", "error", err)
		os.Exit(1)
	}
}

func run(args []string) (result error) {
	startedAt := time.Now()
	if len(args) > 0 && args[0] == "serve" {
		args = args[1:]
	}
	options, err := config.LoadWeb(args, os.Getenv)
	if err != nil {
		return err
	}
	if err = updateGuard(options.DataDir); err != nil {
		return err
	}
	// File logging is opt-in for web deployments; stdout keeps flowing either
	// way, and a broken sink degrades to stdout instead of failing startup.
	var sink *logging.FileSink
	if options.Log.File {
		opened, err := logging.OpenFileSink(logging.FileOptions{Dir: filepath.Join(options.DataDir, "logs"), MaxAgeDays: options.Log.MaxAgeDays, MaxSizeMB: options.Log.MaxSizeMB, MaxTotalMB: options.Log.MaxTotalMB})
		if err != nil {
			slog.Warn("log file unavailable", "event", "log.file_unavailable", "error", err.Error())
		} else {
			sink = opened
		}
	}
	// Live log streaming taps the same writer chain; stdout and the file sink
	// stay the durable destinations and the broadcast only keeps recent lines.
	broadcast := logging.NewBroadcastWriter()
	logWriter := io.Writer(io.MultiWriter(os.Stdout, broadcast))
	if sink != nil {
		logWriter = io.MultiWriter(os.Stdout, sink, broadcast)
	}
	logger, err := logging.New(logWriter, options.Log, "web")
	if err != nil {
		return err
	}
	slog.SetDefault(logger)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	var resources lifecycle.Stack
	defer func() { result = errors.Join(result, resources.Close()) }()
	if sink != nil {
		// Closed by main after the final error log, not by the resource stack.
		logSink = sink
	}
	manager, err := install.Open(ctx, install.Options{DataDir: options.DataDir, Profile: options.Profile, SecretKey: os.Getenv("APP_SECRET_KEY"), BootstrapToken: os.Getenv("APP_BOOTSTRAP_TOKEN"), AdminPath: os.Getenv("APP_ADMIN_PATH")})
	if err != nil {
		return fmt.Errorf("initialization failed: %w", err)
	}
	resources.Defer("storage", manager.Close)
	_, _, _, profile := manager.Services()
	metadata := runtime.Metadata(profile, options.Deployment)
	logger, err = logging.New(logWriter, options.Log, string(profile))
	if err != nil {
		return err
	}
	logger = logger.With("version", metadata.Version)
	slog.SetDefault(logger)
	if sink != nil {
		sink.SetRetention(logRetention(manager, options.Log.MaxAgeDays))
	}
	updater, err := updateService(ctx, options.DataDir, options.Deployment, func() string { _, _, _, p := manager.Services(); return string(p) }, stop)
	if err != nil {
		return err
	}
	hub := realtime.New()
	metrics := observability.New()
	monitorEvents := monitor.NewEventSink(200)
	monitorEvents.Append(monitor.EventLifecycle, monitor.SeverityInfo, "实例已启动", "v"+metadata.Version)
	taskTracker := monitor.NewTaskEventTracker(monitorEvents)
	// Alert engine: Platform loads persisted rules with notifycontent delivery,
	// Standalone runs the built-in defaults with no external exit; CLI never
	// assembles an engine.
	appMonitor := monitor.New(monitor.Options{
		Profile:   profile,
		ProfileOf: func() contracts.Profile { _, _, _, current := manager.Services(); return current },
		StartedAt: startedAt,
		DB: func() *sql.DB {
			store, _, _, _ := manager.Services()
			if store == nil {
				return nil
			}
			return store.DB
		},
		HTTP: func() monitor.HTTPStats {
			stats := metrics.SnapshotHTTP()
			return monitor.HTTPStats{ActiveRequests: int(stats.ActiveRequests), RequestsTotal: int(stats.RequestsTotal), ErrorsTotal: int(stats.ErrorsTotal), AvgDurationMs: int(stats.AvgDurationMs), P95DurationMs: int(stats.P95DurationMs)}
		},
		Runtime: func() monitor.RuntimeStats {
			stats := metrics.SnapshotRuntime()
			return monitor.RuntimeStats{Goroutines: int(stats.Goroutines), HeapAlloc: int(stats.HeapAlloc), HeapSys: int(stats.HeapSys), GcCycles: int(stats.GcCycles), PauseTotalMs: int(stats.PauseTotalMs), RssBytes: int(stats.RssBytes), CpuTimeMs: int(stats.CpuSeconds * 1000)}
		},
		Host:   monitor.DefaultHost(func() string { return options.DataDir }),
		Events: monitorEvents,
		Runs: func(ctx context.Context, task string) (*contracts.TaskRunList, error) {
			tasks := manager.Tasks()
			if tasks == nil {
				return nil, nil
			}
			list, err := tasks.TaskRuns(ctx, task)
			if err != nil {
				return nil, err
			}
			return &list, nil
		},
		StorageProbe: func(ctx context.Context, location string) error {
			fs := manager.Files()
			if fs == nil {
				return errors.New("本形态不装配文件服务")
			}
			return fs.Test(ctx, location, "monitor")
		},
		Storage: func(ctx context.Context) ([]contracts.StorageLocation, error) {
			fs := manager.Files()
			if fs == nil {
				return nil, nil
			}
			list, err := fs.Locations(ctx)
			if err != nil {
				return nil, err
			}
			return list.Items, nil
		},
		Tasks: func(ctx context.Context) (*contracts.TaskList, error) {
			tasks := manager.Tasks()
			if tasks == nil {
				return nil, nil
			}
			list, err := tasks.ListTasks(ctx)
			if err != nil {
				return nil, err
			}
			return &list, nil
		},
	})
	var alertNotifier monitor.AlertNotifier = monitor.NoopNotifier{}
	alertPlatform := profile == runtime.WebPlatform
	if alertPlatform {
		// Alerts ride the notification event matrix under the same master
		// switch as every other event: templates, channels and retries belong
		// to the queue, and an off switch is an intentional silence.
		alertNotifier = monitor.NotifierFunc(func(notice monitor.AlertNotice) error {
			mail := manager.Mail()
			if mail == nil {
				return monitor.ErrNotifierNotConfigured
			}
			threshold := notice.Rule.Trigger
			kind := "alert_triggered"
			if notice.Action == "recovered" {
				threshold = notice.Rule.Recover
				kind = "alert_recovered"
			}
			notifyCtx, cancelNotify := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancelNotify()
			occurred := notice.OccurredAt
			if occurred.IsZero() {
				occurred = time.Now()
			}
			return mail.EnqueueEvent(notifyCtx, mailer.Event{
				Kind: kind, Detail: notice.Body, At: int(time.Now().Unix()),
				Vars: map[string]string{
					"rule_name": notice.Rule.Name, "severity": notice.Rule.Severity, "metric": string(notice.Rule.Kind), "value": notice.Value,
					"threshold": fmt.Sprintf("%.4g", threshold), "scope": notice.Scope,
					"instance": notice.Instance, "host": notice.Host,
					"transition": notice.Action, "occurred_at": occurred.UTC().Format(time.RFC3339), "duration": notice.Duration,
				},
			})
		})
	}
	alertEngine := monitor.NewAlertEngine(func(ctx context.Context) contracts.MonitorSnapshot { return appMonitor.Snapshot(ctx) },
		monitorEvents, alertNotifier, alertPlatform, monitor.AlertOptions{InstanceID: sqlstore.ID()})
	var alertStore monitor.AlertRuleStore
	if alertPlatform {
		alertStore = &settingsAlertRuleStore{manager: manager}
		initialJSON, loadErr := alertStore.LoadRulesJSON(ctx)
		var initialRules []monitor.AlertRule
		if loadErr == nil && initialJSON != "" {
			initialRules = monitor.DecodeRules(initialJSON, true)
		} else {
			initialRules = monitor.DefaultAlertRules(true)
			if loadErr == nil {
				_ = alertStore.SaveRulesJSON(ctx, monitor.EncodeRules(initialRules))
			}
		}
		alertEngine.SetRules(initialRules)
	} else {
		alertEngine.SetRules(monitor.DefaultAlertRules(false))
	}
	alertEngine.Start()
	resources.Defer("alert engine", func() error { alertEngine.Stop(); return nil })
	appMonitor.SetAlertEngine(alertEngine)

	// Registered-type notification delivery: modules deliver user notifications
	// through one facade instead of reaching into the inbox table directly.
	notifyRegistry := notify.NewRegistry()
	if err := notifyRegistry.Register(notify.Definition{Type: "announcement", TitleZh: "公告", TitleEn: "Announcement"}); err != nil {
		return err
	}
	if err := notifyRegistry.Register(notify.Definition{Type: "system", TitleZh: "系统", TitleEn: "System"}); err != nil {
		return err
	}
	notifyService := &notify.Notifier{Registry: notifyRegistry, Hub: hub, Inbox: notify.InboxFunc(func(ctx context.Context, runner sqlstore.Runner, recipients []string, messageType, sourceID, title, body, actions string) error {
		store, _, _, _ := manager.Services()
		if store == nil {
			return errors.New("notify: instance is not installed")
		}
		return (&platformsql.Repository{Store: store}).DeliverInbox(ctx, runner, recipients, messageType, sourceID, title, body, actions)
	})}

	workerCtx, cancelWorkers := context.WithCancel(context.Background())
	defer cancelWorkers()
	server := &http.Server{Addr: options.Listen, Handler: httpadapter.New(httpadapter.Config{Updates: updater, Metadata: metadata, Core: bootstrap.Core(), Assets: webassets.FS(), Logger: logger, Install: manager, APIDocs: options.APIDocs, ReadinessTimeout: options.ReadinessTimeout, Metrics: metrics, Hub: hub, LogBroadcast: broadcast, Monitor: appMonitor, Notify: notifyService}), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return fmt.Errorf("listen failed: %w", err)
	}
	resources.Defer("listener", func() error { return closeListener(listener) })
	// Bind all listeners before starting workers, so startup failures leave no background work.
	var monitorListener net.Listener
	if options.MonitorListen != "" {
		monitorListener, err = net.Listen("tcp", options.MonitorListen)
		if err != nil {
			return fmt.Errorf("monitor listen failed: %w", err)
		}
		resources.Defer("monitor listener", func() error { return closeListener(monitorListener) })
	}
	// Scheduled jobs replace the hardcoded tickers: the mail queue keeps its
	// 1s cadence and file cleanup runs every minute, both with operator
	// enablement, bookkeeping and manual triggers via /api/v1/admin/tasks.
	store, _, _, _ := manager.Services()
	tasks := scheduler.New(store)
	// Task failures and recoveries come straight from the scheduler's
	// completion hook, so they are recorded even with no monitor page open.
	tasks.OnResult(taskTracker.Observe)
	// Registered business modules contribute their task executors here; the
	// admin surface can only schedule these whitelisted functions.
	module.Register(notesmodule.Module)
	for _, item := range module.All() {
		for _, executor := range item.Executors {
			tasks.RegisterExecutor(executor.Key, executor.Description, executor.Fn)
		}
	}
	queueMail := func(ctx context.Context) error {
		service := manager.Mail()
		if service == nil {
			return nil
		}
		if err := service.Tick(ctx, int(time.Now().Unix())); err != nil && ctx.Err() == nil {
			return fmt.Errorf("mail worker unavailable")
		}
		return nil
	}
	tasks.Register("mail.queue", "@every 1s", queueMail)
	cleanupFiles := func(ctx context.Context) error {
		fs := manager.Files()
		if fs == nil {
			return nil
		}
		cleanupCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if err := fs.Cleanup(cleanupCtx); err != nil && ctx.Err() == nil {
			return fmt.Errorf("file cleanup unavailable")
		}
		return nil
	}
	tasks.Register("files.cleanup", "@every 1m", cleanupFiles)
	// Standalone keeps file cleanup without platform registry tables or APIs.
	localCron := cron.New(cron.WithChain(cron.SkipIfStillRunning(cron.DiscardLogger)))
	_, err = localCron.AddFunc("@every 1m", func() {
		_, _, _, currentProfile := manager.Services()
		if currentProfile == runtime.WebStandalone {
			if err := cleanupFiles(workerCtx); err != nil && workerCtx.Err() == nil {
				logger.Warn("file cleanup unavailable", "event", "files.cleanup_unavailable")
			}
		}
	})
	if err != nil {
		return err
	}
	if sink != nil {
		// Retention changes from the platform settings apply within the hour
		// even without a save-triggered sweep.
		if _, err = localCron.AddFunc("@every 1h", sink.Sweep); err != nil {
			return err
		}
	}
	localCron.Start()
	tasks.Register("announcements.refresh", "@every 1m", scheduler.AnnouncementRefresh(func() *sqlstore.Store {
		store, _, _, _ := manager.Services()
		return store
	}, func() { hub.Broadcast("inbox.new") }))
	// The executor whitelist is what custom tasks may schedule; the admin
	// surface can never run anything outside these registered functions.
	tasks.RegisterExecutor("mail.queue", "推进邮件投递队列", queueMail)
	tasks.RegisterExecutor("files.cleanup", "清理过期的上传文件与孤元数据", cleanupFiles)
	tasks.RegisterExecutor("announcements.refresh", "刷新公告推送并通知在线客户端", scheduler.AnnouncementRefresh(func() *sqlstore.Store {
		store, _, _, _ := manager.Services()
		return store
	}, func() { hub.Broadcast("inbox.new") }))
	if sink != nil {
		tasks.RegisterExecutor("logging.sweep", "按保留策略清理数据目录内的轮转日志", func(ctx context.Context) error {
			sink.Sweep()
			return nil
		})
	}
	// A supervised lazy start supports installation through the wizard, without
	// ever registering platform tasks against a standalone schema.
	workerDone := make(chan struct{})
	go func() {
		defer close(workerDone)
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			_, _, _, currentProfile := manager.Services()
			if manager.Installed() && currentProfile == runtime.WebPlatform {
				installedStore, installedSettings, _, _ := manager.Services()
				tasks.SetStore(installedStore)
				if sink != nil && installedSettings != nil && installedSettings.LoggingSweep == nil {
					// The install wizard created the service after startup wiring.
					installedSettings.LoggingSweep = sink
				}
				if err := tasks.Start(workerCtx); err == nil {
					manager.SetTasks(tasks)
					return
				} else {
					logger.Error("scheduler start failed", "event", "scheduler.start_failed")
				}
			}
			select {
			case <-workerCtx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	resources.Defer("scheduler", func() error {
		cancelWorkers()
		<-workerDone
		shutdownCtx, cancel := context.WithTimeout(context.Background(), options.ShutdownTimeout)
		defer cancel()
		localDone := localCron.Stop()
		select {
		case <-localDone.Done():
		case <-shutdownCtx.Done():
			return shutdownCtx.Err()
		}
		return tasks.Shutdown(shutdownCtx)
	})
	// Long-lived SSE streams must close when draining begins; otherwise an
	// otherwise graceful HTTP shutdown would always exhaust its deadline. The
	// log broadcast joins the hub so live log streams terminate the same way.
	streamDone := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			hub.Close()
			broadcast.Close()
		case <-streamDone:
		}
	}()
	defer close(streamDone)
	defer hub.Close()
	defer broadcast.Close()
	if monitorListener != nil {
		mux := http.NewServeMux()
		mux.Handle("/metrics", metrics.Handler(func() *sql.DB {
			store, _, _, _ := manager.Services()
			if store == nil {
				return nil
			}
			return store.DB
		}))
		monitor := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
		monitorCtx, stopMonitor := context.WithCancel(ctx)
		monitorDone := make(chan error, 1)
		go func() {
			err := lifecycle.ServeHTTP(monitorCtx, monitor, monitorListener, options.ShutdownTimeout)
			monitorDone <- err
			if err != nil {
				stop()
			}
		}()
		resources.Defer("monitor", func() error { stopMonitor(); return <-monitorDone })
		logger.Info("monitor started", "event", "monitor.start", "address", monitorListener.Addr().String())
	}
	logger.Info("server started", "event", "server.start", "address", listener.Addr().String(), "installed", manager.Installed(), "api_docs", options.APIDocs, "shutdown_timeout", options.ShutdownTimeout.String(), "readiness_timeout", options.ReadinessTimeout.String())
	if !manager.Installed() {
		logger.Info("installation credential is available in a restricted file", "event", "install.token_file", "path", manager.TokenPath())
	}
	updateHealthy(options.DataDir, string(profile))
	return lifecycle.ServeHTTP(ctx, server, listener, options.ShutdownTimeout)
}

func closeListener(listener net.Listener) error {
	err := listener.Close()
	if errors.Is(err, net.ErrClosed) {
		return nil
	}
	return err
}

// logRetention resolves the effective age limit per sweep: the platform
// profile reads the runtime logging.retention_days setting (0 keeps logs
// forever), other profiles keep their boot-time value.
func logRetention(manager *install.Manager, fallback int) logging.Retention {
	return func() int {
		_, service, _, profile := manager.Services()
		if profile != runtime.WebPlatform || service == nil {
			return fallback
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if value, err := service.Value(ctx, "logging.retention_days"); err == nil {
			if days, err := strconv.Atoi(value); err == nil && days >= 0 {
				return days
			}
		}
		return fallback
	}
}

// settingsAlertRuleStore persists the alert rule JSON through the settings
// infrastructure under an internal key that never reaches the generic API.
type settingsAlertRuleStore struct{ manager *install.Manager }

func (s *settingsAlertRuleStore) LoadRulesJSON(ctx context.Context) (string, error) {
	_, settingsService, _, _ := s.manager.Services()
	if settingsService == nil {
		return "", errors.New("settings unavailable")
	}
	return settingsService.AlertingRules(ctx)
}

func (s *settingsAlertRuleStore) SaveRulesJSON(ctx context.Context, payload string) error {
	_, settingsService, _, _ := s.manager.Services()
	if settingsService == nil {
		return errors.New("settings unavailable")
	}
	return settingsService.SaveAlertingRules(ctx, payload, "monitor")
}
