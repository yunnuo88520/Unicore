// Author: yunnuo <ymz@ebox.vip>
// Description: Additive personal-center migration on the existing runtime ledger.
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

func (s *Store) personalSchema(ctx context.Context) error {
	data, err := migrations.Files.ReadFile(s.Dialect + "/0014_personal_center.sql")
	if err != nil {
		return err
	}
	sum := sha256.Sum256(data)
	checksum := hex.EncodeToString(sum[:])
	var previous string
	err = s.Row(ctx, s.DB, "SELECT checksum FROM unicore_schema_migrations WHERE version=14").Scan(&previous)
	if err == nil {
		if previous != checksum {
			return fmt.Errorf("migration 14 checksum mismatch")
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
			if _, err = s.Exec(ctx, tx, statement); err != nil {
				return err
			}
		}
	}
	if _, err = s.Exec(ctx, tx, "INSERT INTO unicore_schema_migrations(version,checksum) VALUES(14,?)", checksum); err != nil {
		return err
	}
	return tx.Commit()
}
