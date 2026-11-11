// Author: yunnuo <ymz@ebox.vip>
// Description: Read-only API operation authorization catalogue for the roles editor.
package httpadapter

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func mountAPIOperations(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/admin/api-operations", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "roles:read"); !ok {
			return
		}
		success(w, contracts.APIOperationList{Items: platform.APIOperations()})
	})
}
