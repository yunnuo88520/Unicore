// Author: yunnuo <ymz@ebox.vip>
// Description: Business migrations have an independent ledger so local profiles never run platform migrations.
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
	data, err := migrations.Files.ReadFile(s.Dialect + "/business/0001_notes.sql")
	if err != nil {
		return err
	}
	digest := sha256.Sum256(data)
	checksum := hex.EncodeToString(digest[:])
	var old string
	err = s.DB.QueryRowContext(ctx, "SELECT checksum FROM business_migrations WHERE version=1").Scan(&old)
	if err == nil {
		if old != checksum {
			return fmt.Errorf("business migration checksum mismatch")
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var lines []string
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "--") {
			lines = append(lines, line)
		}
	}
	for _, statement := range strings.Split(strings.Join(lines, "\n"), ";") {
		if strings.TrimSpace(statement) != "" {
			if _, err = tx.ExecContext(ctx, statement); err != nil {
				return err
			}
		}
	}
	if _, err = s.Exec(ctx, tx, "INSERT INTO business_migrations(version,checksum) VALUES(1,?)", checksum); err != nil {
		return err
	}
	return tx.Commit()
}
