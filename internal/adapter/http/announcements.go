// Author: yunnuo <ymz@ebox.vip>
// Description: Fixed admin/user endpoints with generated inputs, session/CSRF policy and platform-only composition.
package httpadapter

import (
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/adapter/content"
	"github.com/yunnuo/unicore/internal/adapter/storage/announcementsql"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/usecase"
	"net/http"
	"strconv"
)

func mountAnnouncements(api chi.Router, config Config) {
	handler := func(permission string, fn func(http.ResponseWriter, *http.Request, *usecase.Announcements, string)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			store, _, _, profile := config.Install.Services()
			if profile != runtime.WebPlatform {
				failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供该能力")
				return
			}
			session, ok := require(config.Install, w, r, permission)
			if !ok {
				return
			}
			service := &usecase.Announcements{Repo: &announcementsql.Repository{Store: store}, Render: content.Announcement}
			fn(w, r, service, session.User.ID)
		}
	}
	page := func(r *http.Request) (int, int) {
		p, size := 1, 10
		if v := r.URL.Query().Get("page"); v != "" {
			p, _ = strconv.Atoi(v)
		}
		if v := r.URL.Query().Get("page_size"); v != "" {
			size, _ = strconv.Atoi(v)
		}
		return p, size
	}
	base := "/admin/announcements"
	api.Get(base, handler("announcements:read", func(w http.ResponseWriter, r *http.Request, s *usecase.Announcements, actor string) {
		p, size := page(r)
		out, e := s.List(r.Context(), contracts.AnnouncementQuery{Page: p, PageSize: size, Search: r.URL.Query().Get("search"), Status: r.URL.Query().Get("status")})
		if e != nil {
			webError(w, e)
			return
		}
		success(w, out)
	}))
	api.Post(base, handler("announcements:write", func(w http.ResponseWriter, r *http.Request, s *usecase.Announcements, actor string) {
		var in contracts.AnnouncementInput
		if !decode(w, r, &in) {
			return
		}
		a, e := s.Create(r.Context(), in, actor)
		if e != nil {
			webError(w, e)
			return
		}
		success(w, usecase.AnnouncementDTO(a))
	}))
	api.Put(base+"/{id}", handler("announcements:write", func(w http.ResponseWriter, r *http.Request, s *usecase.Announcements, actor string) {
		var in contracts.AnnouncementUpdate
		if !decode(w, r, &in) {
			return
		}
		a, e := s.Update(r.Context(), chi.URLParam(r, "id"), in, actor)
		if e != nil {
			webError(w, e)
			return
		}
		success(w, usecase.AnnouncementDTO(a))
	}))
	api.Post(base+"/delete", handler("announcements:write", func(w http.ResponseWriter, r *http.Request, s *usecase.Announcements, actor string) {
		var in contracts.AnnouncementDelete
		if !decode(w, r, &in) {
			return
		}
		if e := s.Delete(r.Context(), in, actor); e != nil {
			webError(w, e)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	}))
	api.Get(base+"/settings", handler("announcements:read", func(w http.ResponseWriter, r *http.Request, s *usecase.Announcements, actor string) {
		v, e := s.Enabled(r.Context())
		if e != nil {
			webError(w, e)
			return
		}
		success(w, v)
	}))
	api.Put(base+"/settings", handler("announcements:write", func(w http.ResponseWriter, r *http.Request, s *usecase.Announcements, actor string) {
		var in contracts.AnnouncementSetting
		if !decode(w, r, &in) {
			return
		}
		if e := s.SetEnabled(r.Context(), in, actor); e != nil {
			webError(w, e)
			return
		}
		success(w, in)
	}))
	api.Post(base+"/preview", handler("announcements:write", func(w http.ResponseWriter, r *http.Request, s *usecase.Announcements, actor string) {
		var in contracts.AnnouncementInput
		if !decode(w, r, &in) {
			return
		}
		a, e := s.Prepare(in)
		if e != nil {
			webError(w, e)
			return
		}
		success(w, contracts.AnnouncementPreview{ContentHtml: a.ContentHTML})
	}))
	api.Get("/announcements", handler("", func(w http.ResponseWriter, r *http.Request, s *usecase.Announcements, actor string) {
		p, size := page(r)
		out, e := s.Feed(r.Context(), p, size)
		if e != nil {
			webError(w, e)
			return
		}
		success(w, out)
	}))
	api.Get("/announcements/{id}", handler("", func(w http.ResponseWriter, r *http.Request, s *usecase.Announcements, actor string) {
		out, e := s.Published(r.Context(), chi.URLParam(r, "id"))
		if e != nil {
			webError(w, e)
			return
		}
		success(w, out)
	}))
}
