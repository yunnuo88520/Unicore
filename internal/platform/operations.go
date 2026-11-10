// Author: yunnuo <ymz@ebox.vip>
// Description: Contract-derived operation catalogue and fail-closed permission bounds.
package platform

import (
	"sync"

	"github.com/yunnuo/unicore/internal/contracts"
	apispec "github.com/yunnuo/unicore/packages/contracts"
	"sort"
	"strings"
)

func PermissionsAllow(grants []string, required []string, mode string) bool {
	if len(required) == 0 {
		return true
	}
	has := func(id string) bool {
		for _, p := range grants {
			if p == id {
				return true
			}
		}
		return false
	}
	if mode == "any" {
		for _, p := range required {
			if has(p) {
				return true
			}
		}
		return false
	}
	if mode != "" && mode != "all" {
		return false
	}
	for _, p := range required {
		if !has(p) {
			return false
		}
	}
	return true
}

// apiCatalogue builds the sorted operation snapshot once: the embedded
// OpenAPI is fixed at compile time, so rebuilding and re-sorting the whole
// catalogue per lookup is pure waste — session resolution resolves dozens of
// operation ids per request through Operation and deriveGrantedPermissions.
var apiCatalogue = sync.OnceValue(func() []contracts.APIOperation {
	result := []contracts.APIOperation{}
	for key, op := range apispec.Operations() {
		parts := strings.SplitN(key, " ", 2)
		path := parts[1]
		realm := op.Policy.IdentityRealm
		if realm == "" {
			realm = "user"
		}
		grantable := len(op.Policy.Permissions) > 0 && !op.Policy.SuperAdmin && (op.Policy.Access == "session" || op.Policy.Access == "authenticated" || op.Policy.Access == "platform-session")
		if strings.Contains(path, "/auth/") || strings.Contains(path, "/account") || strings.HasSuffix(path, "/bootstrap") {
			grantable = false
		}
		tags := op.Tags
		if tags == nil {
			tags = []string{}
		}
		permissions := op.Policy.Permissions
		if permissions == nil {
			permissions = []string{}
		}
		result = append(result, contracts.APIOperation{OperationID: op.ID, Method: strings.ToUpper(parts[0]), Path: path, Summary: op.Summary, Tags: tags, Realm: realm, Permissions: permissions, PermissionMode: op.Policy.PermissionMode, Csrf: op.Policy.CSRF, SuperAdmin: op.Policy.SuperAdmin, Grantable: grantable})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].OperationID < result[j].OperationID })
	return result
})

// APIOperations reads the authoritative embedded OpenAPI; identity and account
// recovery operations remain mandatory and cannot be delegated away. The
// returned slice is a shared immutable snapshot and must not be modified.
func APIOperations() []contracts.APIOperation {
	return apiCatalogue()
}
func Operation(id string) (contracts.APIOperation, bool) {
	for _, op := range apiCatalogue() {
		if op.OperationID == id {
			return op, true
		}
	}
	return contracts.APIOperation{}, false
}

// MaterializedOperations derives the explicit API grants a legacy role
// deserves from its current permission points: mode any needs one shared
// point, mode all needs the full set. Run once at upgrade; never again, so
// later operations stay denied until granted explicitly.
func MaterializedOperations(realm string, permissions []string) []string {
	result := []string{}
	for _, op := range APIOperations() {
		if !op.Grantable {
			continue
		}
		if PermissionsAllow(permissions, op.Permissions, op.PermissionMode) {
			result = append(result, op.OperationID)
		}
	}
	return result
}

// ValidOperationGrant checks an explicitly requested operation grant against
// the catalogue bound: real, delegable and never wider than the
// role's permission points (the points stay the upper bound).
func ValidOperationGrant(realm string, permissions []string, operationID string) bool {
	op, ok := Operation(operationID)
	if !ok || !op.Grantable {
		return false
	}
	return PermissionsAllow(permissions, op.Permissions, op.PermissionMode)
}

func OperationAllowed(user contracts.User, id string) bool {
	if IsSuper(user) {
		return true
	}
	op, ok := Operation(id)
	if !ok {
		return false
	}
	if !op.Grantable {
		return true
	}
	if user.OperationIds == nil {
		return false
	}
	for _, grant := range *user.OperationIds {
		if grant == id {
			return true
		}
	}
	return false
}
