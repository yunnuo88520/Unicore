// Author: yunnuo <ymz@ebox.vip>
// Description: Six-digit code API and permission-protected template previews.
package httpadapter

import (
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
	"net/http"
)

func mountEmail(api chi.Router, config Config) {
	accounts := func(w http.ResponseWriter, r *http.Request) *platform.Accounts {
		a := config.Install.AccountService(administratorRequest(r))
		if a == nil {
			failure(w, 404, "NOT_FOUND", "此运行形态不提供邮件账号接口")
		}
		return a
	}
	for _, prefix := range []string{"", "/admin"} {
		if prefix == "" {
			api.Post("/auth/email/register", func(w http.ResponseWriter, r *http.Request) {
				a := accounts(w, r)
				if a == nil {
					return
				}
				var input contracts.RegisterInput
				if !decode(w, r, &input) {
					return
				}
				result, err := a.RegisterCode(r.Context(), input, ip(r))
				if err != nil {
					webError(w, err)
					return
				}
				success(w, result)
			})
		}
		for _, purpose := range []string{"verify", "reset", "login"} {
			if prefix != "" && purpose == "verify" {
				continue
			}
			api.Post(prefix+"/auth/email/"+purpose+"/request", func(w http.ResponseWriter, r *http.Request) {
				a := accounts(w, r)
				if a == nil {
					return
				}
				var input contracts.EmailRequest
				if !decode(w, r, &input) {
					return
				}
				result, err := a.RequestCode(r.Context(), input, ip(r), purpose)
				if err != nil {
					webError(w, err)
					return
				}
				success(w, result)
			})
			api.Post(prefix+"/auth/email/"+purpose+"/complete", func(w http.ResponseWriter, r *http.Request) {
				a := accounts(w, r)
				if a == nil {
					return
				}
				var input contracts.EmailCodeInput
				if !decode(w, r, &input) {
					return
				}
				session, token, err := a.CompleteCode(r.Context(), input, ip(r), purpose)
				if err != nil {
					webError(w, err)
					return
				}
				if purpose == "login" {
					setSession(config.Install, w, token, session.ExpiresAt, r)
					success(w, session)
					return
				}
				if purpose == "reset" {
					http.SetCookie(w, &http.Cookie{Name: identityCookie(r), Path: "/", HttpOnly: true, MaxAge: -1, SameSite: http.SameSiteLaxMode})
				}
				success(w, contracts.ActionResult{Success: true})
			})
		}

	}
	api.Get("/admin/settings/mail/templates", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(config.Install, w, r, "settings:read"); !ok {
			return
		}
		a := accounts(w, r)
		if a == nil {
			return
		}
		values, err := a.Settings.Raw(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		logo, err := a.Settings.Logo(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, mailer.Previews(values["site.name"], values["site.copyright"], logo))
	})
}
