// Author: yunnuo <ymz@ebox.vip>
// Description: Optional source-build maintenance tool; user Web packages use the unified executable.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/maintenance"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	return maintenance.Command(ctx, os.Args[1:], os.Stdout, os.Getenv, buildinfo.OpsCommandName)
}
