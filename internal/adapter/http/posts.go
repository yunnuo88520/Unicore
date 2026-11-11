// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator-only post CRUD with independent read and write permission points.
package httpadapter

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
)

func mountPosts(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/admin/posts", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "posts:read"); !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.ListPosts(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Post("/admin/posts", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "posts:write")
		if !ok {
			return
		}
		var input contracts.PostSaveInput
		if !decode(w, r, &input) {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.CreatePost(r.Context(), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Put("/admin/posts/{id}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "posts:write")
		if !ok {
			return
		}
		var input contracts.PostSaveInput
		if !decode(w, r, &input) {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.UpdatePost(r.Context(), chi.URLParam(r, "id"), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Delete("/admin/posts/{id}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "posts:write")
		if !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.DeletePost(r.Context(), chi.URLParam(r, "id"), actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
}
