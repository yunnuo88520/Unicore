// Author: yunnuo <ymz@ebox.vip>
// Description: Shared offline maintenance commands for the Web executable and standalone developer tool.
package maintenance

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"

	"github.com/yunnuo/unicore/internal/buildinfo"
)

// Command runs offline maintenance without opening a running application instance.
func Command(ctx context.Context, args []string, output io.Writer, getenv func(string) string, command string) error {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		fmt.Fprintf(output, "%s backup|verify|restore|version; append --help to a command. Offline backups require a stopped instance and UNICORE_BACKUP_PASSPHRASE.\n", command)
		return nil
	}
	if args[0] == "version" {
		return json.NewEncoder(output).Encode(map[string]string{"version": buildinfo.Version, "commit": buildinfo.Commit})
	}
	flags := flag.NewFlagSet(args[0], flag.ContinueOnError)
	flags.SetOutput(output)
	data := flags.String("data-dir", "", "instance data directory (restore destination must not exist)")
	input := flags.String("input", "", "encrypted .tar.gz.age backup")
	outputPath := flags.String("output", "", "new encrypted backup outside data-dir")
	confirm := flags.String("confirm-database", "", "exact name of empty restore database")
	base := flags.String("base-url", "", "new HTTP(S) origin for restored instance")
	tools := flags.String("database-tools-container", "", "optional explicit PostgreSQL/MySQL container for matching native dump/client tools")
	max := flags.Int64("max-bytes", 1<<40, "maximum extracted payload bytes")
	if err := flags.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	password := getenv("UNICORE_BACKUP_PASSPHRASE")
	if len(password) < 12 {
		return errors.New("set UNICORE_BACKUP_PASSPHRASE to at least 12 characters")
	}
	var m Manifest
	var err error
	switch args[0] {
	case "backup":
		if *data == "" || *outputPath == "" {
			return errors.New("backup requires --data-dir and --output")
		}
		m, err = Backup(ctx, BackupOptions{DataDir: *data, Output: *outputPath, Password: password, ExternalKey: getenv("APP_SECRET_KEY"), ToolContainer: *tools})
	case "verify":
		if *input == "" {
			return errors.New("verify requires --input")
		}
		m, err = Verify(*input, password, *max)
	case "restore":
		if *data == "" || *input == "" {
			return errors.New("restore requires --data-dir and --input")
		}
		m, err = Restore(ctx, RestoreOptions{DataDir: *data, Input: *input, Password: password, DatabaseDSN: getenv("UNICORE_RESTORE_DATABASE_DSN"), ConfirmDatabase: *confirm, BaseURL: *base, ToolContainer: *tools, MaxBytes: *max})
	default:
		return errors.New("unknown operation; use backup, verify or restore")
	}
	if err != nil {
		return err
	}
	return json.NewEncoder(output).Encode(map[string]any{"status": "ok", "operation": args[0], "snapshot": m.Snapshot, "profile": m.Profile, "driver": m.Driver, "schema": m.Schema, "business_schema": m.BusinessSchema, "files": len(m.Files), "cloud_objects": len(m.Objects)})
}
