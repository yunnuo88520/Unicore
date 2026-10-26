// Author: yunnuo <ymz@ebox.vip>
// Description: Development Web composition root, loopback by default.
package main

import (
	"context"
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
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/lifecycle"
	"github.com/yunnuo/unicore/internal/runtime"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "unicore")
	slog.SetDefault(logger)
	if err := run(logger); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	listen := flag.String("listen", env("APP_LISTEN", "127.0.0.1:8080"), "HTTP listen address (loopback by default)")
	profileFlag := flag.String("profile", os.Getenv("APP_PROFILE"), "initial web-platform/web-standalone profile; fixed after installation")
	dataDir := flag.String("data-dir", env("APP_DATA_DIR", "data"), "private persistent data directory")
	flag.Parse()
	deployment := env("APP_DEPLOYMENT_KIND", "development")
	if deployment != "development" && deployment != "tar" && deployment != "docker" {
		return fmt.Errorf("invalid deployment kind")
	}
	manager, err := install.Open(context.Background(), install.Options{DataDir: *dataDir, Profile: *profileFlag, SecretKey: os.Getenv("APP_SECRET_KEY"), BootstrapToken: os.Getenv("APP_BOOTSTRAP_TOKEN"), AdminPath: os.Getenv("APP_ADMIN_PATH")})
	if err != nil {
		return fmt.Errorf("initialization failed: %w", err)
	}
	defer manager.Close()
	_, _, _, profile := manager.Services()
	metadata := runtime.Metadata(profile, deployment)
	logger = logger.With("profile", profile, "version", metadata.Version)
	server := &http.Server{
		Addr:              *listen,
		Handler:           httpadapter.New(httpadapter.Config{Metadata: metadata, Core: bootstrap.Core(), Assets: webassets.FS(), Logger: logger, Install: manager}),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return fmt.Errorf("listen failed: %w", err)
	}
	mailDone := make(chan struct{})
	go func() {
		defer close(mailDone)
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if service := manager.Mail(); service != nil {
					if err := service.Tick(ctx, int(time.Now().Unix())); err != nil && ctx.Err() == nil {
						logger.Warn("mail worker unavailable", "event", "mail.worker_unavailable")
					}
				}
			}
		}
	}()
	defer func() { stop(); <-mailDone }()
	logger.Info("server started", "event", "server.start", "address", listener.Addr().String(), "installed", manager.Installed())
	if !manager.Installed() {
		logger.Info("installation credential is available in a restricted file", "event", "install.token_file", "path", manager.TokenPath())
	}
	return lifecycle.ServeHTTP(ctx, server, listener, 5*time.Second)
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
