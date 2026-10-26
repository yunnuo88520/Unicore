//go:build desktop || bindings

// Author: yunnuo <ymz@ebox.vip>
// Description: Native Wails v2 shell; the desktop build tag isolates platform dependencies.
package main

import (
	"context"
	"log"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	desktopassets "github.com/yunnuo/unicore/apps/desktop"
	"github.com/yunnuo/unicore/internal/adapter/desktop"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
)

func main() {
	// Binding generation must not initialize or touch real user data.
	bridge := desktop.New(bootstrap.Core())
	if !generatingBindings {
		store, service, err := local.Open(context.Background(), os.Getenv("APP_DATA_DIR"))
		if err != nil {
			log.Fatal("cannot initialize desktop storage: ", err)
		}
		defer store.Close()
		bridge = desktop.NewLocal(bootstrap.Core(), service)
	}
	if err := wails.Run(&options.App{
		Title: "Unicore", Width: 1280, Height: 840, MinWidth: 375, MinHeight: 600,
		BackgroundColour: &options.RGBA{R: 247, G: 248, B: 250, A: 255},
		AssetServer:      &assetserver.Options{Assets: desktopassets.FS()},
		Bind:             []interface{}{bridge},
	}); err != nil {
		log.Fatal(err)
	}
}
