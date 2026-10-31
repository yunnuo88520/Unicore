// Author: yunnuo <ymz@ebox.vip>
// Description: Independent business ledger with checksum validation and retryable additive MySQL DDL.
package sqlstore

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"github.com/yunnuo/unicore/migrations"
	"strings"
)

func (s *Store) MigrateBusiness(ctx context.Context) error {
	if _, err := s.DB.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS business_migrations(version INTEGER PRIMARY KEY,checksum VARCHAR(64) NOT NULL)"); err != nil {
		return err
	}
	for index, file := range []string{"0001_notes.sql", "0002_notes_lifecycle.sql"} {
		data, err := migrations.Files.ReadFile(s.Dialect + "/business/" + file)
		if err != nil {
			return err
		}
		digest := sha256.Sum256(data)
		checksum := hex.EncodeToString(digest[:])
		var old string
		err = s.Row(ctx, s.DB, "SELECT checksum FROM business_migrations WHERE version=?", index+1).Scan(&old)
		if err == nil {
			if old != checksum {
				return fmt.Errorf("business migration %d checksum mismatch", index+1)
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
		var lines []string
		for _, line := range strings.Split(string(data), "\n") {
			if !strings.HasPrefix(strings.TrimSpace(line), "--") {
				lines = append(lines, line)
			}
		}
		for _, statement := range strings.Split(strings.Join(lines, "\n"), ";") {
			if strings.TrimSpace(statement) == "" {
				continue
			}
			if s.Dialect == "mysql" && index == 1 {
				var exists int
				err = s.Row(ctx, tx, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='example_notes' AND column_name='deleted_at'").Scan(&exists)
				if err != nil {
					break
				}
				if exists == 1 {
					continue
				}
			}
			if _, err = tx.ExecContext(ctx, statement); err != nil {
				break
			}
		}
		if err == nil {
			_, err = s.Exec(ctx, tx, "INSERT INTO business_migrations(version,checksum) VALUES(?,?)", index+1, checksum)
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
