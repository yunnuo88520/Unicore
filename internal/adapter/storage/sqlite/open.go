// Author: yunnuo <ymz@ebox.vip>
// Description: Pure-Go SQLite, WAL and a single bounded connection for local products.
package sqlite

import (
	"context"
	"database/sql"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	_ "modernc.org/sqlite"
)

func Open(ctx context.Context, path string) (*sqlstore.Store, error) {
	path, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	_ = file.Close()
	db, err := sql.Open("sqlite", fileURI(filepath.ToSlash(path))+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err = db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &sqlstore.Store{DB: db, Dialect: "sqlite"}, nil
}

// SQLite requires an empty URI authority. A Windows drive belongs to the path,
// so C:/data/app.db must become file:///C:/data/app.db, never file://C:/data/app.db.
func fileURI(absolutePath string) string {
	if !strings.HasPrefix(absolutePath, "/") {
		absolutePath = "/" + absolutePath
	}
	return (&url.URL{Scheme: "file", Path: absolutePath}).String()
}
