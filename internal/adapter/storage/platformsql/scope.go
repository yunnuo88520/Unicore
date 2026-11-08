// Author: yunnuo <ymz@ebox.vip>
// Description: Shared account storage for all workspace surfaces.
package platformsql

import (
	"context"
	"database/sql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
)

func (r *Repository) roleID() string { return "user" }
func (r *Repository) row(ctx context.Context, q sqlstore.Runner, query string, args ...any) *sql.Row {
	return r.Store.Row(ctx, q, query, args...)
}
func (r *Repository) rows(ctx context.Context, q sqlstore.Runner, query string, args ...any) (*sql.Rows, error) {
	return r.Store.Rows(ctx, q, query, args...)
}
func (r *Repository) exec(ctx context.Context, q sqlstore.Runner, query string, args ...any) (sql.Result, error) {
	return r.Store.Exec(ctx, q, query, args...)
}
