// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator-only notification configuration, safe previews and rate-limited test delivery.
package httpadapter

import (
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
	"net/http"
	"time"
)

func mountNotifications(api chi.Router, config Config) {
	base := "/admin/settings/notifications"
	api.Get(base, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(config.Install, w, r, "settings:read"); !ok {
			return
		}
		_, s, _, _ := config.Install.Services()
		result, e := s.Notifications(r.Context())
		if e != nil {
			webError(w, e)
			return
		}
		success(w, result)
	})
	api.Put(base, func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(config.Install, w, r, "settings:write")
		if !ok {
			return
		}
		var input contracts.NotifyConfiguration
		if !decode(w, r, &input) {
			return
		}
		_, s, _, _ := config.Install.Services()
		result, e := s.SaveNotifications(r.Context(), input, actor.User.ID)
		if e != nil {
			webError(w, e)
			return
		}
		success(w, result)
	})
	api.Post(base+"/preview", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(config.Install, w, r, "settings:write"); !ok {
			return
		}
		var input contracts.NotifyTemplate
		if !decode(w, r, &input) {
			return
		}
		result, e := config.Install.Mail().PreviewNotification(r.Context(), input)
		if e != nil {
			webError(w, settings.ErrInvalid)
			return
		}
		success(w, result)
	})
	api.Post(base+"/test", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(config.Install, w, r, "settings:write")
		if !ok {
			return
		}
		var input contracts.NotifyTest
		if !decode(w, r, &input) {
			return
		}
		if !config.Install.Identity(true).Limiter.Allow("notification-test:"+actor.User.ID, 5, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		// Record only the test destination type, never credentials, recipient or message content.
		store, _, _, _ := config.Install.Services()
		if e := store.Audit(audit.Target(r.Context(), "notification-test/"+input.Destination, "requested"), store.DB, actor.User.ID, "notification.test.requested"); e != nil {
			webError(w, e)
			return
		}
		if e := config.Install.Mail().TestNotification(r.Context(), input, actor.User.ID); e != nil {
			webError(w, e)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
}
