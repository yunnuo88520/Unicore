// Author: yunnuo <ymz@ebox.vip>
// Description: Personal inbox endpoints; ownership comes from the session
// identity on web-platform and from the single local recipient on standalone.
package httpadapter

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/realtime"
	"github.com/yunnuo/unicore/internal/runtime"
)

// inboxRecipient resolves the inbox owner and its repository. Platform
// sessions own their account inbox; the standalone local surface owns the
// single "local" recipient (mirroring the notes local actor convention) and
// reads through the platform repository directly — the identity service stays
// an assembly omission on that profile. Administrative surfaces are
// platform-only.
func inboxRecipient(manager *install.Manager, w http.ResponseWriter, r *http.Request) (string, *platformsql.Repository, bool) {
	store, _, _, profile := manager.Services()
	if administratorRequest(r) && profile != runtime.WebPlatform {
		failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供管理端")
		return "", nil, false
	}
	if profile == runtime.WebPlatform {
		actor, ok := require(manager, w, r, "")
		if !ok {
			return "", nil, false
		}
		return actor.User.ID, &platformsql.Repository{Store: store}, true
	}
	if profile != runtime.WebStandalone {
		failure(w, 404, "NOT_FOUND", "此运行形态不提供平台接口")
		return "", nil, false
	}
	if !coreAccess(manager, w, r) {
		return "", nil, false
	}
	if store == nil {
		failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
		return "", nil, false
	}
	return "local", &platformsql.Repository{Store: store}, true
}

func mountInbox(api chi.Router, config Config) {
	manager := config.Install
	owner := func(w http.ResponseWriter, r *http.Request) (string, *platformsql.Repository, bool) {
		return inboxRecipient(manager, w, r)
	}
	api.Get("/inbox", func(w http.ResponseWriter, r *http.Request) {
		recipient, repo, ok := owner(w, r)
		if !ok {
			return
		}
		page, size := 1, 20
		var err error
		if value := r.URL.Query().Get("page"); value != "" {
			page, err = strconv.Atoi(value)
			if err != nil {
				webError(w, platform.ErrInput)
				return
			}
		}
		if value := r.URL.Query().Get("page_size"); value != "" {
			size, err = strconv.Atoi(value)
			if err != nil {
				webError(w, platform.ErrInput)
				return
			}
		}
		data, err := repo.InboxFeed(r.Context(), recipient, page, size)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Post("/inbox/read-all", func(w http.ResponseWriter, r *http.Request) {
		recipient, repo, ok := owner(w, r)
		if !ok {
			return
		}
		data, err := repo.InboxReadAll(r.Context(), recipient)
		if err != nil {
			webError(w, err)
			return
		}
		if config.Hub != nil {
			config.Hub.Publish(recipient, realtime.Event{Name: "inbox.new"})
		}
		success(w, data)
	})
	api.Post("/inbox/{id}/read", func(w http.ResponseWriter, r *http.Request) {
		recipient, repo, ok := owner(w, r)
		if !ok {
			return
		}
		data, err := repo.InboxRead(r.Context(), recipient, chi.URLParam(r, "id"))
		if err != nil {
			webError(w, err)
			return
		}
		if config.Hub != nil {
			config.Hub.Publish(recipient, realtime.Event{Name: "inbox.new"})
		}
		success(w, data)
	})
}
