// Author: yunnuo <ymz@ebox.vip>
// Description: Cookie-only credential management and cookie-free client authentication.
package httpadapter

import (
	"context"
	"errors"
	"net/http"
	"strconv"
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
	pagination := func(r *http.Request) (int, int, string) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		size, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
		if page < 1 {
			page = 1
		}
		if size < 1 || size > 100 {
			size = 20
		}
		return page, size, r.URL.Query().Get("search")
	}
	for _, manage := range []bool{false, true} {
		base := "/account/tokens"
		roles := "/account/token-roles"
		if manage {
			base = "/admin/access-tokens"
			roles = base + "/users/{id}/roles"
		}
		api.Get(roles, func(w http.ResponseWriter, r *http.Request) {
			t, _, ok := browser(w, r)
			if !ok {
				return
			}
			result, err := t.Store.PersonalTokenRoles(r.Context(), platform.Hash(rawSession(r)), chi.URLParam(r, "id"), manage)
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		api.Get(base, func(w http.ResponseWriter, r *http.Request) {
			t, _, ok := browser(w, r)
			if !ok {
				return
			}
			page, size, search := pagination(r)
			rows, total, err := t.Store.PersonalTokens(r.Context(), platform.Hash(rawSession(r)), manage, search, page, size)
			if err != nil {
				webError(w, err)
				return
			}
			items := []contracts.PersonalToken{}
			for _, row := range rows {
				items = append(items, platform.PersonalTokenView(row))
			}
			success(w, contracts.PersonalTokenList{Items: items, Total: total, Page: page, PageSize: size})
		})
		api.Post(base, func(w http.ResponseWriter, r *http.Request) {
			t, _, ok := browser(w, r)
			if !ok {
				return
			}
			var input contracts.PersonalTokenInput
			var targets []string
			if manage {
				var admin contracts.AdminPersonalTokenInput
				if !decode(w, r, &admin) {
					return
				}
				input = contracts.PersonalTokenInput{Name: admin.Name, RoleID: admin.RoleID, Remark: admin.Remark, ExpiresInDays: admin.ExpiresInDays}
				targets = []string{admin.UserID}
			} else if !decode(w, r, &input) {
				return
			}
			result, err := t.CreatePAT(r.Context(), rawSession(r), input, targets...)
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		api.Delete(base+"/{id}", func(w http.ResponseWriter, r *http.Request) {
			t, _, ok := browser(w, r)
			if !ok {
				return
			}
			if err := t.Store.RevokePersonalToken(r.Context(), platform.Hash(rawSession(r)), chi.URLParam(r, "id"), manage); err != nil {
				webError(w, err)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		})
		api.Post(base+"/{id}/renew", func(w http.ResponseWriter, r *http.Request) {
			t, _, ok := browser(w, r)
			if !ok {
				return
			}
			var input contracts.PersonalTokenRenewInput
			if !decode(w, r, &input) {
				return
			}
			if err := t.Store.RenewPersonalToken(r.Context(), platform.Hash(rawSession(r)), chi.URLParam(r, "id"), input.ExpiresInDays, manage); err != nil {
				webError(w, err)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		})
	}
	api.Get("/admin/access-tokens/users", func(w http.ResponseWriter, r *http.Request) {
		t, _, ok := browser(w, r)
		if !ok {
			return
		}
		page, size, search := pagination(r)
		result, err := t.Store.PersonalTokenUsers(r.Context(), platform.Hash(rawSession(r)), search, page, size)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, result)
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
	ctx := context.WithValue(r.Context(), bearerKey{}, bearer)
	if bearer.Credential.Kind == "pat" {
		ctx = platform.WithTokenRole(ctx, bearer.Credential.UserID, bearer.Credential.RoleID)
	}
	*r = *r.WithContext(ctx)
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
