// Author: yunnuo <ymz@ebox.vip>
// Description: MCP OAuth authorization service models: pre-registered clients, single-role grants and scope budgets.
package mcpoauth

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Scope names are transport capability budgets only; they never add role
// permissions or business grants. The effective reach of one grant is the
// bound role's current authorization intersected with these scopes and the
// capability open policies.
const (
	ScopeRead         = "mcp.read"
	ScopeWrite        = "mcp.write"
	ScopeOffline      = "offline_access"
	grantResourceKind = "mcp"
)

// Token kinds persisted on unicore_mcp_oauth_tokens.
const (
	TokenAccess  = "access"
	TokenRefresh = "refresh"
)

// ClientType distinguishes PKCE-only public clients from confidential ones.
const (
	ClientPublic       = "public"
	ClientConfidential = "confidential"
)

// AuthMethod is the token-endpoint authentication of a confidential client.
const AuthClientSecretPost = "client_secret_post"

// Grant statuses; unknown values resolve to inactive everywhere.
const (
	GrantActive  = "active"
	GrantRevoked = "revoked"
)

// Client is one pre-registered OAuth client. Secrets are stored as one-way
// digests and shown once at creation or rotation.
type Client struct {
	ID           string
	Name         string
	ClientType   string
	AuthMethod   string
	RedirectURIs []string
	Enabled      bool
	SecretHash   string
	Version      int
	CreatedAt    int
	UpdatedAt    int
}

// Grant binds one user, one client and exactly one role the user already
// holds, on one canonical resource. It is the only authority an MCP token
// carries; every use rechecks the account, membership and security anchor.
type Grant struct {
	ID             string
	UserID         string
	ClientID       string
	RoleID         string
	Resource       string
	Scopes         []string
	Status         string
	SecurityAnchor string
	CreatedAt      int
	LastUsedAt     int
	RevokedAt      int
}

// GrantView is the user-facing projection of one authorization.
type GrantView struct {
	ID         string   `json:"id"`
	ClientName string   `json:"client_name"`
	ClientID   string   `json:"client_id"`
	RoleID     string   `json:"role_id"`
	Scopes     []string `json:"scopes"`
	CreatedAt  int      `json:"created_at"`
	LastUsedAt int      `json:"last_used_at"`
}

// AdminGrantView is one client's active authorization with the account facts
// the admin console shows; username and role name join at read time and are
// never stored on the grant.
type AdminGrantView struct {
	Grant
	Username string
	RoleName string
}

// NormalizeScopes trims, deduplicates and bounds the requested scope set to
// the P2 vocabulary. The write scope is not granted in P2: the write phase
// must be delivered and accepted before any consent can carry it.
func NormalizeScopes(requested []string) ([]string, error) {
	seen := map[string]bool{}
	scopes := []string{}
	for _, scope := range requested {
		scope = strings.TrimSpace(scope)
		if scope == "" || seen[scope] {
			continue
		}
		seen[scope] = true
		switch scope {
		case ScopeRead:
			scopes = append(scopes, scope)
		case ScopeWrite:
			return nil, fmt.Errorf("scope %q is not grantable in the current phase", ScopeWrite)
		case ScopeOffline:
			scopes = append(scopes, scope)
		default:
			return nil, fmt.Errorf("unknown scope %q", scope)
		}
	}
	if len(scopes) == 0 {
		scopes = append(scopes, ScopeRead)
	}
	return scopes, nil
}

// ScopesAllow reports whether the grant's scope set covers the transport
// budget a capability needs. Reads are always inside mcp.read; write
// capabilities additionally need mcp.write, which P2 never grants.
func ScopesAllow(scopes []string, write bool) bool {
	has := func(scope string) bool {
		for _, candidate := range scopes {
			if candidate == scope {
				return true
			}
		}
		return false
	}
	if write && !has(ScopeWrite) {
		return false
	}
	return has(ScopeRead)
}

// ValidateRedirectURIs enforces the exact-match registry: HTTPS by default
// with the standard loopback-port exception for native clients, no
// wildcards, no open redirects, bounded count and length.
func ValidateRedirectURIs(uris []string) error {
	if len(uris) == 0 || len(uris) > 10 {
		return fmt.Errorf("a client registers 1 to 10 redirect URIs")
	}
	seen := map[string]bool{}
	for _, uri := range uris {
		if len(uri) > 2048 || seen[uri] {
			return fmt.Errorf("redirect URIs must be unique and at most 2048 characters")
		}
		seen[uri] = true
		if strings.ContainsAny(uri, " \t\r\n\"'\\") {
			return fmt.Errorf("redirect URI %q contains forbidden characters", uri)
		}
		if !strings.HasPrefix(uri, "https://") && !strings.HasPrefix(uri, "http://127.0.0.1:") && !strings.HasPrefix(uri, "http://localhost:") && !strings.HasPrefix(uri, "http://[::1]:") {
			return fmt.Errorf("redirect URI %q must be HTTPS or a loopback callback", uri)
		}
		if strings.Contains(uri[strings.Index(uri, "://")+3:], "@") || strings.Contains(uri, "*") {
			return fmt.Errorf("redirect URI %q must not carry credentials or wildcards", uri)
		}
	}
	return nil
}

// canonicalResource builds the RFC 8707 resource indicator for one instance.
func CanonicalResource(baseURL string) string {
	return strings.TrimRight(baseURL, "/") + "/mcp"
}

// MarshalScopes keeps the strict-JSON storage convention: scope sets persist
// as JSON arrays validated in the application.
func MarshalScopes(scopes []string) string {
	data, err := json.Marshal(scopes)
	if err != nil {
		return `["mcp.read"]`
	}
	return string(data)
}

// ParseScopes reads a stored scope set; unparsable values degrade to read.
func ParseScopes(raw string) []string {
	var scopes []string
	if err := json.Unmarshal([]byte(raw), &scopes); err != nil {
		return []string{ScopeRead}
	}
	return scopes
}
