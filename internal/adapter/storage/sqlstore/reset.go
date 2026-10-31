// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit installer-only reset of tables/views in a dedicated, uninstalled database.
package sqlstore

import (
	"context"
	"strings"
	"time"
)

func quoted(name, quote string) string {
	return quote + strings.ReplaceAll(name, quote, quote+quote) + quote
}

// Reset is called only after bootstrap authorization, absence of an installation
// marker and an exact target-name confirmation. No startup path calls it.
func (s *Store) Reset(ctx context.Context) error {
	conn, err := s.DB.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if s.Dialect == "postgres" {
		tx, err := conn.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()
		// PostgreSQL installer connections are scoped to public, including legacy DSNs.
		if _, err = tx.ExecContext(ctx, `DROP SCHEMA IF EXISTS public CASCADE`); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `CREATE SCHEMA public`); err != nil {
			return err
		}
		return tx.Commit()
	}
	disable, enable := "PRAGMA foreign_keys=OFF", "PRAGMA foreign_keys=ON"
	query, quote := `SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'view' THEN 0 ELSE 1 END`, `"`
	if s.Dialect == "mysql" {
		disable, enable = "SET FOREIGN_KEY_CHECKS=0", "SET FOREIGN_KEY_CHECKS=1"
		query, quote = `SELECT TABLE_NAME,CASE TABLE_TYPE WHEN 'VIEW' THEN 'view' ELSE 'table' END FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY CASE TABLE_TYPE WHEN 'VIEW' THEN 0 ELSE 1 END`, "`"
	}
	if _, err = conn.ExecContext(ctx, disable); err != nil {
		return err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_, _ = conn.ExecContext(cleanup, enable)
	}()
	rows, err := conn.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	type object struct{ name, kind string }
	objects := []object{}
	for rows.Next() {
		var item object
		if err = rows.Scan(&item.name, &item.kind); err != nil {
			break
		}
		objects = append(objects, item)
	}
	rowsErr := rows.Err()
	_ = rows.Close()
	if err != nil {
		return err
	}
	if rowsErr != nil {
		return rowsErr
	}
	for _, item := range objects {
		kind := "TABLE"
		if item.kind == "view" {
			kind = "VIEW"
		}
		if _, err = conn.ExecContext(ctx, "DROP "+kind+" IF EXISTS "+quoted(item.name, quote)); err != nil {
			return err
		}
	}
	_, err = conn.ExecContext(ctx, enable)
	return err
}
