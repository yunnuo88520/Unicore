// Author: yunnuo <ymz@ebox.vip>
// Description: Row-lock clause selection per dialect and the SQLite round trip through LockForUpdate.
package sqlstore

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestLockQueryPerDialect(t *testing.T) {
	for _, tc := range []struct{ dialect, want string }{
		{"sqlite", "SELECT 1"},
		{"postgres", "SELECT 1 FOR UPDATE"},
		{"mysql", "SELECT 1 FOR UPDATE"},
	} {
		if got := LockQuery(tc.dialect, "SELECT 1"); got != tc.want {
			t.Errorf("dialect %s: want %q got %q", tc.dialect, tc.want, got)
		}
	}
}

func TestLockForUpdateRequiresExactlyOneRow(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lock.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	store := &Store{DB: db, Dialect: "sqlite"}
	ctx := context.Background()
	if _, err = db.ExecContext(ctx, "CREATE TABLE locks (id INTEGER PRIMARY KEY, label TEXT)"); err != nil {
		t.Fatal(err)
	}
	if _, err = db.ExecContext(ctx, "INSERT INTO locks (id, label) VALUES (1, 'only')"); err != nil {
		t.Fatal(err)
	}
	if err = store.LockForUpdate(ctx, db, "SELECT id FROM locks WHERE id=1"); err != nil {
		t.Fatalf("existing row must lock: %v", err)
	}
	if err = store.LockForUpdate(ctx, db, "SELECT id FROM locks WHERE id=2"); err == nil {
		t.Fatal("missing row must fail the lock")
	}
}
