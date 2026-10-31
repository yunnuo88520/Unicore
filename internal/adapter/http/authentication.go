// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit administrator/user authentication routes share handlers, never credentials or realm selection headers.
package httpadapter

import (
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func mountAuthentication(api chi.Router, config Config) {
	manager := config.Install
	limiter := platform.NewLimiter()
	for _, prefix := range []string{"", "/admin"} {
		api.Get(prefix+"/auth/captcha", func(w http.ResponseWriter, r *http.Request) {
			identity := manager.Identity(administratorRequest(r))
			if identity == nil {
				failure(w, 404, "NOT_FOUND", "接口不存在")
				return
			}
			if !limiter.Allow("captcha:"+ip(r), 30, time.Minute) {
				webError(w, platform.ErrRateLimited)
				return
			}
			id, image := identity.Captchas.Create()
			if id == "" {
				webError(w, platform.ErrRateLimited)
				return
			}
			success(w, contracts.Captcha{ID: id, Image: image})
		})
		api.Post(prefix+"/auth/login", func(w http.ResponseWriter, r *http.Request) {
			_, service, _, _ := manager.Services()
			identity := manager.Identity(administratorRequest(r))
			if identity == nil {
				failure(w, 404, "NOT_FOUND", "接口不存在")
				return
			}
			var input contracts.LoginInput
			if !decode(w, r, &input) {
				return
			}
			captcha, err := service.Value(r.Context(), "security.login_captcha")
			if err != nil {
				webError(w, err)
				return
			}
			hoursValue, err := service.Value(r.Context(), "security.session_hours")
			if err != nil {
				webError(w, err)
				return
			}
			hours, _ := strconv.Atoi(hoursValue)
			session, token, err := identity.Login(r.Context(), input, ip(r), captcha == "true", hours)
			if err != nil {
				webError(w, err)
				return
			}
			setSession(manager, w, token, session.ExpiresAt, r)
			success(w, session)
		})
		api.Get(prefix+"/auth/session", func(w http.ResponseWriter, r *http.Request) {
			if session, ok := require(manager, w, r, ""); ok {
				success(w, session)
			}
		})
		api.Post(prefix+"/auth/logout", func(w http.ResponseWriter, r *http.Request) {
			if _, ok := require(manager, w, r, ""); !ok {
				return
			}
			identity := manager.Identity(administratorRequest(r))
			if err := identity.Store.DeleteSession(r.Context(), platform.Hash(rawSession(r))); err != nil {
				webError(w, err)
				return
			}
			http.SetCookie(w, &http.Cookie{Name: identityCookie(r), Path: "/", HttpOnly: true, Secure: strings.HasPrefix(manager.BaseURL(), "https://"), SameSite: http.SameSiteLaxMode, MaxAge: -1})
			success(w, contracts.ActionResult{Success: true})
		})
		api.Post(prefix+"/account/password", func(w http.ResponseWriter, r *http.Request) {
			actor, ok := require(manager, w, r, "")
			if !ok {
				return
			}
			var input contracts.ChangePasswordInput
			if !decode(w, r, &input) {
				return
			}
			identity := manager.Identity(administratorRequest(r))
			if err := identity.ChangePassword(r.Context(), actor.User, input, ip(r)); err != nil {
				webError(w, err)
				return
			}
			http.SetCookie(w, &http.Cookie{Name: identityCookie(r), Path: "/", HttpOnly: true, Secure: strings.HasPrefix(manager.BaseURL(), "https://"), SameSite: http.SameSiteLaxMode, MaxAge: -1})
			success(w, contracts.ActionResult{Success: true})
		})

	}
}
