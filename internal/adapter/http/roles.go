// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator-only read access to the two fixed platform roles.
package httpadapter

import (
	"net/http"

	"github.com/go-chi/chi/v5"
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
}
