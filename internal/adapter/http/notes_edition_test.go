// Author: yunnuo <ymz@ebox.vip>
// Description: Omitted notes and attachment APIs must return JSON 404 before authentication or storage.
package httpadapter

import (
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/edition"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestNotesEditionHTTP(t *testing.T) {
	if edition.Notes {
		return
	}
	manager, _, _ := newPolicyFixture(t)
	handler := New(Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "test"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}})
	for _, path := range []string{"/notes", "/notes/id", "/admin/notes", "/admin/notes/id", "/notes/files", "/notes/files/uploads", "/notes/files/uploads/id/content", "/notes/files/id/access"} {
		for _, method := range []string{"GET", "POST", "PUT", "DELETE"} {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest(method, "http://localhost/api/v1"+path, nil))
			if w.Code != 404 || !strings.Contains(w.Header().Get("Content-Type"), "application/json") {
				t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body.String())
			}
		}
	}
	for _, op := range platform.APIOperations() {
		if strings.Contains(op.Path, "/notes") {
			t.Fatalf("disabled operation still grantable: %s", op.OperationID)
		}
	}
}
