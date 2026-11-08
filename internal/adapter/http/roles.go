// Author: yunnuo <ymz@ebox.vip>
// Description: Realm-aware role management for both identity realms and read-only catalogue access.
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
	api.Post("/admin/roles", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "roles:write")
		if !ok {
			return
		}
		var input contracts.RoleSaveInput
		if !decode(w, r, &input) {
			return
		}
		// An omitted realm keeps the user-realm default for backward
		// compatibility; the repository validates the grant bound per realm and
		// fixes administrator-realm roles to the self data scope.
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.CreateRole(r.Context(), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Put("/admin/roles/{id}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "roles:write")
		if !ok {
			return
		}
		var input contracts.RoleSaveInput
		if !decode(w, r, &input) {
			return
		}
		// A role never moves between realms; the realm and the builtin self
		// scope of the builtin user role stay as stored.
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.UpdateRole(r.Context(), chi.URLParam(r, "id"), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Delete("/admin/roles/{id}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "roles:write")
		if !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.DeleteRole(r.Context(), chi.URLParam(r, "id"), actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	// Administrator-realm options for assigning roles to administrator accounts;
	// super_admin exclusivity is enforced by the contract policy middleware.
	api.Get("/admin/roles/admin-options", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "roles:read")
		if !ok {
			return
		}
		identity := manager.Identity(true)
		data, err := identity.Store.RoleOptions(r.Context(), actor.User.ID)
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
