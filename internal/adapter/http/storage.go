// Author: yunnuo <ymz@ebox.vip>
// Description: Platform file/storage API with independent identity, CSRF and owner authorization boundaries.
package httpadapter

import (
	"context"
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
	"io"
	"mime"
	"net/http"
	"strconv"
	"time"
)

func fileActor(r *http.Request, s contracts.Session) files.Actor {
	realm := "user"
	if administratorRequest(r) {
		realm = "administrator"
	}
	return files.Actor{ID: s.User.ID, Realm: realm, Admin: realm == "administrator" && platform.IsSuper(s.User)}
}
func mountStorage(api chi.Router, config Config) {
	manager := config.Install
	handler := func(permission string, fn func(http.ResponseWriter, *http.Request, *files.Service, files.Actor)) http.HandlerFunc {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session, ok := require(manager, w, r, permission)
			if !ok {
				return
			}
			s := manager.Files()
			if s == nil {
				failure(w, 404, "NOT_FOUND", "此运行形态不提供文件服务")
				return
			}
			fn(w, r, s, fileActor(r, session))
		})
	}
	api.Get("/admin/storage/locations", handler("storage:read", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		v, e := s.Locations(r.Context())
		if e != nil {
			webError(w, e)
			return
		}
		success(w, v)
	}).ServeHTTP)
	for _, method := range []string{"POST", "PUT"} {
		path := "/admin/storage/locations"
		if method == "PUT" {
			path += "/{id}"
		}
		api.Method(method, path, handler("storage:write", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			var input contracts.StorageLocationInput
			if !decode(w, r, &input) {
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()
			v, e := s.SaveLocation(ctx, input, chi.URLParam(r, "id"), a.ID)
			if e != nil {
				webError(w, e)
				return
			}
			success(w, v)
		}))
	}
	api.Delete("/admin/storage/locations/{id}", handler("storage:write", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		if e := s.RemoveLocation(r.Context(), chi.URLParam(r, "id"), a.ID); e != nil {
			webError(w, e)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	}).ServeHTTP)
	for _, action := range []string{"test", "activate", "browser"} {
		action := action
		api.Post("/admin/storage/locations/{id}/"+action, handler("storage:write", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()
			var e error
			switch action {
			case "test":
				e = s.Test(ctx, chi.URLParam(r, "id"), a.ID)
			case "activate":
				e = s.ActivateLocation(ctx, chi.URLParam(r, "id"), a.ID)
			case "browser":
				var input contracts.StorageMaintenanceInput
				if !decode(w, r, &input) {
					return
				}
				e = s.Browser(ctx, chi.URLParam(r, "id"), input.Origin)
			}
			if e != nil {
				webError(w, e)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		}).ServeHTTP)
	}
	api.Post("/admin/storage/cleanup", handler("storage:write", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		if e := s.Cleanup(ctx); e != nil {
			webError(w, e)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	}).ServeHTTP)
	api.Get("/files", handler("", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		page := 1
		if r.URL.Query().Get("page") != "" {
			page, _ = strconv.Atoi(r.URL.Query().Get("page"))
		}
		v, e := s.List(r.Context(), a, r.URL.Query().Get("search"), page)
		if e != nil {
			webError(w, e)
			return
		}
		success(w, v)
	}).ServeHTTP)
	api.Post("/files/uploads", handler("", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		var input contracts.FileUploadInput
		if !decode(w, r, &input) {
			return
		}
		v, e := s.Upload(r.Context(), a, input)
		if e != nil {
			webError(w, e)
			return
		}
		success(w, v)
	}).ServeHTTP)
	api.Put("/files/uploads/{id}/content", handler("", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		if r.Header.Get("Content-Type") != "application/octet-stream" {
			failure(w, 415, "UNSUPPORTED_MEDIA_TYPE", "请使用 application/octet-stream")
			return
		}
		controller := http.NewResponseController(w)
		controller.SetReadDeadline(time.Now().Add(10 * time.Minute))
		controller.SetWriteDeadline(time.Now().Add(10 * time.Minute))
		r.Body = http.MaxBytesReader(w, r.Body, 1<<30)
		if e := s.Receive(r.Context(), a, chi.URLParam(r, "id"), r.Body, r.ContentLength); e != nil {
			webError(w, e)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	}).ServeHTTP)
	api.Post("/files/uploads/{id}/complete", handler("", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Minute))
		v, e := s.Complete(r.Context(), a, chi.URLParam(r, "id"))
		if e != nil {
			webError(w, e)
			return
		}
		success(w, v)
	}).ServeHTTP)
	api.Post("/files/{id}/access", handler("", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		v, e := s.Access(r.Context(), a, chi.URLParam(r, "id"))
		if e != nil {
			webError(w, e)
			return
		}
		success(w, v)
	}).ServeHTTP)
	api.Delete("/files/{id}", handler("", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		if e := s.Delete(r.Context(), a, chi.URLParam(r, "id")); e != nil {
			webError(w, e)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	}).ServeHTTP)
	api.Post("/admin/files/{id}/migrate", handler("storage:write", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		var input contracts.StorageTargetInput
		if !decode(w, r, &input) {
			return
		}
		http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Minute))
		v, e := s.Migrate(r.Context(), a, chi.URLParam(r, "id"), input.LocationID)
		if e != nil {
			webError(w, e)
			return
		}
		success(w, v)
	}).ServeHTTP)
	api.Get("/files/{id}/content", func(w http.ResponseWriter, r *http.Request) {
		s := manager.Files()
		if s == nil {
			failure(w, 404, "NOT_FOUND", "文件不存在")
			return
		}
		expires, _ := strconv.ParseInt(r.URL.Query().Get("expires"), 10, 64)
		source, f, e := s.Download(r.Context(), chi.URLParam(r, "id"), r.URL.Query().Get("signature"), expires)
		if e != nil {
			webError(w, e)
			return
		}
		defer source.Close()
		http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Minute))
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": f.OriginalName}))
		w.Header().Set("Content-Length", strconv.Itoa(f.Size))
		w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.WriteHeader(200)
		io.Copy(w, source)
	})
}
