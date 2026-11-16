//go:build no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Omitted notes register no HTTP routes.
package httpadapter

import (
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
	"net/http"
)

func mountNotes(chi.Router, Config) {}
func noteErrorCode(error) string    { return "" }

func allowNoteAttachment(w http.ResponseWriter, r *http.Request, _ Config, _ files.Actor, _ string, _ platform.ScopeFilter) bool {
	failure(w, 404, "NOT_FOUND", "文件不存在")
	return false
}
