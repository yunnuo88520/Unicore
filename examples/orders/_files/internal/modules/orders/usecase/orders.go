// Author: yunnuo <ymz@ebox.vip>
// Description: Orders orchestration: the server owns visibility and transitions, never the client.
package usecase

import (
	"context"
	"strings"

	"github.com/yunnuo/unicore/internal/contracts"
	coredomain "github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/modules/orders/domain"
)

// HandleScope carries the caller's resolved data scope for the orders:handle
// point. An unrestricted scope sees every order; a bounded scope adds the
// listed owner ids; the self scope only contributes the agent relationship.
type HandleScope struct {
	All     bool
	OwnerIDs []string
}

func (s HandleScope) Contains(ownerID string) bool {
	if s.All {
		return true
	}
	for _, id := range s.OwnerIDs {
		if id == ownerID {
			return true
		}
	}
	return false
}

type OrderRepository interface {
	// ListOwn returns the caller's personal orders (owner binding).
	ListOwn(ctx context.Context, ownerID string, page int) (contracts.OrderList, error)
	// ListManaged returns orders assigned to the agent plus the scoped ones.
	ListManaged(ctx context.Context, agentID string, scope HandleScope, page int) (contracts.OrderList, error)
	// Read resolves one order when the caller is the owner, the assigned
	// agent or inside the handle scope; otherwise it reports not found, so
	// tampered ids never confirm existence.
	Read(ctx context.Context, id, actorID string, scope HandleScope) (contracts.OrderEntry, error)
	Create(ctx context.Context, ownerID string, input contracts.OrderCreateInput) (contracts.OrderEntry, error)
	// Transition applies the status graph and the version CAS inside one row
	// update; the visibility predicate runs again in the statement.
	Transition(ctx context.Context, id, actorID string, scope HandleScope, to string, version int) (contracts.OrderEntry, error)
}

type Orders struct {
	Repo OrderRepository
}

func (o *Orders) ListOwn(ctx context.Context, actorID string, page int) (contracts.OrderList, error) {
	if actorID == "" || !coredomain.ValidPage(page, 20) {
		return contracts.OrderList{}, domain.ErrOrderInvalid
	}
	return o.Repo.ListOwn(ctx, actorID, page)
}

func (o *Orders) ListManaged(ctx context.Context, actorID string, scope HandleScope, page int) (contracts.OrderList, error) {
	if actorID == "" || !coredomain.ValidPage(page, 20) {
		return contracts.OrderList{}, domain.ErrOrderInvalid
	}
	return o.Repo.ListManaged(ctx, actorID, scope, page)
}

func (o *Orders) Read(ctx context.Context, id, actorID string, scope HandleScope) (contracts.OrderEntry, error) {
	id = strings.TrimSpace(id)
	if id == "" || len(id) > 64 || actorID == "" {
		return contracts.OrderEntry{}, domain.ErrOrderInvalid
	}
	return o.Repo.Read(ctx, id, actorID, scope)
}

// CreateManaged records an order on behalf of a customer. The operator needs
// the handle permission (checked by the HTTP layer); the customer id is a
// server-verified subject reference, never a client-claimed role.
func (o *Orders) CreateManaged(ctx context.Context, input contracts.OrderCreateInput) (contracts.OrderEntry, error) {
	input.Title = strings.TrimSpace(input.Title)
	if input.OwnerID == "" || len(input.OwnerID) > 64 {
		return contracts.OrderEntry{}, domain.ErrOrderInvalid
	}
	if err := domain.ValidateNew(input.Title, input.AmountCents); err != nil {
		return contracts.OrderEntry{}, err
	}
	if input.AgentID != nil && (*input.AgentID == "" || len(*input.AgentID) > 64) {
		return contracts.OrderEntry{}, domain.ErrOrderInvalid
	}
	return o.Repo.Create(ctx, input.OwnerID, input)
}

// Transition validates the target status and lets the repository enforce
// visibility again inside the statement, so a tampered id yields not found.
func (o *Orders) Transition(ctx context.Context, id, actorID string, scope HandleScope, input contracts.OrderStatusInput) (contracts.OrderEntry, error) {
	id = strings.TrimSpace(id)
	if id == "" || len(id) > 64 || actorID == "" || input.Version < 1 || !domain.ValidStatus(input.Status) || input.Status == domain.StatusOpen {
		return contracts.OrderEntry{}, domain.ErrOrderInvalid
	}
	current, err := o.Repo.Read(ctx, id, actorID, scope)
	if err != nil {
		return contracts.OrderEntry{}, err
	}
	if !domain.CanTransition(current.Status, input.Status) {
		return contracts.OrderEntry{}, domain.ErrOrderStatus
	}
	return o.Repo.Transition(ctx, id, actorID, scope, input.Status, input.Version)
}
