// Author: yunnuo <ymz@ebox.vip>
// Description: MCP capability authorization: mcp:access plus explicit operation grants, never the super-admin shortcut.
package mcpauth

import (
	"context"

	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/internal/platform"
)

// Authorizer implements the core authorization port on top of the platform
// permission model. It deliberately does not call OperationAllowed: that
// helper short-circuits for super_admin, while MCP capability access must
// produce the same verdict for every caller. A super_admin personal token
// passes only when its bound role holds the explicit grants like anyone else.
type Authorizer struct {
	Operations mcp.OperationResolver
}

// compile-time proof that the authorizer satisfies the core port.
var _ mcp.Authorizer = Authorizer{}

// Authorize verifies mcp:access and every bound operation for the current
// request. The entry permission stays a plain denial (HTTP 403); per-tool
// operation failures unify with unknown and disabled capabilities so the
// external directory cannot be probed. Internal detail distinguishes the
// reasons for logs only.
func (a Authorizer) Authorize(_ context.Context, principal mcp.Principal, operationIDs []string) error {
	p, ok := principal.(*Principal)
	if !ok {
		return mcp.ErrInternal("unexpected principal implementation")
	}
	if !p.HasPermission(MCPAccessPermission) {
		return mcp.ErrForbidden("mcp access point not granted")
	}
	for _, id := range operationIDs {
		info, known := a.Operations.LookupOperation(id)
		if !known {
			return mcp.ErrUnavailable("denied: operation unknown: " + id)
		}
		if !info.Grantable || info.SuperAdmin {
			return mcp.ErrUnavailable("denied: operation is not delegable business surface: " + id)
		}
		if !granted(p.user.OperationIds, id) {
			return mcp.ErrUnavailable("denied: operation grant missing: " + id)
		}
		if !platform.PermissionsAllow(p.user.Permissions, info.Permissions, info.PermissionMode) {
			return mcp.ErrUnavailable("denied: permission points missing for operation: " + id)
		}
	}
	return nil
}

// granted checks the explicit operation grants of the role snapshot.
func granted(list *[]string, id string) bool {
	if list == nil {
		return false
	}
	for _, entry := range *list {
		if entry == id {
			return true
		}
	}
	return false
}
