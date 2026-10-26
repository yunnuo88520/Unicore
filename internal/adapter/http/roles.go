// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-only role catalogue and protected role mutations.
package httpadapter

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func mountRoles(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/admin/roles", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "roles:read"); !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.ListRoles(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Get("/admin/users/role-options", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "")
		if !ok {
			return
		}
		if !platform.Has(actor.User, "users:read") && !platform.Has(actor.User, "users:create") && !platform.Has(actor.User, "users:update") {
			webError(w, platform.ErrForbidden)
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.RoleOptions(r.Context(), actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	for _, method := range []string{"POST", "PATCH", "DELETE"} {
		path := "/admin/roles"
		if method != "POST" {
			path += "/{id}"
		}
		api.MethodFunc(method, path, func(w http.ResponseWriter, r *http.Request) {
			actor, ok := require(manager, w, r, "roles:write")
			if !ok {
				return
			}
			if !platform.IsSuper(actor.User) {
				webError(w, platform.ErrForbidden)
				return
			}
			_, _, identity, _ := manager.Services()
			id := chi.URLParam(r, "id")
			if len(id) > 64 {
				webError(w, platform.ErrInput)
				return
			}
			if method == "DELETE" {
				if err := identity.Store.DeleteRole(r.Context(), id, actor.User.ID); err != nil {
					webError(w, err)
					return
				}
				success(w, contracts.ActionResult{Success: true})
				return
			}
			var input contracts.RoleInput
			if !decode(w, r, &input) {
				return
			}
			var data contracts.Role
			var err error
			if method == "POST" {
				data, err = identity.Store.CreateRole(r.Context(), input, actor.User.ID)
			} else {
				data, err = identity.Store.UpdateRole(r.Context(), id, input, actor.User.ID)
			}
			if err != nil {
				webError(w, err)
				return
			}
			success(w, data)
		})
	}
}
