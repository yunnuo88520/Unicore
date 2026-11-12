// Author: yunnuo <ymz@ebox.vip>
// Description: Installer-generated connections preserve database tool scope and TLS semantics.
package maintenance

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
)

func TestInstallerConnectionsReachBackupAndRestoreTools(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX tool stub; native Windows utilities require target-system verification")
	}
	directory := t.TempDir()
	for _, tool := range []string{"pg_dump", "psql", "mysqldump", "mysql"} {
		if err := os.WriteFile(filepath.Join(directory, tool), []byte("#!/bin/sh\nprintf '%s\\n' \"$PGSSLMODE\" \"$PGDATABASE\" \"$@\" > \"$UNICORE_TOOL_CAPTURE\"\n"), 0700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PATH", directory+string(os.PathListSeparator)+os.Getenv("PATH"))
	capture := filepath.Join(directory, "capture")
	t.Setenv("UNICORE_TOOL_CAPTURE", capture)
	host, name, user, password := "127.0.0.1", "fixture", "fixture", "synthetic-only"
	for _, driver := range []string{"postgres", "mysql"} {
		for _, tls := range []bool{false, true} {
			input := contracts.DatabaseInput{Driver: driver, Host: &host, Name: &name, Username: &user, Password: &password, Tls: &tls}
			dsn, _, err := webdb.Resolve(input)
			if err != nil {
				t.Fatal(err)
			}
			for _, restore := range []bool{false, true} {
				if err = runDatabaseTool(context.Background(), driver, dsn, "", restore, strings.NewReader(""), io.Discard); err != nil {
					t.Fatalf("%s TLS=%v restore=%v: %v", driver, tls, restore, err)
				}
				raw, err := os.ReadFile(capture)
				if err != nil {
					t.Fatal(err)
				}
				expected := "disable\nfixture\n"
				if tls {
					expected = "require\nfixture\n"
				}
				if driver == "mysql" {
					expected = "--ssl-mode=DISABLED"
					if tls {
						expected = "--ssl-mode=REQUIRED"
					}
				}
				if !strings.Contains(string(raw), expected) {
					t.Fatalf("%s: unexpected tool parameters: %s", driver, raw)
				}
			}
		}
	}
	for _, query := range []string{"search_path=other", "search_path=public&search_path=other", "options=-csearch_path=other"} {
		err := runDatabaseTool(context.Background(), "postgres", "postgres://fixture@127.0.0.1/fixture?"+query, "", false, nil, io.Discard)
		if err == nil || !strings.Contains(err.Error(), "unsupported PostgreSQL") {
			t.Fatalf("unsafe option accepted: %s (%v)", query, err)
		}
	}
}
