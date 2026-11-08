// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator overview metrics: member counts, recent audit trail and seven-day activity.
package httpadapter

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func mountDashboard(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/admin/dashboard", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "admin:access"); !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.Dashboard(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
}
