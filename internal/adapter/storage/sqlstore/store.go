// Author: yunnuo <ymz@ebox.vip>
// Description: Thin SQL utilities and framework schema; imports no identity module or driver.
package sqlstore

import (
	"context"
	"database/sql"
	"sort"
	"strconv"
	"strings"

	"github.com/yunnuo/unicore/internal/audit"
)

type Store struct {
	DB      *sql.DB
	Dialect string
	OnClose func()
}
type Runner interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (s *Store) Bind(query string) string {
	if s.Dialect != "postgres" {
		return query
	}
	index := 0
	return replacePlaceholders(query, &index)
}

func replacePlaceholders(query string, index *int) string {
	var out strings.Builder
	for _, r := range query {
		if r == '?' {
			*index++
			out.WriteByte('$')
			out.WriteString(strconv.Itoa(*index))
		} else {
			out.WriteRune(r)
		}
	}
	return out.String()
}
func (s *Store) Exec(ctx context.Context, r Runner, q string, args ...any) (sql.Result, error) {
	return r.ExecContext(ctx, s.Bind(q), args...)
}
func (s *Store) Row(ctx context.Context, r Runner, q string, args ...any) *sql.Row {
	return r.QueryRowContext(ctx, s.Bind(q), args...)
}
func (s *Store) Rows(ctx context.Context, r Runner, q string, args ...any) (*sql.Rows, error) {
	return r.QueryContext(ctx, s.Bind(q), args...)
}
func (s *Store) Close() error {
	err := s.DB.Close()
	if s.OnClose != nil {
		s.OnClose()
	}
	return err
}

func (s *Store) Installation(ctx context.Context) (profile, instance string, err error) {
	table, err := s.installationTable(ctx)
	if err != nil {
		return "", "", err
	}
	err = s.Row(ctx, s.DB, "SELECT profile,instance_id FROM "+table+" WHERE id=1").Scan(&profile, &instance)
	return
}

// LockQuery appends a row-lock clause for dialects that support FOR UPDATE.
// SQLite serializes writers database-wide, so the clause stays off there.
// Keep the query single-column and single-row: the lock is held for the
// caller's transaction by reading the row.
func LockQuery(dialect, query string) string {
	if dialect == "sqlite" {
		return query
	}
	return query + " FOR UPDATE"
}

// LockForUpdate runs query under a dialect-appropriate row lock and requires
// exactly one row, keeping the lock until the caller's transaction ends.
func (s *Store) LockForUpdate(ctx context.Context, exec Runner, query string, args ...any) error {
	var locked any
	return s.Row(ctx, exec, LockQuery(s.Dialect, query), args...).Scan(&locked)
}

// LockInstallation serializes privilege changes and protects the last active super-admin.
func (s *Store) LockInstallation(ctx context.Context, tx *sql.Tx) error {
	return s.LockForUpdate(ctx, tx, "SELECT id FROM unicore_install_state WHERE id=1")
}

func (s *Store) ReadSettings(ctx context.Context) (map[string]string, error) {
	rows, err := s.Rows(ctx, s.DB, "SELECT setting_key,setting_value FROM unicore_system_settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		result[k] = v
	}
	return result, rows.Err()
}

func (s *Store) SaveSettings(ctx context.Context, values map[string]string, actor string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = s.LockInstallation(ctx, tx); err != nil {
		return err
	}
	for key, value := range values {
		if _, err = s.Exec(ctx, tx, "DELETE FROM unicore_system_settings WHERE setting_key=?", key); err != nil {
			return err
		}
		if _, err = s.Exec(ctx, tx, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES(?,?)", key, value); err != nil {
			return err
		}
	}
	action := "settings.updated"
	for key := range values {
		if strings.HasPrefix(key, "mail.template.") {
			action = "mail.template.updated"
		}
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	if metadata, ok := audit.From(ctx); ok && metadata.Detail == "" {
		target := metadata.Target
		if target == "" {
			target = "settings"
		}
		ctx = audit.Target(ctx, target, "fields="+strings.Join(keys, ","))
	}
	if err = s.Audit(ctx, tx, actor, action); err != nil {
		return err
	}
	return tx.Commit()
}
