// Author: yunnuo <ymz@ebox.vip>
// Description: Public email account flows and permission-protected mail administration.
package httpadapter

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func mountAccounts(api chi.Router, config Config) {
	mountEmail(api, config)
	manager := config.Install
	accounts := func(w http.ResponseWriter, r *http.Request) *platform.Accounts {
		service := manager.AccountService(administratorRequest(r))
		if service == nil {
			failure(w, 404, "NOT_FOUND", "此运行形态不提供邮件账号接口")
		}
		return service
	}
	api.Get("/auth/policy", func(w http.ResponseWriter, r *http.Request) {
		service := accounts(w, r)
		if service == nil {
			return
		}
		policy, err := service.Policy(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, policy)
	})
	api.Post("/auth/register", func(w http.ResponseWriter, r *http.Request) {
		service := accounts(w, r)
		if service == nil {
			return
		}
		var input contracts.RegisterInput
		if !decode(w, r, &input) {
			return
		}
		if err := service.Register(r.Context(), input, ip(r)); err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
	for _, purpose := range []string{"verify", "reset"} {
		requestPath, completePath := "/auth/verification/request", "/auth/verification/complete"
		if purpose == "reset" {
			requestPath, completePath = "/auth/password/request", "/auth/password/reset"
		}
		api.Post(requestPath, func(w http.ResponseWriter, r *http.Request) {
			service := accounts(w, r)
			if service == nil {
				return
			}
			var input contracts.EmailRequest
			if !decode(w, r, &input) {
				return
			}
			if err := service.Request(r.Context(), input, ip(r), purpose); err != nil {
				webError(w, err)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		})
		api.Post(completePath, func(w http.ResponseWriter, r *http.Request) {
			service := accounts(w, r)
			if service == nil {
				return
			}
			var token, password string
			if purpose == "reset" {
				var input contracts.ResetInput
				if !decode(w, r, &input) {
					return
				}
				token, password = input.Token, input.Password
			} else {
				var input contracts.TokenInput
				if !decode(w, r, &input) {
					return
				}
				token = input.Token
			}
			if err := service.Complete(r.Context(), token, purpose, password, ip(r)); err != nil {
				webError(w, err)
				return
			}
			if purpose == "reset" {
				http.SetCookie(w, &http.Cookie{Name: identityCookie(r), Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: strings.HasPrefix(manager.BaseURL(), "https://"), MaxAge: -1, Expires: time.Unix(1, 0)})
			}
			success(w, contracts.ActionResult{Success: true})
		})
	}
	api.Post("/admin/settings/mail/test", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "settings:write")
		if !ok {
			return
		}
		service := accounts(w, r)
		if service == nil {
			return
		}
		if !service.Identity.Limiter.Allow("mail-test:"+actor.User.ID, 5, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		var input contracts.MailTestInput
		if !decode(w, r, &input) {
			return
		}
		if err := service.Mail.Test(r.Context(), input.Recipient, actor.User.ID); err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
	api.Get("/admin/mail/jobs", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "logs:read"); !ok {
			return
		}
		service := accounts(w, r)
		if service == nil {
			return
		}
		data, err := service.Mail.Store.MailJobs(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
}
