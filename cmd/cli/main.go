// Author: yunnuo <ymz@ebox.vip>
// Description: Standalone CLI composition root.
package main

import (
	"fmt"
	"github.com/yunnuo/unicore/internal/config"
	"github.com/yunnuo/unicore/internal/logging"
	"log/slog"
	"os"

	cliadapter "github.com/yunnuo/unicore/internal/adapter/cli"
	"github.com/yunnuo/unicore/internal/bootstrap"
)

func main() {
	options, err := config.Logging(os.Getenv)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	logger, err := logging.New(os.Stderr, options, "cli")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	slog.SetDefault(logger)
	if err := cliadapter.New(bootstrap.Core()).Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
