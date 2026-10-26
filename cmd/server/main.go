// Author: yunnuo <ymz@ebox.vip>
// Description: Development Web composition root, loopback by default.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	webassets "github.com/yunnuo/unicore/apps/web"
	httpadapter "github.com/yunnuo/unicore/internal/adapter/http"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/runtime"
)

func main() {
	listen := flag.String("listen", env("APP_LISTEN", "127.0.0.1:8080"), "HTTP listen address (M1 is for local development)")
	profileFlag := flag.String("profile", env("APP_PROFILE", runtime.DefaultWebProfile), "web-platform or web-standalone")
	flag.Parse()
	profile, err := runtime.ParseWebProfile(*profileFlag)
	if err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
	deployment := env("APP_DEPLOYMENT_KIND", "development")
	if deployment != "development" && deployment != "tar" && deployment != "docker" {
		slog.Error("invalid deployment kind")
		os.Exit(1)
	}
	metadata := runtime.Metadata(profile, deployment)
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "unicore", "profile", profile, "version", metadata.Version)
	server := &http.Server{
		Addr:              *listen,
		Handler:           httpadapter.New(httpadapter.Config{Metadata: metadata, Core: bootstrap.Core(), Assets: webassets.FS(), Logger: logger}),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	logger.Info("M1 development server started", "event", "server.start", "address", *listen, "authentication", false)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
