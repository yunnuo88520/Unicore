// Author: yunnuo <ymz@ebox.vip>
// Description: Every update operation enforces administrator realm or an installed loopback-only local instance.
package httpadapter

import (
	"errors"
	"github.com/go-chi/chi/v5"
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
		authorize := func(w http.ResponseWriter, r *http.Request, permission string) bool {
			if config.Install == nil {
				failure(w, 404, "NOT_FOUND", "此版本未启用系统更新")
				return false
			}
			if !config.Install.Installed() {
				failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
				return false
			}
			_, _, _, profile := config.Install.Services()
			if strings.HasPrefix(prefix, "/admin/") {
				_, ok := require(config.Install, w, r, permission)
				if !ok {
					return false
				}
				if config.Updates == nil {
					failure(w, 404, "NOT_FOUND", "此版本未启用系统更新")
					return false
				}
				return true
			}
			if profile != runtime.WebStandalone {
				failure(w, 404, "NOT_FOUND", "接口不存在")
				return false
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
				return false
			}
			if config.Updates == nil {
				failure(w, 404, "NOT_FOUND", "此版本未启用系统更新")
				return false
			}
			return true
		}
		api.Get(prefix, func(w http.ResponseWriter, r *http.Request) {
			if authorize(w, r, "updates:read") {
				success(w, config.Updates.Overview(r.Context()))
			}
		})
		api.Post(prefix+"/check", func(w http.ResponseWriter, r *http.Request) {
			if !authorize(w, r, "updates:read") {
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
			if !authorize(w, r, "updates:apply") {
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
			success(w, job)
		})
	}
}
