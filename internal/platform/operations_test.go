// Author: yunnuo <ymz@ebox.vip>
// Description: Operation catalogue derivation and permission mode boundaries.
package platform

import (
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
)

func TestPermissionsAllowModes(t *testing.T) {
	cases := []struct {
		name    string
		grants  []string
		require []string
		mode    string
		want    bool
	}{
		{"no requirement", []string{}, nil, "all", true},
		{"all held", []string{"files:access", "notes:access"}, []string{"files:access", "notes:access"}, "all", true},
		{"all missing one", []string{"files:access"}, []string{"files:access", "notes:access"}, "all", false},
		{"any one held", []string{"notes:access"}, []string{"files:access", "notes:access"}, "any", true},
		{"any none held", []string{"settings:read"}, []string{"files:access", "notes:access"}, "any", false},
		{"unknown mode fails closed", []string{"files:access"}, []string{"files:access"}, "sometimes", false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := PermissionsAllow(testCase.grants, testCase.require, testCase.mode); got != testCase.want {
				t.Fatalf("PermissionsAllow=%v want %v", got, testCase.want)
			}
		})
	}
}

func TestOperationCatalogueBoundaries(t *testing.T) {
	operations := APIOperations()
	if len(operations) == 0 {
		t.Fatal("empty catalogue")
	}
	seen := map[string]bool{}
	for _, op := range operations {
		if op.OperationID == "" || op.Method == "" || op.Path == "" {
			t.Fatal("incomplete catalogue entry", op)
		}
		if seen[op.OperationID] {
			t.Fatal("duplicate catalogue entry", op.OperationID)
		}
		seen[op.OperationID] = true
		// Identity and account operations stay mandatory and undelegable.
		if (strings.Contains(op.Path, "/auth/") || strings.Contains(op.Path, "/account")) && op.Grantable {
			t.Fatal("identity operation marked grantable", op.OperationID)
		}
		// Admin operations must resolve to the administrator realm.
		if strings.Contains(op.Path, "/admin/") && op.Realm != "administrator" {
			t.Fatal("admin operation realm", op.OperationID, op.Realm)
		}
	}
	for _, id := range []string{"listRoles", "updateRole", "listMenus", "listAPIOperations", "listPosts"} {
		op, ok := Operation(id)
		if !ok {
			t.Fatal("missing catalogue entry", id)
		}
		if op.Realm != "administrator" {
			t.Fatal("realm mismatch", id, op.Realm)
		}
	}

	// The materialization bound: a files-only user role gains exactly the
	// file operations, never notes or admin operations.
	files := MaterializedOperations("user", []string{"files:access"})
	if len(files) == 0 || !contains(files, "listFiles") || contains(files, "listNotes") || contains(files, "listRoles") {
		t.Fatal("files materialization", files)
	}
	// A user-realm role never materializes administrator operations.
	for _, id := range MaterializedOperations("user", Permissions) {
		if op, _ := Operation(id); op.Realm != "user" {
			t.Fatal("cross-realm materialization", id)
		}
	}

	// The operation gate: super bypasses, unknown ids deny, non-grantable
	// session operations stay open, grantable ones need the explicit grant.
	super := contracts.User{Roles: []string{"super_admin"}, Permissions: Permissions}
	if !OperationAllowed(super, "listRoles") {
		t.Fatal("super denied")
	}
	member := contracts.User{Roles: []string{"user"}, Permissions: []string{"files:access"}, MenuIds: &[]string{}, ActionIds: &[]string{}, OperationIds: &[]string{"listFiles"}}
	if !OperationAllowed(member, "listFiles") {
		t.Fatal("granted operation denied")
	}
	if OperationAllowed(member, "listNotes") {
		t.Fatal("ungranted operation allowed")
	}
	if OperationAllowed(member, "unknown-operation") {
		t.Fatal("unknown operation allowed")
	}
	if !ValidOperationGrant("user", []string{"files:access"}, "listFiles") {
		t.Fatal("valid grant refused")
	}
	if ValidOperationGrant("user", []string{"files:access"}, "listNotes") {
		t.Fatal("grant beyond permission bound accepted")
	}
	if ValidOperationGrant("user", []string{"files:access"}, "listRoles") {
		t.Fatal("cross-realm grant accepted")
	}
}
