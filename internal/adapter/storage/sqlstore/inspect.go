// Author: yunnuo <ymz@ebox.vip>
// Description: Inspect ownership before migrations can modify a pre-existing database.
package sqlstore

import "context"

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
