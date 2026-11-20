// Author: yunnuo <ymz@ebox.vip>
// Description: Action rebinding can change derived points without changing stored permission-specific scopes (D25, C).
package platformsql

import (
	"slices"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestActionRebindingDerivesPointsButKeepsStoredDataScope(t *testing.T) {
	ctx := t.Context()
	store, repo, super := navigationFixture(t, ctx)
	op, ok := platform.Operation("roleOptions")
	if !ok || !op.Grantable || op.PermissionMode != "any" || !slices.Contains(op.Permissions, "users:read") || !slices.Contains(op.Permissions, "users:update") {
		t.Fatalf("expected roleOptions to allow either users point: %+v", op)
	}
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var page contracts.NavigationNode
	for _, node := range listed.Nodes {
		if node.Type == "page" && node.RouteID != nil && *node.RouteID == "users" {
			page = node
			break
		}
	}
	if page.ID == "" {
		t.Fatal("missing users page")
	}
	const actionID = "test:role-options-branch"
	listed.Nodes = append(listed.Nodes, contracts.NavigationNode{
		ID: actionID, SectionID: page.SectionID, ParentID: &page.ID,
		Surfaces: []string{"administrator"}, Type: "action", Label: "Role options branch",
		Visible: true, OpenMode: "same_tab", Permission: strPtr("users:read"),
		OperationIds: []string{"roleOptions"},
	})
	listed, err = repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes}, super.ID)
	if err != nil {
		t.Fatal("save initial action", err)
	}
	// Use the normal creation path, not legacy or incomplete SQL role rows.
	role, err := repo.CreateRole(ctx, contracts.RoleSaveInput{
		Name: "Action branch reader", Permissions: []string{"users:read"},
		MenuIds: &[]string{}, ActionIds: &[]string{actionID},
		OperationIds: &[]string{"roleOptions"}, DataScope: strPtr(platform.ScopeAll),
	}, super.ID)
	if err != nil {
		t.Fatal("create role", err)
	}
	actor, err := repo.CreateUser(ctx, contracts.UserCreate{
		Username: "action-branch-reader", Email: "action-branch-reader@example.test",
		RoleIds: &[]string{role.ID},
	}, "hash", super.ID)
	if err != nil {
		t.Fatal("create actor", err)
	}
	assertProjection := func(wantPermissions []string, wantUpdate bool) {
		t.Helper()
		user, err := repo.user(ctx, store.DB, actor.ID)
		if err != nil {
			t.Fatal("read actor projection", err)
		}
		if !slices.Equal(user.Roles, []string{role.ID}) || !slices.Equal(user.Permissions, wantPermissions) ||
			!slices.Equal(deref(user.ActionIds), []string{actionID}) ||
			!slices.Equal(deref(user.OperationIds), []string{"roleOptions"}) || len(deref(user.MenuIds)) != 0 {
			t.Fatalf("unexpected projection: %+v", user)
		}
		if platform.Has(user, "users:update") != wantUpdate || platform.Has(user, "users:create") {
			t.Fatal("any operation must not derive sibling points", user.Permissions)
		}
		stored, err := repo.role(ctx, store.DB, role.ID)
		if err != nil {
			t.Fatal("read stored role", err)
		}
		if !slices.Equal(stored.Permissions, []string{"users:read"}) || stored.DataScope != platform.ScopeAll ||
			!slices.Equal(stored.ActionIds, []string{actionID}) || !slices.Equal(stored.OperationIds, []string{"roleOptions"}) {
			t.Fatalf("rebinding changed stored role authorization: %+v", stored)
		}
		readScope, err := repo.DataScope(ctx, user, "users:read")
		if err != nil || !readScope.All {
			t.Fatalf("stored users:read must retain all scope: %+v %v", readScope, err)
		}
		updateScope, err := repo.DataScope(ctx, user, "users:update")
		if err != nil || updateScope.All || !slices.Equal(updateScope.UserIDs, []string{actor.ID}) {
			t.Fatalf("unstored users:update must retain self-only fallback: %+v %v", updateScope, err)
		}
	}
	assertProjection([]string{"users:read"}, false)

	// Keep the same action ID/type and any operation, changing only the point.
	for index := range listed.Nodes {
		if listed.Nodes[index].ID == actionID {
			listed.Nodes[index].Permission = strPtr("users:update")
		}
	}
	if _, err := repo.SaveNavigation(ctx, contracts.MenuSaveInput{Version: listed.Version, Sections: listed.Sections, Nodes: listed.Nodes}, super.ID); err != nil {
		t.Fatal("rebind existing action", err)
	}
	assertProjection([]string{"users:read", "users:update"}, true)
}
