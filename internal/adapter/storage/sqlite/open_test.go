// Author: yunnuo <ymz@ebox.vip>
// Description: Native file URI regressions and real SQLite persistence at escaped filesystem paths.
package sqlite

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileURIHasNoDriveAuthority(t *testing.T) {
	for _, path := range []string{"C:/Users/开发者/App Data/unicore #1%&.db", "D:/data/unicore.db", "/tmp/数据 #?%&/unicore.db"} {
		t.Run(path, func(t *testing.T) {
			u, err := url.Parse(fileURI(path))
			if err != nil {
				t.Fatal(err)
			}
			if u.Scheme != "file" || u.Host != "" || u.Opaque != "" || u.RawQuery != "" || u.Fragment != "" || strings.TrimPrefix(u.Path, "/") != strings.TrimPrefix(path, "/") {
				t.Fatal("path was reinterpreted as URI components", u)
			}
		})
	}
}

func TestOpenUsesRequestedFileAndPreservesData(t *testing.T) {
	for _, relative := range []bool{false, true} {
		t.Run(map[bool]string{false: "absolute", true: "relative"}[relative], func(t *testing.T) {
			base := t.TempDir()
			path := filepath.Join(base, "数据 App Data # % &", "unicore #%.db")
			input := path
			if relative {
				t.Chdir(base)
				input, _ = filepath.Rel(base, path)
			}
			ctx := context.Background()
			store, err := Open(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			if _, err = store.DB.ExecContext(ctx, "CREATE TABLE probe(value TEXT); INSERT INTO probe VALUES('preserved')"); err != nil {
				t.Fatal(err)
			}
			for pragma, want := range map[string]string{"journal_mode": "wal", "busy_timeout": "5000", "foreign_keys": "1"} {
				var got string
				if err = store.DB.QueryRowContext(ctx, "PRAGMA "+pragma).Scan(&got); err != nil || got != want {
					t.Fatal(pragma, got, err)
				}
			}
			if err = store.Close(); err != nil {
				t.Fatal(err)
			}
			raw, err := os.ReadFile(path)
			if err != nil || !strings.HasPrefix(string(raw), "SQLite format 3\x00") {
				t.Fatal("database was not written at the requested path", err)
			}
			reopened, err := Open(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			defer reopened.Close()
			var value string
			if err = reopened.DB.QueryRowContext(ctx, "SELECT value FROM probe").Scan(&value); err != nil || value != "preserved" {
				t.Fatal(value, err)
			}
		})
	}
}
