// Author: yunnuo <ymz@ebox.vip>
// Description: Menu configuration and role grants survive real Notes build transitions on isolated database instances.
package httpadapter

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/edition"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/runtime"
)

type navigationEditionState struct {
	Cookie *http.Cookie
	CSRF   string
	Nodes  []contracts.NavigationNode
	Role   contracts.Role
}

func noteNavigationNodes(nodes []contracts.NavigationNode) []contracts.NavigationNode {
	result := []contracts.NavigationNode{}
	for _, node := range nodes {
		if node.RouteID != nil && (*node.RouteID == "notes" || *node.RouteID == "note-management") || node.Permission != nil && strings.HasPrefix(*node.Permission, "notes:") {
			result = append(result, node)
		}
	}
	return result
}

func TestNotesEditionNavigation(t *testing.T) {
	directory := os.Getenv("UNICORE_NOTES_TEST_DIR")
	stage := os.Getenv("UNICORE_NOTES_TEST_STAGE")
	if directory == "" || stage == "" {
		t.Skip("cross-build fixture is driven by pnpm test:notes")
	}
	for _, driver := range []string{"sqlite", "postgres", "mysql"} {
		t.Run(driver, func(t *testing.T) {
			database := contracts.DatabaseInput{Driver: driver}
			if driver != "sqlite" {
				prefix := "UNICORE_NOTES_TEST_" + strings.ToUpper(driver)
				database.Dsn = os.Getenv(prefix + "_DSN")
				if database.Dsn == "" {
					t.Skip("isolated Notes transition database not provided")
				}
				if stage == "fresh" {
					fresh := os.Getenv(prefix + "_FRESH_DSN")
					if fresh == "" || fresh == database.Dsn {
						t.Fatal("fresh-disabled stage requires a separate empty database")
					}
					database.Dsn = fresh
				}
			}
			testNotesEditionNavigation(t, filepath.Join(directory, "navigation", driver), stage, database)
		})
	}
}

func testNotesEditionNavigation(t *testing.T, directory, stage string, database contracts.DatabaseInput) {
	t.Helper()
	if stage == "fresh" {
		directory = t.TempDir()
	}
	if edition.Notes != (stage == "seed" || stage == "restored") {
		t.Fatal("fixture stage does not match the compiled Notes feature")
	}
	manager, err := install.Open(t.Context(), install.Options{DataDir: directory, Profile: "web-platform"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = manager.Close() })
	token, err := os.ReadFile(manager.TokenPath())
	if err != nil && !manager.Installed() {
		t.Fatal(err)
	}
	router := New(Config{Core: bootstrap.Core(), Install: manager, Metadata: runtime.Metadata(runtime.WebPlatform, "test"), Assets: fstest.MapFS{"index.html": {Data: []byte("app")}}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	state := navigationEditionState{}
	request := func(method, path string, input any, authenticated, csrf bool) *httptest.ResponseRecorder {
		t.Helper()
		raw, err := json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(method, "http://localhost/api/v1"+path, bytes.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Bootstrap-Token", strings.TrimSpace(string(token)))
		if authenticated && state.Cookie != nil {
			r.AddCookie(state.Cookie)
		}
		if csrf {
			r.Header.Set("X-CSRF-Token", state.CSRF)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	statePath := filepath.Join(directory, "navigation-test-session.json")
	if stage == "fresh" || stage == "seed" {
		w := request("POST", "/install/complete", contracts.InstallInput{Profile: "web-platform", Database: database, SiteName: "Menu editions", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"}, false, false)
		if w.Code != http.StatusOK {
			t.Fatal("install", w.Code, w.Body.String())
		}
		state.Cookie = w.Result().Cookies()[0]
	} else {
		raw, err := os.ReadFile(statePath)
		if err != nil {
			t.Fatal(err)
		}
		if err = json.Unmarshal(raw, &state); err != nil {
			t.Fatal(err)
		}
	}
	w := request("GET", "/admin/bootstrap", nil, true, false)
	var boot contracts.BootstrapResponse
	if err = json.Unmarshal(w.Body.Bytes(), &boot); err != nil || w.Code != http.StatusOK || boot.Data.CurrentUser == nil || boot.Data.CsrfToken == nil {
		t.Fatal("retained session", w.Code, err)
	}
	if state.CSRF != "" && state.CSRF != *boot.Data.CsrfToken {
		t.Fatal("retained CSRF token changed across builds")
	}
	state.CSRF = *boot.Data.CsrfToken
	readMenus := func(w *httptest.ResponseRecorder) contracts.MenuSaveInput {
		t.Helper()
		var response struct {
			Data contracts.MenuList `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || w.Code != http.StatusOK {
			t.Fatal("menus", w.Code, w.Body.String(), err)
		}
		return contracts.MenuSaveInput{Version: response.Data.Version, Sections: response.Data.Sections, Nodes: response.Data.Nodes}
	}
	input := readMenus(request("GET", "/admin/menus", nil, true, false))
	if stage == "seed" {
		for i := range input.Nodes {
			if input.Nodes[i].ID == "notes" || input.Nodes[i].ID == "op:createNote" {
				input.Nodes[i].Label = "Customized module entry"
			}
		}
	} else if stage != "fresh" && !reflect.DeepEqual(noteNavigationNodes(input.Nodes), state.Nodes) {
		t.Fatal("stored module configuration changed across builds")
	}
	if stage == "fresh" && len(noteNavigationNodes(input.Nodes)) != 0 {
		t.Fatal("disabled fresh instance seeded Notes")
	}
	if stage != "fresh" && len(noteNavigationNodes(input.Nodes)) < 3 {
		t.Fatal("existing instance lost its note pages/actions")
	}
	if stage == "disabled" {
		// The same session can still edit layout, without bypassing auth or CSRF.
		if w := request("PUT", "/admin/menus", input, false, false); w.Code != http.StatusUnauthorized {
			t.Fatal("anonymous menu save", w.Code)
		}
		if w := request("PUT", "/admin/menus", input, true, false); w.Code != http.StatusForbidden {
			t.Fatal("menu save without CSRF", w.Code)
		}
		if w := request("GET", "/notes", nil, true, false); w.Code != http.StatusNotFound {
			t.Fatal("disabled module API became available", w.Code)
		}
	}
	input = readMenus(request("PUT", "/admin/menus", input, true, true))
	for i := range input.Nodes {
		if input.Nodes[i].ID == "menus" {
			input.Nodes[i].Label = "Independent menu edit"
		}
	}
	stale := input
	input = readMenus(request("PUT", "/admin/menus", input, true, true))
	if w := request("PUT", "/admin/menus", stale, true, true); w.Code != http.StatusConflict {
		t.Fatal("stale navigation version accepted", w.Code)
	}
	_, _, identity, _ := manager.Services()
	roles, err := identity.Store.ListRoles(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	var userRole contracts.Role
	for _, role := range roles.Items {
		if role.ID == "user" {
			userRole = role
		}
	}
	if userRole.ID == "" || stage != "seed" && stage != "fresh" && !reflect.DeepEqual(userRole, state.Role) {
		t.Fatal("menu roundtrip changed role grants or version")
	}
	if stage == "seed" {
		state.Nodes = noteNavigationNodes(input.Nodes)
		state.Role = userRole
		raw, err := json.Marshal(state)
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(statePath, raw, 0600); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("stage=%s notes=%t: existing menu roundtrip, independent edit, CAS and role preservation passed", stage, edition.Notes)
}
