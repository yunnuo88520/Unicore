// Author: yunnuo <ymz@ebox.vip>
// Description: Web composition root with validated configuration and reverse-order resource cleanup.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	webassets "github.com/yunnuo/unicore/apps/web"
	httpadapter "github.com/yunnuo/unicore/internal/adapter/http"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/config"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/lifecycle"
	"github.com/yunnuo/unicore/internal/logging"
	"github.com/yunnuo/unicore/internal/observability"
	"github.com/yunnuo/unicore/internal/runtime"
)

func main() {
	if handled, err := updateHelper(os.Args[1:]); handled {
		if err != nil {
			os.Exit(1)
		}
		return
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(os.Args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprint(os.Stdout, config.WebUsage)
			return
		}
		slog.Error("server stopped", "event", "server.stop_failed", "error", err)
		os.Exit(1)
	}
}

func run(args []string) (result error) {
	options, err := config.LoadWeb(args, os.Getenv)
	if err != nil {
		return err
	}
	if err = updateGuard(options.DataDir); err != nil {
		return err
	}
	logger, err := logging.New(os.Stdout, options.Log, "web")
	if err != nil {
		return err
	}
	slog.SetDefault(logger)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	var resources lifecycle.Stack
	defer func() { result = errors.Join(result, resources.Close()) }()
	manager, err := install.Open(ctx, install.Options{DataDir: options.DataDir, Profile: options.Profile, SecretKey: os.Getenv("APP_SECRET_KEY"), BootstrapToken: os.Getenv("APP_BOOTSTRAP_TOKEN"), AdminPath: os.Getenv("APP_ADMIN_PATH")})
	if err != nil {
		return fmt.Errorf("initialization failed: %w", err)
	}
	resources.Defer("storage", manager.Close)
	_, _, _, profile := manager.Services()
	metadata := runtime.Metadata(profile, options.Deployment)
	logger, err = logging.New(os.Stdout, options.Log, string(profile))
	if err != nil {
		return err
	}
	logger = logger.With("version", metadata.Version)
	slog.SetDefault(logger)
	updater, err := updateService(ctx, options.DataDir, options.Deployment, func() string { _, _, _, p := manager.Services(); return string(p) }, stop)
	if err != nil {
		return err
	}
	metrics := observability.New()
	server := &http.Server{Addr: options.Listen, Handler: httpadapter.New(httpadapter.Config{Updates: updater, Metadata: metadata, Core: bootstrap.Core(), Assets: webassets.FS(), Logger: logger, Install: manager, APIDocs: options.APIDocs, ReadinessTimeout: options.ReadinessTimeout, Metrics: metrics}), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
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
	workerCtx, stopWorker := context.WithCancel(ctx)
	mailDone := make(chan struct{})
	go func() {
		defer close(mailDone)
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		fileTicker := time.NewTicker(time.Minute)
		defer fileTicker.Stop()
		for {
			select {
			case <-workerCtx.Done():
				return
			case <-fileTicker.C:
				if fs := manager.Files(); fs != nil {
					cleanupCtx, cancel := context.WithTimeout(workerCtx, 30*time.Second)
					if e := fs.Cleanup(cleanupCtx); e != nil && workerCtx.Err() == nil {
						logger.Warn("file cleanup unavailable", "event", "files.cleanup_unavailable")
					}
					cancel()
				}
			case <-ticker.C:
				if service := manager.Mail(); service != nil {
					if err := service.Tick(workerCtx, int(time.Now().Unix())); err != nil && workerCtx.Err() == nil {
						logger.Warn("mail worker unavailable", "event", "mail.worker_unavailable")
					}
				}
			}
		}
	}()
	resources.Defer("mail worker", func() error { stopWorker(); <-mailDone; return nil })
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
