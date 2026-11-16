//go:build (desktop || bindings) && !darwin

// Author: yunnuo <ymz@ebox.vip>
// Description: Notification-area tray for Windows/Linux: restore the hidden window or quit for real.
package main

import (
	"context"
	"runtime"
	"sync/atomic"

	"github.com/energye/systray"
	"github.com/yunnuo/unicore/assets/brand"
	"github.com/yunnuo/unicore/assets/theme"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var trayStarted atomic.Bool

// startTray launches the notification-area icon once. With HideWindowOnClose
// the close button only hides the window, so the tray is the way back on
// Windows/Linux; macOS restores via the Dock and never reaches this file.
func startTray(ctx context.Context) {
	if !trayStarted.CompareAndSwap(false, true) {
		return
	}
	go systray.Run(func() { trayReady(ctx) }, func() {})
}

// stopTray releases the tray icon from the normal shutdown chain.
func stopTray() {
	if trayStarted.Load() {
		systray.Quit()
	}
}

func trayReady(ctx context.Context) {
	// Windows LoadImage only reads .ico files; the Linux tray decodes PNG itself.
	icon := brand.AppIcon
	if runtime.GOOS == "windows" {
		icon = brand.AppIconICO
	}
	systray.SetIcon(icon)
	systray.SetTooltip(theme.Current.Brand.Name)
	restore := func() {
		wailsruntime.Show(ctx)
		wailsruntime.WindowShow(ctx)
	}
	systray.SetOnClick(func(systray.IMenu) { restore() })
	open := systray.AddMenuItem(trayOpenLabel(), trayOpenLabel())
	open.Click(restore)
	quit := systray.AddMenuItem(trayQuitLabel(), trayQuitLabel())
	quit.Click(func() { wailsruntime.Quit(ctx) })
}
