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
	return s.additivePlatformSchema(ctx, 14, "0014_personal_center.sql")
}
func (s *Store) additivePlatformSchema(ctx context.Context, version int, file string) error {
	data, err := migrations.Files.ReadFile(s.Dialect + "/" + file)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(data)
	checksum := hex.EncodeToString(sum[:])
	var previous string
	err = s.Row(ctx, s.DB, "SELECT checksum FROM unicore_schema_migrations WHERE version=?", version).Scan(&previous)
	if err == nil {
		if previous != checksum {
			return fmt.Errorf("migration %d checksum mismatch", version)
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
	if _, err = s.Exec(ctx, tx, "INSERT INTO unicore_schema_migrations(version,checksum) VALUES(?,?)", version, checksum); err != nil {
		return err
	}
	return tx.Commit()
}
