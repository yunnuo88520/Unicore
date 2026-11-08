//go:build desktop || bindings

// Author: yunnuo <ymz@ebox.vip>
// Description: Native Wails v2 shell; the desktop build tag isolates platform dependencies.
package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/yunnuo/unicore/assets/brand"
	"github.com/yunnuo/unicore/assets/theme"
	"github.com/yunnuo/unicore/internal/config"
	"github.com/yunnuo/unicore/internal/logging"
	"github.com/yunnuo/unicore/internal/module"
	notesmodule "github.com/yunnuo/unicore/internal/modules/notes"
	_ "github.com/yunnuo/unicore/internal/modules/notes/desktop"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	desktopassets "github.com/yunnuo/unicore/apps/desktop"
	"github.com/yunnuo/unicore/internal/adapter/desktop"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
	"github.com/yunnuo/unicore/internal/buildinfo"
)

// desktopLogSink outlives runDesktop so the final stop_failed record still
// reaches the log file before the process exits.
var desktopLogSink *logging.FileSink

func main() {
	defer func() {
		if desktopLogSink != nil {
			_ = desktopLogSink.Close()
		}
	}()
	if handled, err := updateHelper(os.Args[1:]); handled {
		if err != nil {
			os.Exit(1)
		}
		return
	}
	if err := runDesktop(); err != nil {
		slog.Error("desktop stopped", "event", "desktop.stop_failed", "error", err)
		showStartupError(err)
		os.Exit(1)
	}
}

func runDesktop() (result error) {
	optionsLog, err := config.Logging(os.Getenv)
	if err != nil {
		return err
	}
	// Binding generation must not initialize or touch real user data.
	bridge := desktop.New(bootstrap.Core())
	// Desktop always keeps durable logs under the data directory; stderr
	// remains attached so dev runs still stream to the console. A broken sink
	// degrades to stderr instead of failing startup.
	var sink *logging.FileSink
	logWriter := io.Writer(os.Stderr)
	if !generatingBindings {
		if directory, err := local.ResolveDir(os.Getenv("APP_DATA_DIR")); err == nil {
			opened, err := logging.OpenFileSink(logging.FileOptions{Dir: filepath.Join(directory, "logs"), MaxAgeDays: optionsLog.MaxAgeDays, MaxSizeMB: optionsLog.MaxSizeMB, MaxTotalMB: optionsLog.MaxTotalMB})
			if err != nil {
				slog.Warn("log file unavailable", "event", "log.file_unavailable", "error", err.Error())
			} else {
				sink = opened
				logWriter = io.MultiWriter(os.Stderr, sink)
			}
		} else {
			slog.Warn("log file unavailable", "event", "log.file_unavailable", "error", err.Error())
		}
	}
	logger, err := logging.New(logWriter, optionsLog, "desktop")
	if err != nil {
		return err
	}
	slog.SetDefault(logger)
	if sink != nil {
		desktopLogSink = sink
		sweepCtx, stopSweep := context.WithCancel(context.Background())
		defer stopSweep()
		sink.Start(sweepCtx, time.Hour)
		sink.SetRetention(func() int { return optionsLog.MaxAgeDays })
	}
	if !generatingBindings {
		if err := updateGuard(); err != nil {
			return err
		}
		store, service, err := local.Open(context.Background(), os.Getenv("APP_DATA_DIR"))
		if err != nil {
			return err
		}
		defer func() { result = errors.Join(result, store.Close()) }()
		module.Register(notesmodule.Module)
	bridge = desktop.NewLocal(bootstrap.Core(), service, store)
	}
	cancelUpdates := func() {}
	defer func() { cancelUpdates() }()
	if err := wails.Run(&options.App{
		OnStartup: func(ctx context.Context) {
			if !generatingBindings {
				var updateCtx context.Context
				updateCtx, cancelUpdates = context.WithCancel(ctx)
				api, e := updateService(updateCtx, func() { wailsruntime.Quit(ctx) })
				if e != nil {
					slog.Error("updates unavailable", "event", "update.configuration_failed")
				} else {
					bridge.SetUpdates(api)
				}
			}
		},
		OnDomReady: func(ctx context.Context) {
			if !generatingBindings {
				updateHealthy()
			}
		},
		OnShutdown: func(ctx context.Context) { cancelUpdates() },
		Title:      theme.Current.Brand.Name, Width: 1280, Height: 840, MinWidth: 375, MinHeight: 600,
		BackgroundColour: nativeBackground(),
		Mac:              &mac.Options{About: &mac.AboutInfo{Title: theme.Current.Brand.Name, Message: "Go + React · yunnuo · ymz@ebox.vip", Icon: brand.AppIcon}},
		Linux:            &linux.Options{Icon: brand.AppIcon, ProgramName: buildinfo.ProductSlug, WebviewGpuPolicy: linux.WebviewGpuPolicyNever},
		AssetServer:      &assetserver.Options{Assets: desktopassets.FS()},
		Bind:             []interface{}{bridge},
	}); err != nil {
		return err
	}
	return nil
}

func nativeBackground() *options.RGBA {
	value, _ := strconv.ParseUint(theme.Current.Light["bg"][1:], 16, 24)
	return &options.RGBA{R: uint8(value >> 16), G: uint8(value >> 8), B: uint8(value), A: 255}
}
