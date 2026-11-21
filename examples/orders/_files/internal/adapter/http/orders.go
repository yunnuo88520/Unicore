// Author: yunnuo <ymz@ebox.vip>
// Description: Orders HTTP surface: server-side visibility, explicit handle scope and anti-enumeration reads.
package httpadapter

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	ordersdomain "github.com/yunnuo/unicore/internal/modules/orders/domain"
	"github.com/yunnuo/unicore/internal/modules/orders/storage/ordersql"
	"github.com/yunnuo/unicore/internal/modules/orders/usecase"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
)

// mountOrders registers the orders example. Customers read their own orders;
// the managed surface resolves the caller's orders:handle data scope and the
// agent relationship server-side — the client never asserts either.
func mountOrders(api chi.Router, config Config) {
	// context carries the resolved session facts for one request.
	type context struct {
		service   *usecase.Orders
		actorID   string
		scope     usecase.HandleScope
		hasHandle bool
	}
	denyHandle := func(w http.ResponseWriter) {
		failure(w, 403, "PERMISSION_DENIED", "你没有执行此操作的权限")
	}
	// Module errors map to the codes declared in the example's contract
	// patch; everything else stays with the shared webError mapping.
	fail := func(w http.ResponseWriter, err error) {
		switch {
		case errors.Is(err, ordersdomain.ErrOrderInvalid):
			failure(w, 400, "ORDER_INVALID", "订单信息无效")
		case errors.Is(err, ordersdomain.ErrOrderStatus):
			failure(w, 409, "ORDER_STATUS", "订单状态不允许该变更")
		default:
			webError(w, err)
		}
	}
	resolve := func(w http.ResponseWriter, r *http.Request) (context, bool) {
		store, _, _, profile := config.Install.Services()
		if store == nil {
			failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
			return context{}, false
		}
		repo := &ordersql.Repository{Store: store}
		if profile != runtime.WebPlatform {
			// The acceptance example targets the platform surface; the local
			// profile keeps a personal-only reading with the local actor.
			return context{service: &usecase.Orders{Repo: repo}, actorID: "local"}, true
		}
		session, err := requestIdentitySession(r, config.Install.Identity(false))
		if err != nil {
			fail(w, err)
			return context{}, false
		}
		state := context{service: &usecase.Orders{Repo: repo}, actorID: session.User.ID}
		if platform.Has(session.User, "orders:handle") {
			filter, err := config.Install.Identity(false).Store.DataScope(r.Context(), session.User, "orders:handle")
			if err != nil {
				fail(w, err)
				return context{}, false
			}
			state.scope = usecase.HandleScope{All: filter.All, OwnerIDs: filter.UserIDs}
			state.hasHandle = true
		}
		return state, true
	}

	api.Get("/orders", func(w http.ResponseWriter, r *http.Request) {
		state, ok := resolve(w, r)
		if !ok {
			return
		}
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		data, err := state.service.ListOwn(r.Context(), state.actorID, page)
		if err != nil {
			fail(w, err)
			return
		}
		success(w, data)
	})
	api.Get("/orders/managed", func(w http.ResponseWriter, r *http.Request) {
		state, ok := resolve(w, r)
		if !ok {
			return
		}
		if !state.hasHandle {
			denyHandle(w)
			return
		}
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		data, err := state.service.ListManaged(r.Context(), state.actorID, state.scope, page)
		if err != nil {
			fail(w, err)
			return
		}
		success(w, data)
	})
	api.Post("/orders/managed", func(w http.ResponseWriter, r *http.Request) {
		state, ok := resolve(w, r)
		if !ok {
			return
		}
		if !state.hasHandle {
			denyHandle(w)
			return
		}
		var in contracts.OrderCreateInput
		if !decode(w, r, &in) {
			return
		}
		data, err := state.service.CreateManaged(r.Context(), in)
		if err != nil {
			fail(w, err)
			return
		}
		success(w, data)
	})
	api.Get("/orders/{id}", func(w http.ResponseWriter, r *http.Request) {
		state, ok := resolve(w, r)
		if !ok {
			return
		}
		data, err := state.service.Read(r.Context(), chi.URLParam(r, "id"), state.actorID, state.scope)
		if err != nil {
			fail(w, err)
			return
		}
		success(w, data)
	})
	api.Put("/orders/{id}/status", func(w http.ResponseWriter, r *http.Request) {
		state, ok := resolve(w, r)
		if !ok {
			return
		}
		if !state.hasHandle {
			denyHandle(w)
			return
		}
		var in contracts.OrderStatusInput
		if !decode(w, r, &in) {
			return
		}
		data, err := state.service.Transition(r.Context(), strings.TrimSpace(chi.URLParam(r, "id")), state.actorID, state.scope, in)
		if err != nil {
			fail(w, err)
			return
		}
		success(w, data)
	})
}
