// Author: yunnuo <ymz@ebox.vip>
// Description: Inspect ownership before migrations can modify a pre-existing database.
package sqlstore

import (
	"context"
	"errors"
)

// PostgreSQL installation owns public only; reject other user schemas so a reset
// cannot silently leave existing application data outside its declared scope.
func (s *Store) InstallationScope(ctx context.Context) error {
	if s.Dialect != "postgres" {
		return nil
	}
	var count int
	if err := s.Row(ctx, s.DB, `SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name NOT IN ('public','information_schema') AND left(schema_name,3) <> 'pg_'`).Scan(&count); err != nil {
		return err
	}
	if count != 0 {
		return errors.New("installer requires a dedicated public schema")
	}
	return nil
}

func (s *Store) TableCount(ctx context.Context) (int, error) {
	query := `SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'`
	if s.Dialect == "postgres" {
		query = `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=current_schema()`
	}
	if s.Dialect == "mysql" {
		query = `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()`
	}
	var count int
	err := s.Row(ctx, s.DB, query).Scan(&count)
	return count, err
}
func (s *Store) HasInstallationTable(ctx context.Context) (bool, error) {
	query := `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='install_state'`
	if s.Dialect == "postgres" {
		query = `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='install_state'`
	}
	if s.Dialect == "mysql" {
		query = `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='install_state'`
	}
	var count int
	err := s.Row(ctx, s.DB, query).Scan(&count)
	return count == 1, err
}
