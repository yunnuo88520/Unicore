//go:build (desktop || bindings) && darwin

// Author: yunnuo <ymz@ebox.vip>
// Description: macOS menu-bar status item: restore the hidden window or quit for real.
package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa
#include <dispatch/dispatch.h>
#include <stdlib.h>
#include "tray_darwin.h"

// The status item must be created on the main thread, which Wails owns for its
// own runloop; the request therefore travels through the main dispatch queue.
extern void unicoreTrayReady(void);
static void trayReadyFire(void *unused) { unicoreTrayReady(); }
static void trayDispatchReady(void) { dispatch_async_f(dispatch_get_main_queue(), NULL, trayReadyFire); }
*/
import "C"

import (
	"context"
	_ "embed"
	"sync/atomic"
	"unsafe"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Monochrome brand mark; AppKit renders it as a template that follows the menu bar.
//
//go:embed menubar-template.png
var trayIcon []byte

var trayContext atomic.Value // context.Context, armed before the status item appears
var trayOpenTitle, trayQuitTitle *C.char

// startTray hands the menu-bar setup to the main queue; see tray_darwin.m.
func startTray(ctx context.Context) {
	trayContext.Store(ctx)
	trayOpenTitle = C.CString(trayOpenLabel())
	trayQuitTitle = C.CString(trayQuitLabel())
	C.trayDispatchReady()
}

// stopTray does nothing: quitting ends the process and the status item with it.
func stopTray() {}

//export unicoreTrayReady
func unicoreTrayReady() {
	C.trayInit((*C.char)(unsafe.Pointer(&trayIcon[0])), C.int(len(trayIcon)), trayOpenTitle, trayQuitTitle)
}

//export unicoreTrayOnOpen
func unicoreTrayOnOpen() {
	if ctx, ok := trayContext.Load().(context.Context); ok && ctx != nil {
		go func() {
			wailsruntime.Show(ctx)
			wailsruntime.WindowShow(ctx)
		}()
	}
}

//export unicoreTrayOnQuit
func unicoreTrayOnQuit() {
	if ctx, ok := trayContext.Load().(context.Context); ok && ctx != nil {
		go wailsruntime.Quit(ctx)
	}
}

// systemLangZh reads the macOS user locale from AppKit (GUI apps carry no POSIX locale env).
func systemLangZh() bool {
	language := C.traySystemLanguage()
	defer C.free(unsafe.Pointer(language))
	return C.GoString(language) == "zh"
}
