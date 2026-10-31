// Author: yunnuo <ymz@ebox.vip>
// Description: Fixed identity-table scope shared by account/session/recovery and OIDC transactions.
package platformsql

import (
	"context"
	"database/sql"
	"regexp"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
)

var identityTables = regexp.MustCompile(`\b(users|user_roles|sessions|account_tokens|email_challenges|external_identities|oidc_flows)\b`)
var administratorTables = map[string]string{
	"users": "administrators", "user_roles": "administrator_roles", "sessions": "administrator_sessions",
	"account_tokens": "administrator_account_tokens", "email_challenges": "administrator_email_challenges",
	"external_identities": "administrator_external_identities", "oidc_flows": "administrator_oidc_flows",
}

// Only repository-authored SQL passes here. Identifiers come from this fixed map,
// never from requests; shared settings, audit and mail queues retain their names.
func (r *Repository) scoped(query string) string {
	if !r.Administrators {
		return query
	}
	return identityTables.ReplaceAllStringFunc(query, func(table string) string { return administratorTables[table] })
}
func (r *Repository) roleID() string {
	if r.Administrators {
		return "super_admin"
	}
	return "user"
}
func (r *Repository) exec(ctx context.Context, runner sqlstore.Runner, query string, args ...any) (sql.Result, error) {
	return r.Store.Exec(ctx, runner, r.scoped(query), args...)
}
func (r *Repository) row(ctx context.Context, runner sqlstore.Runner, query string, args ...any) *sql.Row {
	return r.Store.Row(ctx, runner, r.scoped(query), args...)
}
func (r *Repository) rows(ctx context.Context, runner sqlstore.Runner, query string, args ...any) (*sql.Rows, error) {
	return r.Store.Rows(ctx, runner, r.scoped(query), args...)
}
