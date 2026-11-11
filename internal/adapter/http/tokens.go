// Author: yunnuo <ymz@ebox.vip>
// Description: Cookie-only credential management and cookie-free client authentication.
package httpadapter

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
)

type bearerKey struct{}

func bearerFrom(r *http.Request) (platform.BearerIdentity, bool) {
	b, ok := r.Context().Value(bearerKey{}).(platform.BearerIdentity)
	return b, ok
}
func credentialCookie(r *http.Request) bool { _, err := r.Cookie(sessionCookie); return err == nil }
func mountTokens(api chi.Router, config Config) {
	manager := config.Install
	service := func(w http.ResponseWriter, r *http.Request) *platform.Tokens {
		identity := manager.Identity(false)
		if identity == nil || identity.Tokens == nil {
			failure(w, 404, "NOT_FOUND", "接口不存在")
			return nil
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Pragma", "no-cache")
		return identity.Tokens
	}
	public := func(w http.ResponseWriter, r *http.Request) *platform.Tokens {
		t := service(w, r)
		if t == nil {
			return nil
		}
		// Never choose silently between Cookie and explicit bearer/proof inputs.
		if credentialCookie(r) || r.Header.Get("Authorization") != "" || !sameOrigin(r) {
			webError(w, platform.ErrForbidden)
			return nil
		}
		if !t.Identity.Limiter.Allow("client-token:"+ip(r), 60, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return nil
		}
		return t
	}
	browser := func(w http.ResponseWriter, r *http.Request) (*platform.Tokens, contracts.Session, bool) {
		t := service(w, r)
		if t == nil {
			return nil, contracts.Session{}, false
		}
		if r.Header.Get("Authorization") != "" {
			webError(w, platform.ErrForbidden)
			return nil, contracts.Session{}, false
		}
		s, ok := require(manager, w, r, "")
		return t, s, ok
	}
	api.Post("/auth/token", func(w http.ResponseWriter, r *http.Request) {
		t := public(w, r)
		if t == nil {
			return
		}
		var input contracts.LoginInput
		if !decode(w, r, &input) {
			return
		}
		values, err := t.Identity.Settings.Raw(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		var policy settings.SessionPolicy
		if err = settings.Bind(values, &policy); err != nil {
			webError(w, err)
			return
		}
		session, raw, err := t.Identity.Login(r.Context(), input, ip(r), policy.LoginCaptcha, policy.HumanCheckEnabled && t.Identity.HumanCheck != nil, policy.SessionHours)
		if err != nil {
			if errors.Is(err, platform.ErrCredentials) || errors.Is(err, platform.ErrCaptcha) {
				store, _, _, _ := manager.Services()
				meta, _ := audit.From(r.Context())
				meta.ActorName = strings.TrimSpace(input.Username)
				meta.Detail = "entry=client-token; reason=credentials"
				if auditErr := store.Audit(audit.With(r.Context(), meta), store.DB, "", "auth.login.failed"); auditErr != nil {
					webError(w, auditErr)
					return
				}
			}

			webError(w, err)
			return
		}
		if session.MfaPending != nil && *session.MfaPending {
			proof, err := t.Challenge(r.Context(), raw)
			if err != nil {
				_ = t.Identity.Store.DeleteSession(r.Context(), platform.Hash(raw))
				webError(w, err)
				return
			}
			success(w, contracts.ClientTokenLogin{MfaRequired: true, ChallengeToken: &proof})
			return
		}
		pair, err := t.Exchange(r.Context(), raw, "client")
		if err != nil {
			_ = t.Identity.Store.DeleteSession(r.Context(), platform.Hash(raw))
			webError(w, err)
			return
		}
		success(w, contracts.ClientTokenLogin{MfaRequired: false, Tokens: &pair})
	})
	api.Post("/auth/token/mfa", func(w http.ResponseWriter, r *http.Request) {
		t := public(w, r)
		if t == nil {
			return
		}
		var input contracts.ClientTokenMFAInput
		if !decode(w, r, &input) {
			return
		}
		raw, err := t.ChallengeSession(r.Context(), input.ChallengeToken)
		if err != nil {
			webError(w, err)
			return
		}
		if err := t.Identity.Personal.Factor(r.Context(), raw, input.Code, ip(r), false); err != nil {
			webError(w, err)
			return
		}
		pair, err := t.Exchange(r.Context(), raw, "client")
		if err != nil {
			webError(w, err)
			return
		}
		success(w, pair)
	})
	api.Post("/auth/token/refresh", func(w http.ResponseWriter, r *http.Request) {
		t := public(w, r)
		if t == nil {
			return
		}
		var input contracts.RefreshTokenInput
		if !decode(w, r, &input) {
			return
		}
		pair, err := t.Refresh(r.Context(), input.RefreshToken)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, pair)
	})
	api.Post("/auth/token/revoke", func(w http.ResponseWriter, r *http.Request) {
		t := public(w, r)
		if t == nil {
			return
		}
		var input contracts.RefreshTokenInput
		if !decode(w, r, &input) {
			return
		}
		if err := t.Revoke(r.Context(), input.RefreshToken); err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
	api.Get("/account/token-scopes", func(w http.ResponseWriter, r *http.Request) {
		t, s, ok := browser(w, r)
		if !ok {
			return
		}
		success(w, contracts.TokenScopeList{Items: t.Scopes(s.User)})
	})
	api.Get("/account/tokens", func(w http.ResponseWriter, r *http.Request) {
		t, s, ok := browser(w, r)
		if !ok {
			return
		}
		rows, err := t.Store.PersonalTokens(r.Context(), s.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		items := []contracts.PersonalToken{}
		for _, row := range rows {
			items = append(items, platform.PersonalTokenView(row))
		}
		success(w, contracts.PersonalTokenList{Items: items})
	})
	api.Post("/account/tokens", func(w http.ResponseWriter, r *http.Request) {
		t, _, ok := browser(w, r)
		if !ok {
			return
		}
		var input contracts.PersonalTokenInput
		if !decode(w, r, &input) {
			return
		}
		result, err := t.CreatePAT(r.Context(), rawSession(r), input)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, result)
	})
	api.Delete("/account/tokens/{id}", func(w http.ResponseWriter, r *http.Request) {
		t, s, ok := browser(w, r)
		if !ok {
			return
		}
		if err := t.Store.RevokePersonalToken(r.Context(), s.User.ID, chi.URLParam(r, "id")); err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
	api.Post("/admin/auth/token-keys/rotate", func(w http.ResponseWriter, r *http.Request) {
		t, s, ok := browser(w, r)
		if !ok {
			return
		}
		if err := t.RotateSigningKey(r.Context(), s.User.ID); err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
}

// resolveBearer never falls back to cookies when explicit credentials fail.
func resolveBearer(w http.ResponseWriter, r *http.Request, identity *platform.Service) (contracts.Session, bool) {
	invalid := func() (contracts.Session, bool) {
		w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
		failure(w, 401, "AUTH_REQUIRED", "登录已失效，请重新登录")
		return contracts.Session{}, false
	}

	values := r.Header.Values("Authorization")
	if len(values) != 1 || credentialCookie(r) || identity.Tokens == nil {
		return invalid()
	}
	parts := strings.Split(values[0], " ")
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return invalid()
	}
	bearer, err := identity.Tokens.Resolve(r.Context(), parts[1])
	if err != nil {
		if errors.Is(err, platform.ErrCredentials) {
			return invalid()
		}
		webError(w, err)
		return contracts.Session{}, false
	}
	*r = *r.WithContext(context.WithValue(r.Context(), bearerKey{}, bearer))
	return bearer.Session, true
}

// Adapters consume the common authenticated principal, regardless of transport.
func requestIdentitySession(r *http.Request, identity *platform.Service) (contracts.Session, error) {
	if s, ok := r.Context().Value(policySessionKey{}).(contracts.Session); ok {
		return s, nil
	}
	if b, ok := bearerFrom(r); ok {
		return b.Session, nil
	}
	return identity.Session(r.Context(), rawSession(r))
}
