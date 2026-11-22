// Author: yunnuo <ymz@ebox.vip>
// Description: Best-effort security audit for authorization and CSRF rejections; bounded per identity and never changes the HTTP outcome.
package httpadapter

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
)

// denialAuditLimiter bounds audit rows per identity: an authenticated client
// probing the permission surface must not flood unicore_audit_logs. Beyond
// the cap the rejection still answers 403; only the audit row is dropped.
var denialAuditLimiter = platform.NewLimiter()

const denialAuditPerMinute = 30

// recordDenial writes one security audit row for an authorization or CSRF
// rejection. It never panics, never blocks beyond a short timeout and never
// overrides the response the caller already sent.
func recordDenial(manager *install.Manager, r *http.Request, session *contracts.Session, action, detail string) {
	if manager == nil {
		return
	}
	store, _, _, _ := manager.Services()
	if store == nil {
		return
	}
	meta, _ := audit.From(r.Context())
	if meta.Target == "" {
		meta.Target = r.URL.Path
	}
	key := ""
	actorID := ""
	if session != nil {
		actorID = session.User.ID
		meta.ActorName = session.User.Username
		key = "user:" + actorID
	}
	if meta.IP == "" {
		meta.IP = ip(r)
	}
	if key == "" {
		key = "ip:" + meta.IP
	}
	meta.Detail = detail
	if !denialAuditLimiter.Allow("authz-audit:"+key, denialAuditPerMinute, time.Minute) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := store.Audit(audit.With(ctx, meta), store.DB, actorID, action); err != nil {
		slog.Warn("security denial audit failed", "event", "http.audit_denial_failed", "error", err.Error())
	}
}
