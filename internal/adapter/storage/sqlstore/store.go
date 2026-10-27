// Author: yunnuo <ymz@ebox.vip>
// Description: Thin SQL utilities and framework schema; imports no identity module or driver.
package sqlstore

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/yunnuo/unicore/migrations"
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

// Migrate records each checksum only after all statements succeed. MySQL DDL is
// intentionally retryable; installation is not committed until separate seed DML succeeds.
func (s *Store) Migrate(ctx context.Context, platform bool) error {
	if _, err := s.DB.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum VARCHAR(64) NOT NULL)`); err != nil {
		return err
	}
	files := []string{"0001_framework.sql"}
	if platform {
		files = append(files, "0002_platform.sql", "0003_platform_mail.sql", "0004_email_challenges.sql", "0005_role_management.sql", "0006_oidc.sql", "0007_fixed_roles.sql")
	}
	for index, file := range files {
		data, err := migrations.Files.ReadFile(s.Dialect + "/" + file)
		if err != nil {
			return err
		}
		digest := sha256.Sum256(data)
		checksum := hex.EncodeToString(digest[:])
		var previous string
		err = s.Row(ctx, s.DB, "SELECT checksum FROM schema_migrations WHERE version=?", index+1).Scan(&previous)
		if err == nil {
			if previous != checksum {
				return fmt.Errorf("migration %d checksum mismatch", index+1)
			}
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		tx, err := s.DB.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		body := []string{}
		for _, line := range strings.Split(string(data), "\n") {
			if !strings.HasPrefix(strings.TrimSpace(line), "--") {
				body = append(body, line)
			}
		}
		for _, statement := range strings.Split(strings.Join(body, "\n"), ";") {
			if strings.TrimSpace(statement) == "" {
				continue
			}
			if _, err = s.Exec(ctx, tx, statement); err != nil {
				break
			}
		}
		if err == nil {
			_, err = s.Exec(ctx, tx, "INSERT INTO schema_migrations(version,checksum) VALUES(?,?)", index+1, checksum)
		}
		if err != nil {
			_ = tx.Rollback()
			return err
		}
		if err = tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Installation(ctx context.Context) (profile, instance string, err error) {
	err = s.Row(ctx, s.DB, "SELECT profile,instance_id FROM install_state WHERE id=1").Scan(&profile, &instance)
	return
}

// LockInstallation serializes privilege changes and protects the last active super-admin.
func (s *Store) LockInstallation(ctx context.Context, tx *sql.Tx) error {
	query := "SELECT id FROM install_state WHERE id=1"
	if s.Dialect != "sqlite" {
		query += " FOR UPDATE"
	}
	var id int
	return s.Row(ctx, tx, query).Scan(&id)
}

func (s *Store) ReadSettings(ctx context.Context) (map[string]string, error) {
	rows, err := s.Rows(ctx, s.DB, "SELECT setting_key,setting_value FROM system_settings")
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
		if _, err = s.Exec(ctx, tx, "DELETE FROM system_settings WHERE setting_key=?", key); err != nil {
			return err
		}
		if _, err = s.Exec(ctx, tx, "INSERT INTO system_settings(setting_key,setting_value) VALUES(?,?)", key, value); err != nil {
			return err
		}
	}
	if err = s.Audit(ctx, tx, actor, "settings.updated"); err != nil {
		return err
	}
	return tx.Commit()
}
