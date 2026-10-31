// Author: yunnuo <ymz@ebox.vip>
// Description: Web-only driver composition; Desktop imports only the SQLite adapter.
package webdb

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlite"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
)

func Open(ctx context.Context, driver, dsn, localPath string) (*sqlstore.Store, error) {
	if driver == "sqlite" {
		return sqlite.Open(ctx, localPath)
	}
	name := "pgx"
	switch driver {
	case "postgres":
	case "mysql":
		name = "mysql"
		config, err := mysql.ParseDSN(dsn)
		if err != nil {
			return nil, errors.New("invalid database configuration")
		}
		config.MultiStatements = false
		config.Timeout = 5 * time.Second
		config.ReadTimeout = 10 * time.Second
		config.WriteTimeout = 10 * time.Second
		dsn = config.FormatDSN()
	default:
		return nil, errors.New("unsupported database driver")
	}
	db, err := sql.Open(name, dsn)
	if err != nil {
		return nil, errors.New("invalid database configuration")
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(3)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err = db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, errors.New("database unavailable")
	}
	return &sqlstore.Store{DB: db, Dialect: driver}, nil
}
