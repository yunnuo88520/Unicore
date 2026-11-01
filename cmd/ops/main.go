// Author: yunnuo <ymz@ebox.vip>
// Description: Offline maintenance is separate from the database-free business CLI.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/maintenance"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) < 2 || os.Args[1] == "--help" || os.Args[1] == "-h" {
		fmt.Fprintf(os.Stdout, "%s backup|verify|restore|version; append --help to a command. Offline backups require a stopped instance and UNICORE_BACKUP_PASSPHRASE.\n", buildinfo.OpsCommandName)
		return nil
	}
	if os.Args[1] == "version" {
		return json.NewEncoder(os.Stdout).Encode(map[string]string{"version": buildinfo.Version, "commit": buildinfo.Commit})
	}
	flags := flag.NewFlagSet(os.Args[1], flag.ContinueOnError)
	data := flags.String("data-dir", "", "instance data directory (restore destination must not exist)")
	input := flags.String("input", "", "encrypted .tar.gz.age backup")
	output := flags.String("output", "", "new encrypted backup outside data-dir")
	confirm := flags.String("confirm-database", "", "exact name of empty restore database")
	base := flags.String("base-url", "", "new HTTP(S) origin for restored instance")
	tools := flags.String("database-tools-container", "", "optional explicit PostgreSQL/MySQL container for matching native dump/client tools")
	max := flags.Int64("max-bytes", 1<<40, "maximum extracted payload bytes")
	if err := flags.Parse(os.Args[2:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	password := os.Getenv("UNICORE_BACKUP_PASSPHRASE")
	if len(password) < 12 {
		return errors.New("set UNICORE_BACKUP_PASSPHRASE to at least 12 characters")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	var m maintenance.Manifest
	var err error
	switch os.Args[1] {
	case "backup":
		if *data == "" || *output == "" {
			return errors.New("backup requires --data-dir and --output")
		}
		m, err = maintenance.Backup(ctx, maintenance.BackupOptions{DataDir: *data, Output: *output, Password: password, ExternalKey: os.Getenv("APP_SECRET_KEY"), ToolContainer: *tools})
	case "verify":
		if *input == "" {
			return errors.New("verify requires --input")
		}
		m, err = maintenance.Verify(*input, password, *max)
	case "restore":
		if *data == "" || *input == "" {
			return errors.New("restore requires --data-dir and --input")
		}
		m, err = maintenance.Restore(ctx, maintenance.RestoreOptions{DataDir: *data, Input: *input, Password: password, DatabaseDSN: os.Getenv("UNICORE_RESTORE_DATABASE_DSN"), ConfirmDatabase: *confirm, BaseURL: *base, ToolContainer: *tools, MaxBytes: *max})
	default:
		return errors.New("unknown operation; use backup, verify or restore")
	}
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "ok", "operation": os.Args[1], "snapshot": m.Snapshot, "profile": m.Profile, "driver": m.Driver, "schema": m.Schema, "business_schema": m.BusinessSchema, "files": len(m.Files), "cloud_objects": len(m.Objects)})
}
