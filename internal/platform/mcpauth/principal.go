// Author: yunnuo <ymz@ebox.vip>
// Description: Platform identity to MCP principal conversion with per-request authorization state.
package mcpauth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/internal/platform"
)

// MCPAccessPermission is the catalog point every MCP caller must hold.
const MCPAccessPermission = "mcp:access"

// Principal is the server-built projection of one resolved credential for
// the current request. It carries identifiers and the role-scoped user
// snapshot only — never the raw bearer string, cookies or refresh tokens.
// Every request builds a fresh principal, so authorization conclusions can
// never outlive the credential, account or role state they were read from.
type Principal struct {
	actor      string
	credential string
	role       string
	method     string
	version    string
	user       contracts.User
	scopes     scopeResolver
}

// scopeResolver resolves the row-level data scope for one permission point.
type scopeResolver interface {
	DataScope(ctx context.Context, user contracts.User, permission string) (platform.ScopeFilter, error)
}

// compile-time proof that the principal satisfies the core port.
var _ mcp.Principal = (*Principal)(nil)

// NewPrincipal converts a resolved bearer identity into an MCP principal.
// Only personal tokens may enter MCP: client JWTs, MFA challenges and any
// other credential family are refused here as a second gate beside the
// transport's own kind check.
func NewPrincipal(identity platform.BearerIdentity, store scopeResolver) (*Principal, error) {
	if identity.Credential.Kind != "pat" {
		return nil, mcp.ErrAuth("credential family is not accepted for MCP access")
	}
	p := &Principal{
		actor:      identity.Session.User.ID,
		credential: identity.Credential.ID,
		role:       identity.Credential.RoleID,
		method:     "pat",
		user:       identity.Session.User,
		scopes:     store,
	}
	p.version = authorizationVersion(p.role, p.user)
	return p, nil
}

// authorizationVersion fingerprints the caller's authorization state so
// directory cursors bind to the grants they were created under.
func authorizationVersion(role string, user contracts.User) string {
	operations := append([]string(nil), deref(user.OperationIds)...)
	sort.Strings(operations)
	permissions := append([]string(nil), user.Permissions...)
	sort.Strings(permissions)
	digest := sha256.Sum256([]byte(role + "\x00" + strings.Join(operations, ",") + "\x00" + strings.Join(permissions, ",")))
	return hex.EncodeToString(digest[:8])
}

func deref(list *[]string) []string {
	if list == nil {
		return nil
	}
	return *list
}

func (p *Principal) ActorID() string      { return p.actor }
func (p *Principal) CredentialID() string { return p.credential }
func (p *Principal) RoleID() string       { return p.role }
func (p *Principal) AuthMethod() string   { return p.method }
func (p *Principal) AuthVersion() string  { return p.version }

// User exposes the role-scoped account projection for tool adapters.
func (p *Principal) User() contracts.User { return p.user }

// HasPermission reports whether the bound role holds a permission point.
func (p *Principal) HasPermission(point string) bool {
	return platform.Has(p.user, point)
}

// Scope resolves the row-level data scope for one permission point on every
// call; results are never cached across requests.
func (p *Principal) Scope(ctx context.Context, permission string) (platform.ScopeFilter, error) {
	if p.scopes == nil {
		return platform.ScopeFilter{}, mcp.ErrInternal("data scope resolver unavailable")
	}
	return p.scopes.DataScope(ctx, p.user, permission)
}
