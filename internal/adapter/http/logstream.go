// Author: yunnuo <ymz@ebox.vip>
// Description: Super-administrator live log stream; taps the process logger over SSE with session revalidation.
package httpadapter

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func mountLogStream(api chi.Router, config Config) {
	// Paged history for the live console: the client renders the newest page
	// immediately and pulls older pages while scrolling up.
	api.Get("/admin/logs/tail", func(w http.ResponseWriter, r *http.Request) {
		if config.LogBroadcast == nil {
			failure(w, 404, "NOT_FOUND", "接口不存在")
			return
		}
		if _, ok := require(config.Install, w, r, ""); !ok {
			return
		}
		// SuperAdmin is enforced by the contract policy; a restricted
		// administrator never reaches the handler.
		before, _ := strconv.ParseInt(r.URL.Query().Get("before_seq"), 10, 64)
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 1000 {
			limit = 200
		}
		items, latest, older := config.LogBroadcast.Tail(before, limit)
		entries := make([]contracts.LogTailEntry, len(items))
		for i, item := range items {
			entries[i] = contracts.LogTailEntry{Seq: int(item.Seq), Line: item.Line}
		}
		success(w, contracts.LogTailList{Items: entries, LatestSeq: int(latest), OlderCount: older})
	})
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
		// The client pages history through the tail endpoint and opens the
		// stream at its cursor; replay after a reconnect stays bounded too.
		after, _ := strconv.ParseInt(r.URL.Query().Get("after_seq"), 10, 64)
		lines, cancel := config.LogBroadcast.SubscribeFrom(after)
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
			case entry, open := <-lines:
				if !open || !valid() {
					return
				}
				// The broadcaster splits on newlines, but keep the framing
				// defense-in-depth clean of control characters.
				line := strings.ReplaceAll(strings.ReplaceAll(entry.Line, "\r", ""), "\n", "")
				// The SSE id carries the sequence so clients can dedupe a
				// replay after reconnect and resume their cursor.
				frame := "data: " + line + "\n\n"
				if entry.Seq > 0 {
					frame = "id: " + strconv.FormatInt(entry.Seq, 10) + "\n" + frame
				}
				if !write(frame) {
					return
				}
			}
		}
	})
}
