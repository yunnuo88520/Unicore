// Author: yunnuo <ymz@ebox.vip>
// Description: Shared notes handlers fix identity from the route and pass a server-owned scope to the use case.
package httpadapter

import (
	"context"
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/adapter/storage/notessql"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/usecase"
	"net/http"
	"strconv"
	"strings"
)

// noteActionCapabilities merges the storage-side ownership facts with the
// session's explicit action grants: the server stays authoritative, so a
// member without notes:update or notes:delete never sees an enabled button.
// Local and desktop projections have no stashed session and keep their
// capabilities untouched.
func noteActionCapabilities(r *http.Request, entries ...contracts.NoteEntry) {
	session, ok := r.Context().Value(policySessionKey{}).(contracts.Session)
	if !ok {
		return
	}
	for i := range entries {
		entries[i].Capabilities.Update = entries[i].Capabilities.Update && platform.Has(session.User, "notes:update")
		entries[i].Capabilities.Delete = entries[i].Capabilities.Delete && platform.Has(session.User, "notes:delete")
	}
}

func mountNotes(api chi.Router, config Config) {
	handler := func(fn func(http.ResponseWriter, *http.Request, *usecase.Notes, string, usecase.NoteVisibility)) http.HandlerFunc {
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
			visibility := usecase.NoteVisibility{}
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
				// Row-level data scopes widen the user-realm list only; the
				// administrator list and local profiles keep their behaviour.
				if !administratorRequest(r) {
					filter, err := identity.Store.DataScope(r.Context(), session.User)
					if err != nil {
						webError(w, err)
						return
					}
					if filter.All {
						visibility.All = true
					} else if !filter.Self() {
						for _, id := range filter.UserIDs {
							visibility.Scopes = append(visibility.Scopes, actor.Realm+"/"+id)
						}
					}
				}
			}
			service := &usecase.Notes{Repo: &notessql.Repository{Store: store}}
			if fs := config.Install.Files(); fs != nil {
				service.Attachments = func(ctx context.Context, _ string, id string) error { return fs.ValidateAttachment(ctx, actor, id) }
			}
			fn(w, r, service, scope, visibility)
		}
	}
	for _, prefix := range []string{"", "/admin"} {
		api.Get(prefix+"/notes", handler(func(w http.ResponseWriter, r *http.Request, n *usecase.Notes, scope string, visibility usecase.NoteVisibility) {
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
			data, e := n.List(r.Context(), scope, q, visibility)
			if e != nil {
				webError(w, e)
				return
			}
			noteActionCapabilities(r, data.Items...)
			success(w, data)
		}))
		api.Post(prefix+"/notes", handler(func(w http.ResponseWriter, r *http.Request, n *usecase.Notes, scope string, _ usecase.NoteVisibility) {
			var in contracts.NoteInput
			if !decode(w, r, &in) {
				return
			}
			data, e := n.Create(r.Context(), scope, in)
			if e != nil {
				webError(w, e)
				return
			}
			noteActionCapabilities(r, data)
			success(w, data)
		}))
		api.Put(prefix+"/notes/{id}", handler(func(w http.ResponseWriter, r *http.Request, n *usecase.Notes, scope string, _ usecase.NoteVisibility) {
			var in contracts.NoteUpdate
			if !decode(w, r, &in) {
				return
			}
			data, e := n.Update(r.Context(), scope, strings.TrimSpace(chi.URLParam(r, "id")), in)
			if e != nil {
				webError(w, e)
				return
			}
			noteActionCapabilities(r, data)
			success(w, data)
		}))
		api.Delete(prefix+"/notes/{id}", handler(func(w http.ResponseWriter, r *http.Request, n *usecase.Notes, scope string, _ usecase.NoteVisibility) {
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
