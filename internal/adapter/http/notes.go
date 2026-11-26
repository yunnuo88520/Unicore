//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Notes routes fix identity from the route and pass a server-owned scope to the module use case.
package httpadapter

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	notesdomain "github.com/yunnuo/unicore/internal/modules/notes/domain"
	notesnotessql "github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
	notesusecase "github.com/yunnuo/unicore/internal/modules/notes/usecase"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
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
	handler := func(fn func(http.ResponseWriter, *http.Request, *notesusecase.Notes, string, notesusecase.NoteVisibility)) http.HandlerFunc {
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
			visibility := notesusecase.NoteVisibility{}
			manageAll := false
			actor := files.Actor{ID: "local", Realm: "local"}
			if profile == runtime.WebPlatform {
				identity := config.Install.Identity(administratorRequest(r))
				session, e := requestIdentitySession(r, identity)
				if e != nil {
					webError(w, e)
					return
				}
				actor = fileActor(r, session)
				scope = "user/" + actor.ID
				// Super administrators manage every user-realm note from the
				// management surface, mirroring the files module Admin rule.
				manageAll = administratorRequest(r) && platform.IsSuper(session.User)
				// The personal screen opts into an owner-scoped view; the
				// default list resolves the caller's notes:access data scope.
				if r.Method == http.MethodGet && r.URL.Query().Get("view") != "mine" {
					filter, err := identity.Store.DataScope(r.Context(), session.User, "notes:access")
					if err != nil {
						webError(w, err)
						return
					}
					visibility = notesusecase.VisibilityFor("user", filter.All, filter.UserIDs)
				}
			}
			service := &notesusecase.Notes{Repo: &notesnotessql.Repository{Store: store, ManageAll: manageAll}}
			if fs := config.Install.Files(); fs != nil {
				service.Attachments = func(ctx context.Context, _ string, id string) error { return fs.ValidateAttachment(ctx, actor, id) }
				service.ReferenceGuard = fs.WithReferenceGuard
			}
			fn(w, r, service, scope, visibility)
		}
	}
	for _, prefix := range []string{"", "/admin"} {
		api.Get(prefix+"/notes", handler(func(w http.ResponseWriter, r *http.Request, n *notesusecase.Notes, scope string, visibility notesusecase.NoteVisibility) {
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
		api.Post(prefix+"/notes", handler(func(w http.ResponseWriter, r *http.Request, n *notesusecase.Notes, scope string, _ notesusecase.NoteVisibility) {
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
		api.Put(prefix+"/notes/{id}", handler(func(w http.ResponseWriter, r *http.Request, n *notesusecase.Notes, scope string, _ notesusecase.NoteVisibility) {
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
		api.Delete(prefix+"/notes/{id}", handler(func(w http.ResponseWriter, r *http.Request, n *notesusecase.Notes, scope string, _ notesusecase.NoteVisibility) {
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
	api.Get("/admin/notes/management", func(w http.ResponseWriter, r *http.Request) {
		store, _, _, _ := config.Install.Services()
		session, ok := require(config.Install, w, r, "notes:manage:read")
		if !ok {
			return
		}
		identity := config.Install.Identity(true)
		filter, err := identity.Store.DataScope(r.Context(), session.User, "notes:manage:read")
		if err != nil {
			webError(w, err)
			return
		}
		q := r.URL.Query()
		page := 1
		if raw := q.Get("page"); raw != "" {
			page, _ = strconv.Atoi(raw)
		}
		repo := &notesnotessql.Repository{Store: store}
		result, err := repo.Management(r.Context(), "user/"+session.User.ID, q.Get("owner_id"), q.Get("search"), q.Get("status"), page, notesusecase.VisibilityFor("user", filter.All, filter.UserIDs))
		if err != nil {
			webError(w, err)
			return
		}
		for _, action := range []struct {
			point, operation string
			grant            func(*contracts.NoteManagementEntry, bool)
		}{
			{"notes:manage:preview", "previewManagedNote", func(item *contracts.NoteManagementEntry, allowed bool) { item.CanPreview = allowed }},
			{"notes:manage:edit", "editManagedNote", func(item *contracts.NoteManagementEntry, allowed bool) { item.CanEdit = allowed && item.CanPreview }},
			{"notes:manage:update", "updateNoteManagementStatus", func(item *contracts.NoteManagementEntry, allowed bool) { item.CanUpdate = allowed }},
			{"notes:manage:delete", "deleteManagedNote", func(item *contracts.NoteManagementEntry, allowed bool) { item.CanDelete = allowed }},
		} {
			if !platform.Has(session.User, action.point) || !platform.OperationAllowed(session.User, action.operation) {
				continue
			}
			scope, err := identity.Store.DataScope(r.Context(), session.User, action.point)
			if err != nil {
				webError(w, err)
				return
			}
			for i := range result.Items {
				item := &result.Items[i]
				action.grant(item, scope.Contains(item.OwnerID))
			}
		}
		success(w, result)
	})
	const managementPath = "/admin/notes/management/{owner}/{id}"
	api.Get(managementPath, func(w http.ResponseWriter, r *http.Request) {
		session, ok := require(config.Install, w, r, "notes:manage:preview")
		if !ok {
			return
		}
		owner := chi.URLParam(r, "owner")
		identity := config.Install.Identity(true)
		for _, point := range []string{"notes:manage:read", "notes:manage:preview"} {
			scope, err := identity.Store.DataScope(r.Context(), session.User, point)
			if err != nil {
				webError(w, err)
				return
			}
			if !scope.Contains(owner) {
				webError(w, notesusecase.ErrNoteNotFound)
				return
			}
		}
		store, _, _, _ := config.Install.Services()
		repo := &notesnotessql.Repository{Store: store}
		note, err := repo.ReadManaged(r.Context(), owner, chi.URLParam(r, "id"))
		if err != nil {
			webError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		success(w, note)
	})
	type managedWrite func(*notesnotessql.Repository, string, string, string, func(*sql.Tx) error) error
	mutate := func(w http.ResponseWriter, r *http.Request, point, operation string, write managedWrite, additionalPoints ...string) {
		session, ok := require(config.Install, w, r, point)
		if !ok {
			return
		}
		store, _, _, _ := config.Install.Services()
		repo := &notesnotessql.Repository{Store: store}
		auth := &platformsql.Repository{Store: store}
		owner := chi.URLParam(r, "owner")
		err := write(repo, session.User.ID, owner, chi.URLParam(r, "id"), func(tx *sql.Tx) error {
			return auth.AuthorizeScopedMutation(r.Context(), tx, session.User.ID, owner, point, operation, append([]string{"notes:manage:read"}, additionalPoints...)...)
		})
		if err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	}
	api.Put(managementPath, func(w http.ResponseWriter, r *http.Request) {
		var in contracts.ManagedNoteEditInput
		if decode(w, r, &in) {
			mutate(w, r, "notes:manage:edit", "editManagedNote", func(repo *notesnotessql.Repository, actor, owner, id string, authorize func(*sql.Tx) error) error {
				return repo.EditManaged(r.Context(), actor, owner, id, in, authorize)
			}, "notes:manage:preview")
		}
	})
	api.Patch(managementPath, func(w http.ResponseWriter, r *http.Request) {
		var in contracts.NoteManagementStatusInput
		if decode(w, r, &in) {
			mutate(w, r, "notes:manage:update", "updateNoteManagementStatus", func(repo *notesnotessql.Repository, actor, owner, id string, authorize func(*sql.Tx) error) error {
				return repo.UpdateManagedStatus(r.Context(), actor, owner, id, in, authorize)
			})
		}
	})
	api.Delete(managementPath, func(w http.ResponseWriter, r *http.Request) {
		var in contracts.NoteVersion
		if decode(w, r, &in) {
			mutate(w, r, "notes:manage:delete", "deleteManagedNote", func(repo *notesnotessql.Repository, actor, owner, id string, authorize func(*sql.Tx) error) error {
				return repo.DeleteManaged(r.Context(), actor, owner, id, in.Version, authorize)
			})
		}
	})
}

func noteErrorCode(err error) string {
	switch {
	case errors.Is(err, notesdomain.ErrNoteInvalid):
		return "NOTE_INVALID"
	case errors.Is(err, notesusecase.ErrNoteNotFound):
		return "NOTE_NOT_FOUND"
	case errors.Is(err, notesusecase.ErrNoteConflict):
		return "NOTE_CONFLICT"
	default:
		return ""
	}
}

// allowNoteAttachment grants access only through an actual visible note reference.
func allowNoteAttachment(w http.ResponseWriter, r *http.Request, config Config, actor files.Actor, noteID string, filter platform.ScopeFilter) bool {
	store, _, _, _ := config.Install.Services()
	visibility := notesusecase.VisibilityFor(actor.Realm, filter.All, filter.UserIDs)
	notes := &notesusecase.Notes{Repo: &notesnotessql.Repository{Store: store}}
	scope := actor.Realm + "/" + actor.ID
	if actor.Realm == "local" {
		scope = "local"
	}
	entry, err := notes.Read(r.Context(), scope, noteID, visibility)
	if err != nil {
		webError(w, err)
		return false
	}
	for _, id := range entry.AttachmentIds {
		if id == chi.URLParam(r, "id") {
			return true
		}
	}
	failure(w, 404, "NOT_FOUND", "文件不存在")
	return false
}
