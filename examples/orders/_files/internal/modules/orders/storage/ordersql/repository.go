// Author: yunnuo <ymz@ebox.vip>
// Description: Order persistence with server-side visibility predicates and optimistic transitions.
package ordersql

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	coredomain "github.com/yunnuo/unicore/internal/domain"
	coreusecase "github.com/yunnuo/unicore/internal/usecase"
	"github.com/yunnuo/unicore/internal/modules/orders/domain"
	"github.com/yunnuo/unicore/internal/modules/orders/usecase"
)

type Repository struct {
	Store *sqlstore.Store
}

const columns = "id,owner_id,agent_id,title,amount_cents,status,version,created_at,updated_at"

func scanOrder(rows *sql.Rows) (contracts.OrderEntry, error) {
	var entry contracts.OrderEntry
	var agent sql.NullString
	if err := rows.Scan(&entry.ID, &entry.OwnerID, &agent, &entry.Title, &entry.AmountCents, &entry.Status, &entry.Version, &entry.CreatedAt, &entry.UpdatedAt); err != nil {
		return entry, err
	}
	if agent.Valid {
		entry.AgentID = &agent.String
	}
	return entry, nil
}

func (r *Repository) ListOwn(ctx context.Context, ownerID string, page int) (contracts.OrderList, error) {
	const size = 20
	result := contracts.OrderList{Items: []contracts.OrderEntry{}, Page: page, PageSize: size}
	offset := coredomain.PageOffset(page, size)
	var count int
	if err := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_app_orders WHERE owner_id=?", ownerID).Scan(&count); err != nil {
		return result, err
	}
	result.Total = count
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT "+columns+" FROM unicore_app_orders WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", ownerID, size, offset)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		entry, err := scanOrder(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, entry)
	}
	return result, rows.Err()
}

func (r *Repository) ListManaged(ctx context.Context, agentID string, scope usecase.HandleScope, page int) (contracts.OrderList, error) {
	const size = 20
	result := contracts.OrderList{Items: []contracts.OrderEntry{}, Page: page, PageSize: size}
	where := "agent_id=?"
	args := []any{agentID}
	if scope.All {
		where = "1=1"
		args = nil
	} else if len(scope.OwnerIDs) > 0 {
		where = "(agent_id=? OR owner_id IN (" + placeholders(len(scope.OwnerIDs)) + "))"
		args = append(args, anySlice(scope.OwnerIDs)...)
	}
	var count int
	if err := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_app_orders WHERE "+where, args...).Scan(&count); err != nil {
		return result, err
	}
	result.Total = count
	offset := coredomain.PageOffset(page, size)
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT "+columns+" FROM unicore_app_orders WHERE "+where+" ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", append(args, size, offset)...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		entry, err := scanOrder(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, entry)
	}
	return result, rows.Err()
}

func (r *Repository) Read(ctx context.Context, id, actorID string, scope usecase.HandleScope) (contracts.OrderEntry, error) {
	row := r.Store.Row(ctx, r.Store.DB, "SELECT "+columns+" FROM unicore_app_orders WHERE id=? AND (owner_id=? OR agent_id=? OR ?)", id, actorID, actorID, scope.All)
	entry, err := scanRow(row)
	if errors.Is(err, sql.ErrNoRows) && scopeContains(r, ctx, id, scope) {
		row = r.Store.Row(ctx, r.Store.DB, "SELECT "+columns+" FROM unicore_app_orders WHERE id=?", id)
		entry, err = scanRow(row)
	}
	return entry, err
}

func scanRow(row *sql.Row) (contracts.OrderEntry, error) {
	var entry contracts.OrderEntry
	var agent sql.NullString
	err := row.Scan(&entry.ID, &entry.OwnerID, &agent, &entry.Title, &entry.AmountCents, &entry.Status, &entry.Version, &entry.CreatedAt, &entry.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		// A missing or invisible row reads as the shared not-found: tampered
		// ids never confirm existence and never leak as server errors.
		return entry, coreusecase.ErrEntityNotFound
	}
	if err != nil {
		return entry, err
	}
	if agent.Valid {
		entry.AgentID = &agent.String
	}
	return entry, nil
}

func scopeContains(r *Repository, ctx context.Context, id string, scope usecase.HandleScope) (contains bool) {
	if scope.All || len(scope.OwnerIDs) == 0 {
		return scope.All
	}
	var owner string
	if err := r.Store.Row(ctx, r.Store.DB, "SELECT owner_id FROM unicore_app_orders WHERE id=?", id).Scan(&owner); err != nil {
		return false
	}
	return scope.Contains(owner)
}

func (r *Repository) Create(ctx context.Context, ownerID string, input contracts.OrderCreateInput) (contracts.OrderEntry, error) {
	id := coredomain.NewEntity(time.Now()).ID
	now := time.Now().Unix()
	agent := any(nil)
	if input.AgentID != nil {
		agent = *input.AgentID
	}
	if _, err := r.Store.Exec(ctx, r.Store.DB, "INSERT INTO unicore_app_orders(id,owner_id,agent_id,title,amount_cents,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)", id, ownerID, agent, input.Title, input.AmountCents, domain.StatusOpen, now, now); err != nil {
		return contracts.OrderEntry{}, err
	}
	return r.Read(ctx, id, ownerID, usecase.HandleScope{All: true})
}

// Transition re-applies the visibility predicate inside the UPDATE so a race
// or a tampered id resolves to not found instead of a crossed boundary.
func (r *Repository) Transition(ctx context.Context, id, actorID string, scope usecase.HandleScope, to string, version int) (contracts.OrderEntry, error) {
	visible := "(owner_id=? OR agent_id=?)"
	args := []any{actorID, actorID}
	if scope.All {
		visible = "1=1"
		args = nil
	} else if len(scope.OwnerIDs) > 0 {
		visible = "(owner_id=? OR agent_id=? OR owner_id IN (" + placeholders(len(scope.OwnerIDs)) + "))"
		args = append(args, anySlice(scope.OwnerIDs)...)
	}
	now := time.Now().Unix()
	result, err := r.Store.Exec(ctx, r.Store.DB,
		"UPDATE unicore_app_orders SET status=?,version=version+1,updated_at=? WHERE id=? AND version=? AND "+visible,
		append([]any{to, now, id, version}, args...)...)
	if err != nil {
		return contracts.OrderEntry{}, err
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		// Distinguish a visible stale or terminal order (409) from an
		// invisible or missing one (404): tampered ids never confirm
		// existence and unauthorized actors never learn one exists.
		if _, readErr := r.Read(ctx, id, actorID, scope); errors.Is(readErr, coreusecase.ErrEntityNotFound) {
			return contracts.OrderEntry{}, coreusecase.ErrEntityNotFound
		}
		return contracts.OrderEntry{}, domain.ErrOrderStatus
	}
	return r.Read(ctx, id, actorID, scope)
}

func placeholders(n int) string {
	out := ""
	for i := 0; i < n; i++ {
		if i > 0 {
			out += ","
		}
		out += "?"
	}
	return out
}

func anySlice(values []string) []any {
	out := make([]any, len(values))
	for i, value := range values {
		out[i] = value
	}
	return out
}
