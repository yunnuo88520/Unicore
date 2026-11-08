// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator surface for scheduled jobs: listing, custom task lifecycle, enablement and manual triggers.
package httpadapter

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func mountTasks(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/admin/tasks", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "tasks:read"); !ok {
			return
		}
		tasks := manager.Tasks()
		if tasks == nil {
			success(w, contracts.TaskList{Items: []contracts.TaskEntry{}, Executors: []contracts.TaskExecutor{}})
			return
		}
		data, err := tasks.ListTasks(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Post("/admin/tasks", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "tasks:write")
		if !ok {
			return
		}
		var input contracts.TaskCreateInput
		if !decode(w, r, &input) {
			return
		}
		tasks := manager.Tasks()
		if tasks == nil {
			webError(w, platform.ErrInput)
			return
		}
		entry, err := tasks.CreateTask(r.Context(), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, entry)
	})
	api.Put("/admin/tasks/{name}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "tasks:write")
		if !ok {
			return
		}
		var input contracts.TaskUpdateInput
		if !decode(w, r, &input) {
			return
		}
		tasks := manager.Tasks()
		if tasks == nil {
			webError(w, platform.ErrInput)
			return
		}
		if err := tasks.SetTaskEnabled(r.Context(), chi.URLParam(r, "name"), input.Enabled, actor.User.ID); err != nil {
			webError(w, err)
			return
		}
		list, err := tasks.ListTasks(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		for _, entry := range list.Items {
			if entry.Name == chi.URLParam(r, "name") {
				success(w, entry)
				return
			}
		}
		success(w, contracts.TaskEntry{})
	})
	api.Patch("/admin/tasks/{name}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "tasks:write")
		if !ok {
			return
		}
		var input contracts.TaskEditInput
		if !decode(w, r, &input) {
			return
		}
		tasks := manager.Tasks()
		if tasks == nil {
			webError(w, platform.ErrInput)
			return
		}
		entry, err := tasks.UpdateTask(r.Context(), chi.URLParam(r, "name"), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, entry)
	})
	api.Delete("/admin/tasks/{name}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "tasks:write")
		if !ok {
			return
		}
		tasks := manager.Tasks()
		if tasks == nil {
			webError(w, platform.ErrInput)
			return
		}
		if err := tasks.DeleteTask(r.Context(), chi.URLParam(r, "name"), actor.User.ID); err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
	api.Post("/admin/tasks/{name}/run", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "tasks:write")
		if !ok {
			return
		}
		tasks := manager.Tasks()
		if tasks == nil {
			webError(w, platform.ErrInput)
			return
		}
		if err := tasks.TriggerTask(r.Context(), chi.URLParam(r, "name"), actor.User.ID); err != nil {
			webError(w, err)
			return
		}
		success(w, map[string]bool{"triggered": true})
	})
	api.Get("/admin/tasks/{name}/runs", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "tasks:read"); !ok {
			return
		}
		tasks := manager.Tasks()
		if tasks == nil {
			webError(w, platform.ErrInput)
			return
		}
		data, err := tasks.TaskRuns(r.Context(), chi.URLParam(r, "name"))
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
}
