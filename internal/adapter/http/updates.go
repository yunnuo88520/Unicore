// Author: yunnuo <ymz@ebox.vip>
// Description: Every update operation enforces administrator realm or an installed loopback-only local instance.
package httpadapter

import (
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/updateport"
	"mime"
	"net"
	"net/http"
	"strings"
)

func mountUpdates(api chi.Router, config Config) {
	for _, prefix := range []string{"/updates", "/admin/updates"} {
		authorize := func(w http.ResponseWriter, r *http.Request, permission string) (contracts.Session, bool) {
			if config.Install == nil {
				failure(w, 404, "NOT_FOUND", "此版本未启用系统更新")
				return contracts.Session{}, false
			}
			if !config.Install.Installed() {
				failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
				return contracts.Session{}, false
			}
			_, _, _, profile := config.Install.Services()
			if strings.HasPrefix(prefix, "/admin/") {
				session, ok := require(config.Install, w, r, permission)
				if !ok {
					return contracts.Session{}, false
				}
				if config.Updates == nil {
					failure(w, 404, "NOT_FOUND", "此版本未启用系统更新")
					return contracts.Session{}, false
				}
				return session, true
			}
			if profile != runtime.WebStandalone {
				failure(w, 404, "NOT_FOUND", "接口不存在")
				return contracts.Session{}, false
			}
			host, _, e := net.SplitHostPort(r.Host)
			if e != nil {
				host = r.Host
			}
			remote, _, _ := net.SplitHostPort(r.RemoteAddr)
			ip := net.ParseIP(host)
			peer := net.ParseIP(remote)
			if (host != "localhost" && (ip == nil || !ip.IsLoopback())) || peer == nil || !peer.IsLoopback() {
				failure(w, 403, "PERMISSION_DENIED", "单机系统更新仅允许在本机访问")
				return contracts.Session{}, false
			}
			if config.Updates == nil {
				failure(w, 404, "NOT_FOUND", "此版本未启用系统更新")
				return contracts.Session{}, false
			}
			return contracts.Session{}, true
		}
		api.Get(prefix, func(w http.ResponseWriter, r *http.Request) {
			if _, ok := authorize(w, r, "updates:read"); ok {
				success(w, config.Updates.Overview(r.Context()))
			}
		})
		api.Post(prefix+"/check", func(w http.ResponseWriter, r *http.Request) {
			if _, ok := authorize(w, r, "updates:read"); !ok {
				return
			}
			media, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if media != "application/json" {
				failure(w, 415, "UNSUPPORTED_MEDIA_TYPE", "请使用 application/json")
				return
			}
			success(w, config.Updates.Check(r.Context()))
		})
		api.Post(prefix+"/apply", func(w http.ResponseWriter, r *http.Request) {
			session, ok := authorize(w, r, "updates:apply")
			if !ok {
				return
			}
			var input contracts.UpdateApplyInput
			if !decode(w, r, &input) {
				return
			}
			job, e := config.Updates.Apply(r.Context(), input)
			if e != nil {
				code := "UPDATE_REJECTED"
				if errors.Is(e, updateport.ErrBusy) {
					code = "UPDATE_BUSY"
				}
				definition := contracts.ErrorCatalog[code]
				failure(w, definition.Status, code, definition.Message)
				return
			}
			// Record the request; the job outcome is observable in the
			// update history and process restart.
			if store, _, _, _ := config.Install.Services(); store != nil {
				actor := session.User.ID
				if actor == "" {
					actor = "local"
				}
				if e := store.Audit(audit.Target(r.Context(), "updates/apply", "version="+input.Version+" job="+job.ID), store.DB, actor, "updates.apply_requested"); e != nil {
					webError(w, e)
					return
				}
			}
			success(w, job)
		})
	}
}
