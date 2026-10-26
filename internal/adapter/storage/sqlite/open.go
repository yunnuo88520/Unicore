// Author: yunnuo <ymz@ebox.vip>
// Description: Pure-Go SQLite, WAL and a single bounded connection for local products.
package sqlite

import (
	"context"
	"database/sql"
	"net/url"
	"os"
	"path/filepath"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	_ "modernc.org/sqlite"
)

func Open(ctx context.Context, path string) (*sqlstore.Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	_ = file.Close()
	u := url.URL{Scheme: "file", Path: filepath.ToSlash(path)}
	db, err := sql.Open("sqlite", u.String()+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
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
