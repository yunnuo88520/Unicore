// Author: yunnuo <ymz@ebox.vip>
// Description: Personal inbox endpoints; ownership comes from the session identity, never from parameters.
package httpadapter

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/realtime"
)

func mountInbox(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/inbox", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "")
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
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.InboxFeed(r.Context(), actor.User.ID, page, size)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Post("/inbox/read-all", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "")
		if !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.InboxReadAll(r.Context(), actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		if config.Hub != nil {
			config.Hub.Publish(actor.User.ID, realtime.Event{Name: "inbox.new"})
		}
		success(w, data)
	})
	api.Post("/inbox/{id}/read", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "")
		if !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.InboxRead(r.Context(), actor.User.ID, chi.URLParam(r, "id"))
		if err != nil {
			webError(w, err)
			return
		}
		if config.Hub != nil {
			config.Hub.Publish(actor.User.ID, realtime.Event{Name: "inbox.new"})
		}
		success(w, data)
	})
}
