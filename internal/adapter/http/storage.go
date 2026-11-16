// Author: yunnuo <ymz@ebox.vip>
// Description: Business uploads and platform storage administration share durable files with independent authorization.
package httpadapter

import (
	"context"
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/edition"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func fileActor(r *http.Request, s contracts.Session) files.Actor {
	realm := "user"
	// Only a super administrator receives the service-wide bypass. Restricted
	// operators use resource-specific scopes even in the management workspace.
	return files.Actor{ID: s.User.ID, Realm: realm, Admin: administratorRequest(r) && platform.IsSuper(s.User)}
}

// fileActionCapabilities merges the storage-side ownership facts with the
// session's explicit action grants: download needs files:access and deletion
// needs files:delete, so restricted administrators and custom roles never see
// an enabled control their grants would refuse. Local and desktop projections
// have no stashed session and stay untouched.
func fileActionCapabilities(r *http.Request, list *contracts.FileList) {
	session, ok := r.Context().Value(policySessionKey{}).(contracts.Session)
	if !ok {
		return
	}
	for i := range list.Items {
		list.Items[i].Capabilities.Download = list.Items[i].Capabilities.Download && platform.Has(session.User, "files:access")
		list.Items[i].Capabilities.Delete = list.Items[i].Capabilities.Delete && platform.Has(session.User, "files:delete")
	}
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
	for _, prefix := range []string{"", "/admin", "/notes", "/account/avatar"} {
		if prefix == "/notes" && !edition.Notes {
			continue
		}
		routeHandler := handler
		business := prefix == "/notes" || prefix == "/account/avatar"
		if business {
			routeHandler = func(_ string, fn func(http.ResponseWriter, *http.Request, *files.Service, files.Actor)) http.HandlerFunc {
				return func(w http.ResponseWriter, r *http.Request) {
					if !coreAccess(manager, w, r) {
						return
					}
					service := manager.Files()
					if service == nil {
						failure(w, 503, "NOT_AVAILABLE", "文件服务尚未就绪")
						return
					}
					actor := files.Actor{ID: "local", Realm: "local"}
					if session, ok := r.Context().Value(policySessionKey{}).(contracts.Session); ok {
						actor = fileActor(r, session)
						actor.Admin = false
					}
					if prefix == "/account/avatar" {
						actor.Realm = "avatar"
					}
					fn(w, r, service, actor)
				}
			}
		}
		fileHandler := func(write bool, fn func(http.ResponseWriter, *http.Request, *files.Service, files.Actor)) http.HandlerFunc {
			permission := ""
			if prefix == "/admin" {
				permission = "storage:read"
				if write {
					permission = "storage:write"
				}
			}
			return routeHandler(permission, fn)
		}

		api.Get(prefix+"/files/policy", fileHandler(false, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			success(w, s.UploadPolicy(r.Context()))
		}).ServeHTTP)
		api.Post(prefix+"/files/multipart", fileHandler(true, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			var input contracts.MultipartUploadInput
			if !decode(w, r, &input) {
				return
			}
			if prefix == "/account/avatar" && (input.Size > 2<<20 || (input.MimeType != "image/png" && input.MimeType != "image/jpeg" && input.MimeType != "image/gif")) {
				webError(w, files.ErrInvalid)
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()
			v, e := s.BeginUpload(ctx, a, input)
			if e != nil {
				webError(w, e)
				return
			}
			success(w, v)
		}).ServeHTTP)
		api.Get(prefix+"/files/multipart/{id}", fileHandler(false, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()
			v, e := s.UploadStatus(ctx, a, chi.URLParam(r, "id"))
			if e != nil {
				webError(w, e)
				return
			}
			success(w, v)
		}).ServeHTTP)
		api.Post(prefix+"/files/multipart/{id}/parts", fileHandler(true, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			var input contracts.UploadPartInput
			if !decode(w, r, &input) {
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()
			v, e := s.UploadPartGrant(ctx, a, chi.URLParam(r, "id"), input.Number)
			if e != nil {
				webError(w, e)
				return
			}
			if !v.Direct && prefix != "" {
				v.Url = "/api/v1" + prefix + strings.TrimPrefix(v.Url, "/api/v1")
			}
			success(w, v)
		}).ServeHTTP)
		api.Put(prefix+"/files/multipart/{id}/parts/{part}", fileHandler(true, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			if r.Header.Get("Content-Type") != "application/octet-stream" {
				failure(w, 415, "UNSUPPORTED_MEDIA_TYPE", "请使用 application/octet-stream")
				return
			}
			number, _ := strconv.Atoi(chi.URLParam(r, "part"))
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
			defer cancel()
			controller := http.NewResponseController(w)
			controller.SetReadDeadline(time.Now().Add(10 * time.Minute))
			controller.SetWriteDeadline(time.Now().Add(10 * time.Minute))
			r.Body = http.MaxBytesReader(w, r.Body, 64<<20)
			if e := s.ReceiveUploadPart(ctx, a, chi.URLParam(r, "id"), number, r.Body, r.ContentLength); e != nil {
				webError(w, e)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		}).ServeHTTP)
		api.Post(prefix+"/files/multipart/{id}/complete", fileHandler(true, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Hour)
			defer cancel()
			http.NewResponseController(w).SetWriteDeadline(time.Now().Add(2 * time.Hour))
			v, e := s.FinishUpload(ctx, a, chi.URLParam(r, "id"))
			if e == nil && prefix == "/account/avatar" {
				e = s.ValidateAvatar(ctx, a, v.FileID)
				if e != nil {
					_ = s.Delete(ctx, a, v.FileID)
				}
			}
			if e != nil {
				webError(w, e)
				return
			}
			success(w, v)
		}).ServeHTTP)
		api.Get(prefix+"/files", fileHandler(false, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			page := 1
			if r.URL.Query().Get("page") != "" {
				page, _ = strconv.Atoi(r.URL.Query().Get("page"))
			}
			// Each workspace resolves the permission used by its file list.
			scopePermission := "files:access"
			if administratorRequest(r) {
				scopePermission = "storage:read"
			}
			scope := files.ScopeFilter{}
			if !business && !a.Admin {
				if policySession, ok := r.Context().Value(policySessionKey{}).(contracts.Session); ok {
					identity := config.Install.Identity(false)
					if identity != nil {
						filter, err := identity.Store.DataScope(r.Context(), policySession.User, scopePermission)
						if err != nil {
							webError(w, err)
							return
						}
						scope = files.ScopeFilter{All: filter.All, CreatorIDs: filter.UserIDs}
					}
				}
			}
			v, e := s.List(r.Context(), a, r.URL.Query().Get("search"), page, scope)
			if e != nil {
				webError(w, e)
				return
			}
			if !business {
				fileActionCapabilities(r, &v)
			}
			success(w, v)
		}).ServeHTTP)
		if !business {

			api.Post(prefix+"/files/uploads", fileHandler(true, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
				var input contracts.FileUploadInput
				if !decode(w, r, &input) {
					return
				}
				v, e := s.Upload(r.Context(), a, input)
				if e != nil {
					webError(w, e)
					return
				}
				if !v.Direct && prefix != "" {
					v.Url = "/api/v1" + prefix + strings.TrimPrefix(v.Url, "/api/v1")
				}
				success(w, v)
			}).ServeHTTP)
			api.Put(prefix+"/files/uploads/{id}/content", fileHandler(true, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
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
			api.Post(prefix+"/files/uploads/{id}/complete", fileHandler(true, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
				http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Minute))
				v, e := s.Complete(r.Context(), a, chi.URLParam(r, "id"))
				if e != nil {
					webError(w, e)
					return
				}
				success(w, v)
			}).ServeHTTP)
		}

		api.Post(prefix+"/files/{id}/access", routeHandler("", func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			// The contract allows files:access OR notes:access here. Plain
			// signing needs the files grant; attachment signing rides on note
			// reading and stays limited to files actually attached to a note
			// inside the session's current read scope.
			session, _ := r.Context().Value(policySessionKey{}).(contracts.Session)
			noteID := strings.TrimSpace(r.URL.Query().Get("note_id"))
			if !business && !platform.Has(session.User, "files:access") && noteID == "" {
				webError(w, platform.ErrForbidden)
				return
			}
			// Every issuance re-resolves the session's current data scope: a
			// grant never outlives the scope it was approved under.
			scopes := []files.ScopeFilter{}
			scopePermission := "files:access"
			if noteID != "" {
				scopePermission = "notes:access"
			}
			filter := platform.ScopeFilter{}
			if !a.Admin && session.User.ID != "" && (!business || noteID != "" && prefix == "/notes") {
				if identity := config.Install.Identity(false); identity != nil {
					resolved, err := identity.Store.DataScope(r.Context(), session.User, scopePermission)
					if err != nil {
						webError(w, err)
						return
					}
					filter = resolved
					scopes = append(scopes, files.ScopeFilter{All: filter.All, CreatorIDs: filter.UserIDs})
				}
			}
			if noteID != "" && prefix != "/account/avatar" {
				if session.User.ID != "" && !platform.Has(session.User, "notes:access") {
					webError(w, platform.ErrForbidden)
					return
				}
				store, _, _, _ := config.Install.Services()
				if store == nil {
					failure(w, 404, "NOT_FOUND", "文件不存在")
					return
				}
				if !allowNoteAttachment(w, r, config, a, noteID, filter) {
					return
				}
			}
			v, e := s.AccessScoped(r.Context(), a, chi.URLParam(r, "id"), scopes...)
			if e != nil {
				webError(w, e)
				return
			}
			success(w, v)
		}).ServeHTTP)
		api.Delete(prefix+"/files/{id}", fileHandler(true, func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			if e := s.Delete(r.Context(), a, chi.URLParam(r, "id")); e != nil {
				webError(w, e)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		}).ServeHTTP)

	}
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
