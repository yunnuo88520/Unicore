// Author: yunnuo <ymz@ebox.vip>
// Description: Data-preserving, fixed unicore_ table namespace for framework databases.
package sqlstore

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/yunnuo/unicore/migrations"
)

func (s *Store) frameworkLedger(ctx context.Context) (string, bool, error) {
	legacy, err := s.hasTable(ctx, "schema_migrations")
	if err != nil {
		return "", false, err
	}
	prefixed, err := s.hasTable(ctx, "unicore_schema_migrations")
	if err != nil {
		return "", false, err
	}
	if legacy && prefixed {
		return "", false, errors.New("conflicting framework migration ledgers")
	}
	if prefixed {
		return "unicore_schema_migrations", true, nil
	}
	return "schema_migrations", false, nil
}

var renameTable = regexp.MustCompile(`(?:ALTER TABLE |RENAME TABLE |,\s*)([a-z_]+)(?: RENAME)? TO unicore_([a-z_]+)`)

var legacySQLToken = regexp.MustCompile(`'(?:''|[^'])*'|[A-Za-z_][A-Za-z0-9_]*`)
var frameworkTables = func() map[string]string {
	// The immutable rename SQL is also the finite list of framework-owned names.
	data, err := migrations.Files.ReadFile("sqlite/0013_prefix_platform.sql")
	if err != nil {
		panic(err)
	}
	names := map[string]string{}
	for _, pair := range renameTable.FindAllStringSubmatch(string(data), -1) {
		names[pair[1]] = "unicore_" + pair[2]
	}
	return names
}()

// Preserve the legacy executor's interrupted-DDL retry behavior after a rename.
// Only trusted historical SQL identifiers are mapped; string data and arbitrary
// business table names are untouched. Raw source bytes still determine checksums.
func prefixedLegacySQL(statement string) string {
	return legacySQLToken.ReplaceAllStringFunc(statement, func(token string) string {
		if name, ok := frameworkTables[token]; ok {
			return name
		}
		return token
	})
}

func (s *Store) prefixSchema(ctx context.Context, platform bool) error {
	kind := "core"
	if platform {
		kind = "platform"
	}
	data, err := migrations.Files.ReadFile(s.Dialect + "/0013_prefix_" + kind + ".sql")
	if err != nil {
		return err
	}
	digest := sha256.Sum256(data)
	checksum := hex.EncodeToString(digest[:])
	_, prefixed, err := s.frameworkLedger(ctx)
	if err != nil {
		return err
	}
	if prefixed {
		var previous string
		err = s.Row(ctx, s.DB, "SELECT checksum FROM unicore_schema_migrations WHERE version=13").Scan(&previous)
		if err == nil {
			if previous != checksum {
				return errors.New("framework prefix migration checksum mismatch")
			}
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	// Before any rename, reject collisions or mixed schemas. MySQL executes one
	// atomic multi-table RENAME; if it committed before the ledger write, every
	// target must be present before that completed operation can be recorded.
	pairs := renameTable.FindAllStringSubmatch(string(data), -1)
	if len(pairs) == 0 {
		return errors.New("empty prefix migration")
	}
	for _, pair := range pairs {
		old, err := s.hasTable(ctx, pair[1])
		if err != nil {
			return err
		}
		current, err := s.hasTable(ctx, "unicore_"+pair[2])
		if err != nil {
			return err
		}
		if pair[1] != pair[2] || old == current || old == prefixed {
			return fmt.Errorf("framework table namespace conflict: %s", pair[1])
		}
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if !prefixed {
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
			if _, err = tx.ExecContext(ctx, statement); err != nil {
				return err
			}
		}
	}
	if _, err = s.Exec(ctx, tx, "INSERT INTO unicore_schema_migrations(version,checksum) VALUES(13,?)", checksum); err != nil {
		return err
	}
	return tx.Commit()
}
