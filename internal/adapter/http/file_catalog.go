// Author: yunnuo <ymz@ebox.vip>
// Description: Super-administrator file governance over the existing unified file service.
package httpadapter

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
)

func mountFileCatalog(api chi.Router, config Config) {
	handler := func(permission string, fn func(http.ResponseWriter, *http.Request, *files.Service, files.Actor)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			session, ok := require(config.Install, w, r, permission)
			if !ok {
				return
			}
			if !administratorRequest(r) || !platform.IsSuper(session.User) {
				webError(w, platform.ErrForbidden)
				return
			}
			service := config.Install.Files()
			if service == nil {
				webError(w, files.ErrNotFound)
				return
			}
			fn(w, r, service, fileActor(r, session))
		}
	}
	api.Get("/admin/file-catalog", handler("storage:read", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		page := 1
		if value := r.URL.Query().Get("page"); value != "" {
			page, _ = strconv.Atoi(value)
		}
		filter := files.CatalogFilter{Search: r.URL.Query().Get("search"), Page: page, LocationID: r.URL.Query().Get("location_id"), Purpose: r.URL.Query().Get("purpose"), TypeCategory: r.URL.Query().Get("type")}
		value, err := s.Catalog(r.Context(), a, filter)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, value)
	}).ServeHTTP)
	api.Post("/admin/file-catalog/{id}/access", handler("storage:read", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		value, err := s.CatalogAccess(r.Context(), a, chi.URLParam(r, "id"), r.URL.Query().Get("disposition") == "inline")
		if err != nil {
			webError(w, err)
			return
		}
		success(w, value)
	}).ServeHTTP)
	api.Delete("/admin/file-catalog/{id}", handler("storage:write", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		if err := s.CatalogDelete(r.Context(), a, chi.URLParam(r, "id")); err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	}).ServeHTTP)
}
