// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator department CRUD for the organization tree used by role data scopes.
package httpadapter

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
)

func mountDepartments(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/admin/departments", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "departments:read"); !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.ListDepartments(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Post("/admin/departments", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "departments:write")
		if !ok {
			return
		}
		var input contracts.DepartmentSaveInput
		if !decode(w, r, &input) {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.CreateDepartment(r.Context(), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Put("/admin/departments/{id}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "departments:write")
		if !ok {
			return
		}
		var input contracts.DepartmentSaveInput
		if !decode(w, r, &input) {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.UpdateDepartment(r.Context(), chi.URLParam(r, "id"), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Delete("/admin/departments/{id}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "departments:write")
		if !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.DeleteDepartment(r.Context(), chi.URLParam(r, "id"), actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
}
