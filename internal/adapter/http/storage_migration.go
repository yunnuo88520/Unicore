// Author: yunnuo <ymz@ebox.vip>
// Description: Super-administrator asynchronous storage migration endpoints; only web-platform mounts them.
package httpadapter

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
)

func mountStorageMigrations(api chi.Router, config Config) {
	handler := func(permission string, fn func(http.ResponseWriter, *http.Request, *files.Service, files.Actor)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			session, ok := require(config.Install, w, r, permission)
			if !ok {
				return
			}
			if !administratorRequest(r) || !platform.IsSuper(session.User) {
				webError(w, platform.ErrForbidden)
				return
			}
			service := config.Install.Files()
			if service == nil {
				webError(w, files.ErrNotFound)
				return
			}
			fn(w, r, service, fileActor(r, session))
		}
	}
	read := func(fn func(http.ResponseWriter, *http.Request, *files.Service, files.Actor)) http.HandlerFunc {
		return handler("storage:read", fn).ServeHTTP
	}
	write := func(fn func(http.ResponseWriter, *http.Request, *files.Service, files.Actor)) http.HandlerFunc {
		return handler("storage:write", fn).ServeHTTP
	}
	api.Get("/admin/storage/migrations/summary", read(func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		value, err := s.MigrationSummary(r.Context(), a)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, value)
	}))
	api.Get("/admin/storage/migrations", read(func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		value, err := s.MigrationJobs(r.Context(), a)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, value)
	}))
	api.Get("/admin/storage/migrations/current", read(func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		value, err := s.CurrentMigration(r.Context(), a)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, value)
	}))
	api.Post("/admin/storage/migrations", write(func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
		var input contracts.StorageMigrationCreateInput
		if !decode(w, r, &input) {
			return
		}
		value, err := s.CreateMigration(r.Context(), a, input)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, value)
	}))
	for _, action := range []struct {
		name string
		call func(context.Context, *files.Service, files.Actor, string) error
	}{
		{"pause", func(ctx context.Context, s *files.Service, a files.Actor, id string) error { return s.PauseMigration(ctx, a, id) }},
		{"resume", func(ctx context.Context, s *files.Service, a files.Actor, id string) error { return s.ResumeMigration(ctx, a, id) }},
		{"cancel", func(ctx context.Context, s *files.Service, a files.Actor, id string) error { return s.CancelMigration(ctx, a, id) }},
		{"retry-failed", func(ctx context.Context, s *files.Service, a files.Actor, id string) error { return s.RetryFailedMigration(ctx, a, id) }},
	} {
		action := action
		api.Post("/admin/storage/migrations/{id}/"+action.name, write(func(w http.ResponseWriter, r *http.Request, s *files.Service, a files.Actor) {
			if err := action.call(r.Context(), s, a, chi.URLParam(r, "id")); err != nil {
				webError(w, err)
				return
			}
			success(w, contracts.ActionResult{Success: true})
		}))
	}
}
