// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator-only editable mail content, safe draft previews and explicitly addressed test delivery.
package httpadapter

import (
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailcontent"
	"github.com/yunnuo/unicore/internal/platform"
	"net/http"
	"time"
)

func mountMailTemplates(api chi.Router, config Config) {
	base := "/admin/settings/mail/templates"
	api.Get(base, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(config.Install, w, r, "settings:read"); !ok {
			return
		}
		result, e := config.Install.Mail().Templates(r.Context())
		if e != nil {
			webError(w, e)
			return
		}
		success(w, result)
	})
	api.Post(base+"/preview", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(config.Install, w, r, "settings:write"); !ok {
			return
		}
		var input contracts.MailTemplateInput
		if !decode(w, r, &input) {
			return
		}
		result, e := config.Install.Mail().PreviewTemplate(r.Context(), input)
		if e != nil {
			webError(w, e)
			return
		}
		success(w, result)
	})
	api.Put(base, func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(config.Install, w, r, "settings:write")
		if !ok {
			return
		}
		var input contracts.MailTemplateInput
		if !decode(w, r, &input) {
			return
		}
		result, e := config.Install.Mail().PreviewTemplate(r.Context(), input)
		if e != nil {
			webError(w, e)
			return
		}
		_, settings, _, _ := config.Install.Services()
		e = settings.SaveMailTemplate(r.Context(), input.Purpose, &mailcontent.Template{Subject: input.Subject, Body: input.Body}, actor.User.ID)
		if e != nil {
			webError(w, e)
			return
		}
		result.Customized = true
		success(w, result)
	})
	api.Post(base+"/reset", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(config.Install, w, r, "settings:write")
		if !ok {
			return
		}
		var input contracts.MailTemplateReset
		if !decode(w, r, &input) {
			return
		}
		_, settings, _, _ := config.Install.Services()
		if e := settings.SaveMailTemplate(r.Context(), input.Purpose, nil, actor.User.ID); e != nil {
			webError(w, e)
			return
		}
		content := mailcontent.Default(input.Purpose)
		result, e := config.Install.Mail().PreviewTemplate(r.Context(), contracts.MailTemplateInput{Purpose: input.Purpose, Subject: content.Subject, Body: content.Body})
		if e != nil {
			webError(w, e)
			return
		}
		success(w, result)
	})
	api.Post(base+"/test", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(config.Install, w, r, "settings:write")
		if !ok {
			return
		}
		var input contracts.MailTemplateTestInput
		if !decode(w, r, &input) {
			return
		}
		if !config.Install.Identity(true).Limiter.Allow("mail-template-test:"+actor.User.ID, 5, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		if e := config.Install.Mail().TestTemplate(r.Context(), input); e != nil {
			webError(w, e)
			return
		}
		store, _, _, _ := config.Install.Services()
		if e := store.Audit(audit.Target(r.Context(), "mail-template/"+input.Template.Purpose, ""), store.DB, actor.User.ID, "mail.template.tested"); e != nil {
			webError(w, e)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
}
