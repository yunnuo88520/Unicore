// Author: yunnuo <ymz@ebox.vip>
// Description: Shared notes handlers fix identity from the route and pass a server-owned scope to the use case.
package httpadapter

import (
	"context"
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/adapter/storage/notessql"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/usecase"
	"net/http"
	"strconv"
	"strings"
)

func mountNotes(api chi.Router, config Config) {
	handler := func(fn func(http.ResponseWriter, *http.Request, *usecase.Notes, string)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			store, _, _, profile := config.Install.Services()
			if administratorRequest(r) && profile != runtime.WebPlatform {
				failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供管理端")
				return
			}
			if !coreAccess(config.Install, w, r) {
				return
			}
			if store == nil {
				failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
				return
			}
			scope := "local"
			var actor files.Actor
			if profile == runtime.WebPlatform {
				identity := config.Install.Identity(administratorRequest(r))
				session, e := identity.Session(r.Context(), rawSession(r))
				if e != nil {
					webError(w, e)
					return
				}
				actor = fileActor(r, session)
				scope = actor.Realm + "/" + actor.ID
			}
			service := &usecase.Notes{Repo: &notessql.Repository{Store: store}}
			if fs := config.Install.Files(); fs != nil {
				service.Attachments = func(ctx context.Context, _ string, id string) error { return fs.ValidateAttachment(ctx, actor, id) }
			}
			fn(w, r, service, scope)
		}
	}
	for _, prefix := range []string{"", "/admin"} {
		api.Get(prefix+"/notes", handler(func(w http.ResponseWriter, r *http.Request, n *usecase.Notes, scope string) {
			q := contracts.NoteQuery{Search: r.URL.Query().Get("search"), Status: r.URL.Query().Get("status"), Sort: "updated_at", Direction: "desc", Page: 1}
			if v := r.URL.Query().Get("page"); v != "" {
				q.Page, _ = strconv.Atoi(v)
			}
			if v := r.URL.Query().Get("sort"); v != "" {
				q.Sort = v
			}
			if v := r.URL.Query().Get("direction"); v != "" {
				q.Direction = v
			}
			data, e := n.List(r.Context(), scope, q)
			if e != nil {
				webError(w, e)
				return
			}
			success(w, data)
		}))
		api.Post(prefix+"/notes", handler(func(w http.ResponseWriter, r *http.Request, n *usecase.Notes, scope string) {
			var in contracts.NoteInput
			if !decode(w, r, &in) {
				return
			}
			data, e := n.Create(r.Context(), scope, in)
			if e != nil {
				webError(w, e)
				return
			}
			success(w, data)
		}))
		api.Put(prefix+"/notes/{id}", handler(func(w http.ResponseWriter, r *http.Request, n *usecase.Notes, scope string) {
			var in contracts.NoteUpdate
			if !decode(w, r, &in) {
				return
			}
			data, e := n.Update(r.Context(), scope, strings.TrimSpace(chi.URLParam(r, "id")), in)
			if e != nil {
				webError(w, e)
				return
			}
			success(w, data)
		}))
		api.Delete(prefix+"/notes/{id}", handler(func(w http.ResponseWriter, r *http.Request, n *usecase.Notes, scope string) {
			var in contracts.NoteVersion
			if !decode(w, r, &in) {
				return
			}
			if e := n.Delete(r.Context(), scope, chi.URLParam(r, "id"), in.Version); e != nil {
				webError(w, e)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		}))
	}
}
