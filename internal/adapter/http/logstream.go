// Author: yunnuo <ymz@ebox.vip>
// Description: Super-administrator live log stream; taps the process logger over SSE with session revalidation.
package httpadapter

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/platform"
)

func mountLogStream(api chi.Router, config Config) {
	api.Get("/admin/logs/stream", func(w http.ResponseWriter, r *http.Request) {
		if config.LogBroadcast == nil {
			failure(w, 404, "NOT_FOUND", "接口不存在")
			return
		}
		session, ok := require(config.Install, w, r, "")
		if !ok {
			return
		}
		// SuperAdmin is enforced by the contract policy; a restricted
		// administrator never reaches the handler.
		store, _, _, _ := config.Install.Services()
		if e := store.Audit(audit.Target(r.Context(), "admin/logs/stream", "opened"), store.DB, session.User.ID, "logs.viewed"); e != nil {
			webError(w, e)
			return
		}
		// Background heartbeats and replay traffic are not user activity.
		validationCtx := platform.WithPassive(r.Context())
		valid := func() bool {
			identity := config.Install.Identity(true)
			if identity == nil {
				return false
			}
			current, err := identity.Session(validationCtx, rawSession(r))
			if err != nil || current.User.ID != session.User.ID {
				return false
			}
			if identity.Personal != nil {
				info, err := identity.Personal.Profile(validationCtx, rawSession(r))
				if err != nil || (info.Force2fa && !info.TotpEnabled) {
					return false
				}
			}
			return true
		}
		lines, cancel := config.LogBroadcast.Subscribe()
		defer cancel()
		controller := http.NewResponseController(w)
		// Also works through middleware wrappers exposing Unwrap. Unsupported
		// deadlines on test recorders do not prevent streaming.
		write := func(frame string) bool {
			_ = controller.SetWriteDeadline(time.Now().Add(65 * time.Second))
			if _, err := fmt.Fprint(w, frame); err != nil {
				return false
			}
			return controller.Flush() == nil
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Accel-Buffering", "no")
		if !write("retry: 5000\n\n") {
			return
		}
		heartbeat := time.NewTicker(30 * time.Second)
		defer heartbeat.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case <-heartbeat.C:
				if !valid() || !write(": heartbeat\n\n") {
					return
				}
			case line, open := <-lines:
				if !open || !valid() {
					return
				}
				// The broadcaster splits on newlines, but keep the framing
				// defense-in-depth clean of control characters.
				line = strings.ReplaceAll(strings.ReplaceAll(line, "\r", ""), "\n", "")
				if !write("data: " + line + "\n\n") {
					return
				}
			}
		}
	})
}
