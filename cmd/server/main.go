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
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/config"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/lifecycle"
	"github.com/yunnuo/unicore/internal/logging"
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
	logWriter := io.Writer(os.Stdout)
	if sink != nil {
		logWriter = io.MultiWriter(os.Stdout, sink)
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
	workerCtx, cancelWorkers := context.WithCancel(context.Background())
	defer cancelWorkers()
	server := &http.Server{Addr: options.Listen, Handler: httpadapter.New(httpadapter.Config{Updates: updater, Metadata: metadata, Core: bootstrap.Core(), Assets: webassets.FS(), Logger: logger, Install: manager, APIDocs: options.APIDocs, ReadinessTimeout: options.ReadinessTimeout, Metrics: metrics, Hub: hub}), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
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
	tasks.Register("mail.queue", "@every 1s", func(ctx context.Context) error {
		service := manager.Mail()
		if service == nil {
			return nil
		}
		if err := service.Tick(ctx, int(time.Now().Unix())); err != nil && ctx.Err() == nil {
			return fmt.Errorf("mail worker unavailable")
		}
		return nil
	})
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
	// otherwise graceful HTTP shutdown would always exhaust its deadline.
	streamDone := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			hub.Close()
		case <-streamDone:
		}
	}()
	defer close(streamDone)
	defer hub.Close()
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
