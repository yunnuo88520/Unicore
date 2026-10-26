// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-only OIDC routes, fixed callback and browser proof cookies.
package httpadapter

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

const oidcCookie = "unicore_oidc_browser"

func mountOIDC(api chi.Router, config Config) {
	m := config.Install
	service := func(w http.ResponseWriter) *platform.OIDC {
		s := m.OIDC()
		if s == nil {
			failure(w, 404, "NOT_FOUND", "此运行形态不提供企业登录")
		}
		return s
	}
	cookie := func(w http.ResponseWriter, value string, age int) {
		http.SetCookie(w, &http.Cookie{Name: oidcCookie, Value: value, Path: "/api/v1/auth/oidc/callback", HttpOnly: true, Secure: strings.HasPrefix(m.BaseURL(), "https://"), SameSite: http.SameSiteLaxMode, MaxAge: age})
	}
	api.Get("/auth/oidc", func(w http.ResponseWriter, r *http.Request) {
		s := service(w)
		if s == nil {
			return
		}
		info, err := s.Info(r.Context(), "")
		if err != nil {
			webError(w, err)
			return
		}
		success(w, info)
	})
	api.Get("/account/oidc", func(w http.ResponseWriter, r *http.Request) {
		a, ok := require(m, w, r, "")
		if !ok {
			return
		}
		s := service(w)
		if s == nil {
			return
		}
		info, err := s.Info(r.Context(), a.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, info)
	})
	for _, link := range []bool{false, true} {
		path := "/auth/oidc/start"
		if link {
			path = "/account/oidc/link"
		}
		api.Post(path, func(w http.ResponseWriter, r *http.Request) {
			s := service(w)
			if s == nil {
				return
			}
			var user contracts.User
			input := contracts.OIDCPasswordInput{}
			if link {
				a, ok := require(m, w, r, "")
				if !ok {
					return
				}
				user = a.User
				if !decode(w, r, &input) {
					return
				}
			}
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			u, browser, err := s.Start(ctx, user, input.Password, rawSession(r), ip(r))
			if err != nil {
				webError(w, err)
				return
			}
			cookie(w, browser, 300)
			success(w, contracts.OIDCStart{AuthorizationUrl: u})
		})
	}
	api.Post("/account/oidc/unlink", func(w http.ResponseWriter, r *http.Request) {
		a, ok := require(m, w, r, "")
		if !ok {
			return
		}
		s := service(w)
		if s == nil {
			return
		}
		var input contracts.OIDCPasswordInput
		if !decode(w, r, &input) {
			return
		}
		session, token, err := s.Unlink(r.Context(), a.User, input.Password, rawSession(r), ip(r))
		if err != nil {
			webError(w, err)
			return
		}
		setSession(m, w, token, session.ExpiresAt)
		success(w, session)
	})
	api.Post("/admin/settings/oidc/check", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(m, w, r, "settings:write"); !ok {
			return
		}
		s := service(w)
		if s == nil {
			return
		}
		_, _, identity, _ := m.Services()
		if !identity.Limiter.Allow("oidc-check:"+ip(r), 10, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		if err := s.Check(ctx); err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
	api.Get("/auth/oidc/callback", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		s := service(w)
		if s == nil {
			return
		}
		q, queryErr := url.ParseQuery(r.URL.RawQuery)
		valid := queryErr == nil && len(r.URL.RawQuery) <= 8192
		for _, name := range []string{"state", "code", "error", "iss"} {
			if len(q[name]) > 1 || len(q.Get(name)) > 2048 {
				valid = false
			}
		}
		proof := ""
		if c, err := r.Cookie(oidcCookie); err == nil {
			proof = c.Value
		}
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		session, token, mode, err := s.Complete(ctx, q.Get("state"), proof, q.Get("code"), q.Get("iss"), !valid || q.Get("error") != "")
		cookie(w, "", -1)
		result := "success"
		if err != nil {
			result = "failed"
			if errors.Is(err, platform.ErrOIDCLinkRequired) {
				result = "link_required"
			}
		} else {
			setSession(m, w, token, session.ExpiresAt)
		}
		destination := "/#oidc=" + result
		if mode == "link" {
			destination = "/#account?oidc=" + result
		}
		http.Redirect(w, r, destination, http.StatusSeeOther)
	})
}
