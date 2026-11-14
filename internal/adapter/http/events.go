// Author: yunnuo <ymz@ebox.vip>
// Description: Authenticated server-sent events with session revalidation, write deadlines and cancellation.
package httpadapter

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
)

func mountEvents(api chi.Router, config Config) {
	api.Get("/events", func(w http.ResponseWriter, r *http.Request) {
		if config.Hub == nil {
			failure(w, 404, "NOT_FOUND", "接口不存在")
			return
		}
		_, _, _, profile := config.Install.Services()
		if administratorRequest(r) && profile != runtime.WebPlatform {
			failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供管理端")
			return
		}
		if profile != runtime.WebPlatform && profile != runtime.WebStandalone {
			failure(w, 404, "NOT_FOUND", "此运行形态不提供平台接口")
			return
		}
		standalone := profile == runtime.WebStandalone
		recipient := ""
		if standalone {
			// The single local surface owns one inbox recipient; the hub key
			// mirrors it so module deliveries reach the stream.
			if !coreAccess(config.Install, w, r) {
				return
			}
			recipient = "local"
		} else {
			session, ok := require(config.Install, w, r, "")
			if !ok {
				return
			}
			recipient = session.User.ID
		}
		// Background heartbeats and broadcast traffic are not user activity.
		validationCtx := platform.WithPassive(r.Context())
		valid := func() bool {
			if standalone {
				// The local surface re-gates on reconnect; heartbeats only
				// confirm the profile has not changed mid-stream.
				_, _, _, current := config.Install.Services()
				return current == runtime.WebStandalone
			}
			identity := config.Install.Identity(false)
			if identity == nil {
				return false
			}
			current, err := identity.Session(validationCtx, rawSession(r))
			if err != nil || current.User.ID != recipient {
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
		events, cancel := config.Hub.Subscribe(recipient)
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
			case event, open := <-events:
				if !open || !valid() {
					return
				}
				// SSE names cannot contain newlines; data is framed one line at a time so
				// even internal multiline payloads cannot inject additional event fields.
				if strings.ContainsAny(event.Name, "\r\n") {
					continue
				}
				data := strings.ReplaceAll(strings.ReplaceAll(event.Data, "\r\n", "\n"), "\r", "\n")
				frame := "event: " + event.Name + "\n"
				for _, line := range strings.Split(data, "\n") {
					frame += "data: " + line + "\n"
				}
				if !write(frame + "\n") {
					return
				}
			}
		}
	})
}
