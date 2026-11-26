// Author: yunnuo <ymz@ebox.vip>
// Description: File governance requires the administrator surface and super-admin reservation at every route.
package httpadapter

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
)

func TestFileCatalogReservationAndPrivateSigning(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	ctx := t.Context()
	admin := adminUser(t, manager)
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "Storage reader", "realm": "administrator", "permissions": []string{"storage:read"}, "operation_ids": []string{"storageLocations"}}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("role", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	_, _, identity, _ := manager.Services()
	reader, err := identity.Create(ctx, contracts.UserCreate{Username: "reader", Email: "reader@example.test", Password: "test-password-strong", Role: created.Data.ID}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	readerCookie, readerCSRF := issueSession(t, manager, true, reader)
	for _, spec := range []struct{ method, path string }{
		{"GET", "/api/v1/admin/file-catalog"},
		{"GET", "/api/v1/admin/file-catalog/directories"},
		{"GET", "/api/v1/admin/file-catalog/migration-selection"},
		{"POST", "/api/v1/admin/file-catalog/missing/access"},
		{"DELETE", "/api/v1/admin/file-catalog/missing"},
		{"POST", "/api/v1/admin/files/missing/migrate"},
	} {
		if w := request(spec.method, spec.path, map[string]any{"location_id": "local"}, readerCookie, readerCSRF); w.Code != http.StatusForbidden {
			t.Fatal("non-super reached file governance", spec, w.Code, w.Body.String())
		}
		if w := request(spec.method, spec.path, nil, nil, ""); w.Code != http.StatusUnauthorized {
			t.Fatal("anonymous governance", spec, w.Code, w.Body.String())
		}
	}
	for _, endpoint := range []string{"/api/v1/admin/file-catalog", "/api/v1/admin/file-catalog/directories"} {
		if w := request("GET", endpoint, nil, adminCookie, ""); w.Code != http.StatusOK {
			t.Fatal("super catalog", endpoint, w.Code, w.Body.String())
		}
	}
	if w := request("GET", "/api/v1/admin/file-catalog?directory=../private", nil, adminCookie, ""); w.Code != http.StatusBadRequest {
		t.Fatal("directory validation", w.Code, w.Body.String())
	}
	if w := request("POST", "/api/v1/admin/file-catalog/missing/access", nil, adminCookie, ""); w.Code != http.StatusForbidden {
		t.Fatal("CSRF not enforced", w.Code, w.Body.String())
	}
	if w := request("POST", "/api/v1/admin/file-catalog/missing/access", nil, adminCookie, adminCSRF); w.Code != http.StatusNotFound {
		t.Fatal("missing file enumeration", w.Code, w.Body.String())
	}
}
