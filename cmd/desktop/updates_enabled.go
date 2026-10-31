//go:build (desktop || bindings) && updater

// Author: yunnuo <ymz@ebox.vip>
// Description: Native lifecycle integration, without an HTTP server or platform identity.
package main

import (
	"context"
	"github.com/yunnuo/unicore/assets/theme"
	"github.com/yunnuo/unicore/internal/bootstrap/updating"
	"github.com/yunnuo/unicore/internal/updateport"
	"os"
	"path/filepath"
)

func updateDirectory() string {
	if p := os.Getenv("APP_DATA_DIR"); p != "" {
		p, _ = filepath.Abs(p)
		return p
	}
	base, _ := os.UserConfigDir()
	return filepath.Join(base, theme.Current.Brand.Name, "desktop")
}
func updateHelper(args []string) (bool, error) { return updating.Helper(args) }
func updateGuard() error                       { return updating.Guard(updateDirectory()) }
func updateHealthy()                           { updating.Healthy(updateDirectory(), "desktop") }
func updateService(ctx context.Context, stop func()) (updateport.API, error) {
	return updating.New(ctx, updateDirectory(), "native", func() string { return "desktop" }, stop)
}
