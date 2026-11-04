// Author: yunnuo <ymz@ebox.vip>
// Description: Fixed-realm own-account endpoints; restricted MFA sessions cannot access workspace APIs.
package httpadapter

import (
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"net/http"
)

func mountPersonal(api chi.Router, config Config) {
	m := config.Install
	for _, prefix := range []string{"", "/admin"} {
		personal := func(w http.ResponseWriter, r *http.Request) *platform.Personal {
			if _, ok := require(m, w, r, ""); !ok {
				return nil
			}
			identity := m.Identity(administratorRequest(r))
			if identity == nil || identity.Personal == nil {
				failure(w, 404, "NOT_FOUND", "接口不存在")
				return nil
			}
			return identity.Personal
		}
		api.Get(prefix+"/account/profile", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			result, err := p.Profile(r.Context(), rawSession(r))
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		api.Patch(prefix+"/account/profile", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			var input contracts.ProfileInput
			if !decode(w, r, &input) {
				return
			}
			result, err := p.SaveName(r.Context(), rawSession(r), input.DisplayName)
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		api.Get(prefix+"/account/totp/setup", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			result, err := p.PendingTOTP(r.Context(), rawSession(r))
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		api.Post(prefix+"/account/totp/setup", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			var input contracts.TOTPSetupInput
			if !decode(w, r, &input) {
				return
			}
			result, err := p.BeginTOTP(r.Context(), rawSession(r), input.Password, ip(r))
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		api.Post(prefix+"/account/totp/cancel", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			if err := p.Store.CancelTOTPSetup(r.Context(), platform.Hash(rawSession(r))); err != nil {
				webError(w, err)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		})
		api.Post(prefix+"/account/totp/enable", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			var input contracts.SecurityCodeInput
			if !decode(w, r, &input) {
				return
			}
			result, err := p.Enable(r.Context(), rawSession(r), input.Code)
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		api.Post(prefix+"/account/totp/disable", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			var input contracts.SecurityCodeInput
			if !decode(w, r, &input) {
				return
			}
			if err := p.Factor(r.Context(), rawSession(r), input.Code, ip(r), true); err != nil {
				webError(w, err)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		})
		api.Post(prefix+"/auth/mfa", func(w http.ResponseWriter, r *http.Request) {
			identity := m.Identity(administratorRequest(r))
			if identity == nil || identity.Personal == nil {
				failure(w, 404, "NOT_FOUND", "接口不存在")
				return
			}
			session, err := identity.Personal.Pending(r.Context(), rawSession(r))
			if err != nil {
				webError(w, platform.ErrCredentials)
				return
			}
			if !platform.Equal(r.Header.Get("X-CSRF-Token"), session.CsrfToken) {
				failure(w, 403, "CSRF_INVALID", "请求校验已失效，请刷新页面")
				return
			}
			var input contracts.SecurityCodeInput
			if !decode(w, r, &input) {
				return
			}
			if err = identity.Personal.Factor(r.Context(), rawSession(r), input.Code, ip(r), false); err != nil {
				webError(w, err)
				return
			}
			session, err = identity.Session(r.Context(), rawSession(r))
			if err != nil {
				webError(w, err)
				return
			}
			success(w, session)
		})
		api.Post(prefix+"/auth/mfa/cancel", func(w http.ResponseWriter, r *http.Request) {
			identity := m.Identity(administratorRequest(r))
			token := rawSession(r)
			if identity == nil || len(token) != 43 {
				failure(w, 401, "AUTH_REQUIRED", "登录已失效，请重新登录")
				return
			}
			if !platform.Equal(r.Header.Get("X-CSRF-Token"), platform.CSRF(token)) {
				failure(w, 403, "CSRF_INVALID", "请求校验已失效，请刷新页面")
				return
			}
			if err := identity.Store.DeleteSession(r.Context(), platform.Hash(token)); err != nil {
				webError(w, err)
				return
			}
			setSession(m, w, "", 0, r)
			success(w, contracts.ActionResult{Success: true})
		})
		api.Get(prefix+"/account/sessions", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			result, err := p.Store.LoginDevices(r.Context(), platform.Hash(rawSession(r)))
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		api.Post(prefix+"/account/sessions/revoke", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			var input contracts.RevokeDeviceInput
			if !decode(w, r, &input) {
				return
			}
			if err := p.Store.RevokeDevice(r.Context(), platform.Hash(rawSession(r)), input.ID, false); err != nil {
				webError(w, err)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		})
		api.Post(prefix+"/account/sessions/revoke-others", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			if err := p.Store.RevokeDevice(r.Context(), platform.Hash(rawSession(r)), "", true); err != nil {
				webError(w, err)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		})
		api.Post(prefix+"/account/email/current", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			result, err := p.RequestEmail(r.Context(), rawSession(r), "", "", ip(r))
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		api.Post(prefix+"/account/email/new", func(w http.ResponseWriter, r *http.Request) {
			p := personal(w, r)
			if p == nil {
				return
			}
			var input contracts.EmailChangeInput
			if !decode(w, r, &input) {
				return
			}
			if input.CurrentChallengeID == "" {
				webError(w, platform.ErrInput)
				return
			}
			result, err := p.RequestEmail(r.Context(), rawSession(r), input.CurrentChallengeID, input.Email, ip(r))
			if err != nil {
				webError(w, err)
				return
			}
			success(w, result)
		})
		for _, finish := range []bool{false, true} {
			path := "/account/email/verify-current"
			if finish {
				path = "/account/email/confirm"
			}
			api.Post(prefix+path, func(w http.ResponseWriter, r *http.Request) {
				p := personal(w, r)
				if p == nil {
					return
				}
				var input contracts.EmailChangeVerifyInput
				if !decode(w, r, &input) {
					return
				}
				if err := p.VerifyEmail(r.Context(), rawSession(r), input.ChallengeID, input.Code, ip(r), finish); err != nil {
					webError(w, err)
					return
				}
				if finish {
					result, err := p.Profile(r.Context(), rawSession(r))
					if err != nil {
						webError(w, err)
						return
					}
					success(w, result)
				} else {
					success(w, contracts.ActionResult{Success: true})
				}
			})
		}
	}
}
