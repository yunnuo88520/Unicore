// Author: yunnuo <ymz@ebox.vip>
// Description: Navigation tree edits prune orphaned role menu/action grants, bump
// exactly the roles whose stored authorization changed, and never resurrect a
// grant when a node with the same ID is re-added.
package httpadapter

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
)

func TestNavigationEditPrunesOrphanedRoleGrants(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)

	// Omitted grant arrays derive every administrator-surface item the points
	// unlock: the users page, its action buttons and the API operations.
	w := request("POST", "/api/v1/admin/roles", map[string]any{"name": "用户运营", "realm": "administrator", "permissions": []string{"users:read", "users:create"}, "operation_ids": []string{"createUser", "exportUsers", "importUsers", "listUsers", "roleOptions", "userImportTemplate"}, "action_ids": []string{"op:listUsers", "op:createUser"}}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("role create", w.Code, w.Body.String())
	}
	var created contracts.RoleResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" {
		t.Fatal("role payload", w.Body.String(), err)
	}
	// Explicit grants only: the submitted operation and action rows persist,
	// while menu visibility starts empty until the editor grants it.
	if len(created.Data.OperationIds) == 0 || len(created.Data.ActionIds) == 0 || len(created.Data.MenuIds) != 0 {
		t.Fatal("explicit grants missing", created.Data.MenuIds, created.Data.ActionIds, created.Data.OperationIds)
	}
	operations := append([]string{}, created.Data.OperationIds...)

	var tree struct {
		Data struct {
			Version  int               `json:"version"`
			Sections []json.RawMessage `json:"sections"`
			Nodes    []map[string]any  `json:"nodes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(request("GET", "/api/v1/admin/menus", nil, adminCookie, "").Body.Bytes(), &tree); err != nil {
		t.Fatal(err)
	}

	// Remove the users page together with its action descendants.
	removed := map[string]bool{"users": true}
	for changed := true; changed; {
		changed = false
		for _, node := range tree.Data.Nodes {
			id, _ := node["id"].(string)
			parent, _ := node["parent_id"].(string)
			if parent != "" && removed[parent] && !removed[id] {
				removed[id] = true
				changed = true
			}
		}
	}
	prunedActions := 0
	for _, id := range created.Data.ActionIds {
		if removed[id] {
			prunedActions++
		}
	}
	if prunedActions == 0 {
		t.Fatal("fixture broken: no role action grant inside the removed subtree")
	}
	kept := []map[string]any{}
	for _, node := range tree.Data.Nodes {
		id, _ := node["id"].(string)
		if !removed[id] {
			kept = append(kept, node)
		}
	}
	save := func(version int, nodes []map[string]any) {
		t.Helper()
		w := request("PUT", "/api/v1/admin/menus", map[string]any{"version": version, "sections": tree.Data.Sections, "nodes": nodes}, adminCookie, adminCSRF)
		if w.Code != http.StatusOK {
			t.Fatalf("tree save: %d %s", w.Code, w.Body.String())
		}
	}
	roleState := func() contracts.Role {
		t.Helper()
		_, _, identity, _ := manager.Services()
		roles, err := identity.Store.ListRoles(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range roles.Items {
			if item.ID == created.Data.ID {
				return item
			}
		}
		t.Fatal("role missing")
		return contracts.Role{}
	}

	save(tree.Data.Version, kept)
	edited := roleState()
	if edited.Version <= created.Data.Version {
		t.Fatal("role version not advanced", edited.Version, created.Data.Version)
	}
	for _, id := range edited.MenuIds {
		if removed[id] {
			t.Fatal("orphaned menu grant survived", id)
		}
	}
	for _, id := range edited.ActionIds {
		if removed[id] {
			t.Fatal("orphaned action grant survived", id)
		}
	}
	// API operation grants are an independent namespace: the tree edit must
	// not touch them.
	if len(edited.OperationIds) != len(operations) {
		t.Fatal("operation grants altered by tree edit", edited.OperationIds, operations)
	}

	// An identical re-save orphans nothing and must not stale role editors.
	versionAfterPrune := edited.Version
	save(tree.Data.Version+1, kept)
	if edited = roleState(); edited.Version != versionAfterPrune {
		t.Fatal("no-op tree save bumped role version", edited.Version, versionAfterPrune)
	}

	// Re-adding nodes with the same IDs must not resurrect the pruned grants.
	save(tree.Data.Version+2, tree.Data.Nodes)
	if edited = roleState(); edited.Version != versionAfterPrune {
		t.Fatal("node re-add bumped role version", edited.Version, versionAfterPrune)
	}
	for _, id := range edited.MenuIds {
		if removed[id] {
			t.Fatal("menu grant resurrected", id)
		}
	}
	for _, id := range edited.ActionIds {
		if removed[id] {
			t.Fatal("action grant resurrected", id)
		}
	}
}
