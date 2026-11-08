// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator menu configuration and the user-realm dictionary read endpoint.
package httpadapter

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func mountMenus(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/admin/menus", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "menus:write"); !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.ListMenuConfig(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Put("/admin/menus", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "menus:write")
		if !ok {
			return
		}
		var input contracts.MenuSaveInput
		if !decode(w, r, &input) {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.SaveNavigation(r.Context(), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
}

func mountDictionaries(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/admin/dictionaries", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "dictionaries:read"); !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.ListDictionaries(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Post("/admin/dictionaries", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "dictionaries:write")
		if !ok {
			return
		}
		var input contracts.DictionaryCreateInput
		if !decode(w, r, &input) {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.CreateDictionary(r.Context(), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Get("/admin/dictionaries/{id}", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "dictionaries:read"); !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.Dictionary(r.Context(), chi.URLParam(r, "id"), false)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Put("/admin/dictionaries/{id}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "dictionaries:write")
		if !ok {
			return
		}
		var input contracts.DictionaryUpdateInput
		if !decode(w, r, &input) {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.UpdateDictionary(r.Context(), chi.URLParam(r, "id"), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Delete("/admin/dictionaries/{id}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "dictionaries:write")
		if !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.DeleteDictionary(r.Context(), chi.URLParam(r, "id"), actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Put("/admin/dictionaries/{id}/items", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "dictionaries:write")
		if !ok {
			return
		}
		var input contracts.DictionaryItemsInput
		if !decode(w, r, &input) {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.ReplaceDictionaryItems(r.Context(), chi.URLParam(r, "id"), input.Items, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	// User-realm read: active items of one dictionary for form selects.
	api.Get("/dictionaries/{code}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "")
		if !ok {
			return
		}
		if actor.User.ID == "" || actor.User.Status != "active" {
			webError(w, platform.ErrForbidden)
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.DictionaryByCode(r.Context(), chi.URLParam(r, "code"), true)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
}
