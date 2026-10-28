//go:build desktop || bindings

// Author: yunnuo <ymz@ebox.vip>
// Description: Native Wails v2 shell; the desktop build tag isolates platform dependencies.
package main

import (
	"context"
	"errors"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/yunnuo/unicore/assets/brand"
	"github.com/yunnuo/unicore/assets/theme"
	"github.com/yunnuo/unicore/internal/config"
	"github.com/yunnuo/unicore/internal/logging"
	"log/slog"
	"os"
	"strconv"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	desktopassets "github.com/yunnuo/unicore/apps/desktop"
	"github.com/yunnuo/unicore/internal/adapter/desktop"
	"github.com/yunnuo/unicore/internal/adapter/storage/notessql"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
	"github.com/yunnuo/unicore/internal/usecase"
)

func main() {
	if err := runDesktop(); err != nil {
		slog.Error("desktop stopped", "event", "desktop.stop_failed", "error", err)
		os.Exit(1)
	}
}

func runDesktop() (result error) {
	optionsLog, err := config.Logging(os.Getenv)
	if err != nil {
		return err
	}
	logger, err := logging.New(os.Stderr, optionsLog, "desktop")
	if err != nil {
		return err
	}
	slog.SetDefault(logger)
	// Binding generation must not initialize or touch real user data.
	bridge := desktop.New(bootstrap.Core())
	if !generatingBindings {
		store, service, err := local.Open(context.Background(), os.Getenv("APP_DATA_DIR"))
		if err != nil {
			return err
		}
		defer func() { result = errors.Join(result, store.Close()) }()
		bridge = desktop.NewLocal(bootstrap.Core(), service, &usecase.Notes{Repo: &notessql.Repository{Store: store}})
	}
	if err := wails.Run(&options.App{
		Title: theme.Current.Brand.Name, Width: 1280, Height: 840, MinWidth: 375, MinHeight: 600,
		BackgroundColour: nativeBackground(),
		Mac:              &mac.Options{About: &mac.AboutInfo{Title: theme.Current.Brand.Name, Message: "Go + React · yunnuo · ymz@ebox.vip", Icon: brand.AppIcon}},
		Linux:            &linux.Options{Icon: brand.AppIcon, ProgramName: "unicore", WebviewGpuPolicy: linux.WebviewGpuPolicyNever},
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
