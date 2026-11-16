// Author: yunnuo <ymz@ebox.vip>
// Description: Principal conversion and authorization matrix tests: explicit grants only, no super-admin shortcut.
package mcpauth

import (
	"context"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/internal/platform"
)

type stubScopes struct{ filter platform.ScopeFilter }

func (s stubScopes) DataScope(context.Context, contracts.User, string) (platform.ScopeFilter, error) {
	return s.filter, nil
}

func principalFor(grants []string, permissions ...string) *Principal {
	user := contracts.User{ID: "u1", Roles: []string{"member"}, Permissions: permissions, OperationIds: &grants}
	identity := platform.BearerIdentity{
		Session:    contracts.Session{User: user},
		Credential: platform.APICredential{ID: "cred1", Kind: "pat", RoleID: "member"},
	}
	p, err := NewPrincipal(identity, stubScopes{})
	if err != nil {
		panic(err)
	}
	return p
}

func testOperations() mcp.OperationResolver {
	return mcp.OperationResolverFunc(func(id string) (mcp.OperationInfo, bool) {
		switch id {
		case "listNotes":
			return mcp.OperationInfo{Grantable: true, Permissions: []string{"notes:access"}, PermissionMode: "all"}, true
		case "readNote":
			return mcp.OperationInfo{Grantable: true, Permissions: []string{"notes:access", "files:access"}, PermissionMode: "all"}, true
		case "superOnly":
			return mcp.OperationInfo{Grantable: true, SuperAdmin: true}, true
		case "internalOnly":
			return mcp.OperationInfo{Grantable: false}, true
		default:
			return mcp.OperationInfo{}, false
		}
	})
}

func TestPrincipalRejectsNonPersonalCredentials(t *testing.T) {
	for _, kind := range []string{"client", "challenge"} {
		identity := platform.BearerIdentity{
			Session:    contracts.Session{User: contracts.User{ID: "u1"}},
			Credential: platform.APICredential{ID: "c", Kind: kind},
		}
		if _, err := NewPrincipal(identity, stubScopes{}); err == nil {
			t.Errorf("kind %q unexpectedly converted to an MCP principal", kind)
		}
	}
}

func TestAuthorizeMatrix(t *testing.T) {
	authorizer := Authorizer{Operations: testOperations()}
	denied := func(name string, err error, want mcp.Category) {
		if err == nil {
			t.Errorf("%s: expected denial, got none", name)
			return
		}
		mcpErr, ok := err.(*mcp.Error)
		if !ok || mcpErr.Category != want {
			t.Errorf("%s: denial is not a %s core error: %v", name, want, err)
		}
	}
	allowed := func(name string, err error) {
		if err != nil {
			t.Errorf("%s: unexpectedly denied: %v", name, err)
		}
	}
	// No mcp:access point: the entry permission denies with access_denied.
	denied("missing mcp:access", authorizer.Authorize(context.Background(),
		principalFor([]string{"listNotes"}, "notes:access"), []string{"listNotes"}), mcp.CatForbidden)
	// Per-tool failures unify with unknown and disabled capabilities.
	denied("missing operation grant", authorizer.Authorize(context.Background(),
		principalFor(nil, MCPAccessPermission, "notes:access"), []string{"listNotes"}), mcp.CatUnavailable)
	// Permission points of the operation not covered: denied.
	denied("missing permission points", authorizer.Authorize(context.Background(),
		principalFor([]string{"readNote"}, MCPAccessPermission, "notes:access"), []string{"readNote"}), mcp.CatUnavailable)
	// Super-only and non-grantable operations never pass, whatever the grants.
	denied("super-only operation", authorizer.Authorize(context.Background(),
		principalFor([]string{"superOnly", "internalOnly"}, MCPAccessPermission), []string{"superOnly"}), mcp.CatUnavailable)
	denied("non-grantable operation", authorizer.Authorize(context.Background(),
		principalFor([]string{"superOnly", "internalOnly"}, MCPAccessPermission), []string{"internalOnly"}), mcp.CatUnavailable)
	// Unknown operations fail closed.
	denied("unknown operation", authorizer.Authorize(context.Background(),
		principalFor([]string{"listNotes"}, MCPAccessPermission, "notes:access"), []string{"ghost"}), mcp.CatUnavailable)
	// The happy path: access point, grant and permission points all held.
	allowed("authorized caller", authorizer.Authorize(context.Background(),
		principalFor([]string{"listNotes"}, MCPAccessPermission, "notes:access"), []string{"listNotes"}))
	allowed("authorized multi-operation caller", authorizer.Authorize(context.Background(),
		principalFor([]string{"readNote"}, MCPAccessPermission, "notes:access", "files:access"), []string{"readNote"}))
}

// A super_admin PAT keeps the full permission-point projection, but without
// an explicit operation grant on its bound role it cannot call capabilities.
func TestSuperAdminWithoutExplicitGrantIsDenied(t *testing.T) {
	authorizer := Authorizer{Operations: testOperations()}
	super := contracts.User{ID: "u2", Roles: []string{"super_admin"}, Permissions: platform.Permissions(), OperationIds: &[]string{}}
	identity := platform.BearerIdentity{
		Session:    contracts.Session{User: super},
		Credential: platform.APICredential{ID: "cred2", Kind: "pat", RoleID: "super_admin"},
	}
	p, err := NewPrincipal(identity, stubScopes{})
	if err != nil {
		t.Fatalf("super personal token rejected: %v", err)
	}
	if err := authorizer.Authorize(context.Background(), p, []string{"listNotes"}); err == nil {
		t.Fatal("super personal token without an explicit grant unexpectedly passed")
	} else if !strings.Contains(err.Error(), "grant missing") {
		t.Fatalf("unexpected denial reason: %v", err)
	}
}

func TestAuthorizationVersionBindsGrants(t *testing.T) {
	first := principalFor([]string{"listNotes"}, MCPAccessPermission, "notes:access")
	second := principalFor([]string{"listNotes", "readNote"}, MCPAccessPermission, "notes:access")
	if first.AuthVersion() == "" {
		t.Fatal("authorization version is empty")
	}
	if first.AuthVersion() == second.AuthVersion() {
		t.Fatal("authorization version did not move when the operation grants changed")
	}
	if first.ActorID() != "u1" || first.CredentialID() != "cred1" || first.RoleID() != "member" || first.AuthMethod() != "pat" {
		t.Fatalf("principal identifiers are wrong: %+v", first)
	}
}

type failingScopes struct{}

func (failingScopes) DataScope(context.Context, contracts.User, string) (platform.ScopeFilter, error) {
	return platform.ScopeFilter{}, context.DeadlineExceeded
}

func TestScopeResolvesPerCall(t *testing.T) {
	p := principalFor([]string{"listNotes"}, MCPAccessPermission)
	filter, err := p.Scope(context.Background(), "notes:access")
	if err != nil || !filter.Self() {
		t.Fatalf("self scope resolution failed: %v %v", filter, err)
	}
	limited := &Principal{scopes: failingScopes{}}
	if _, err := limited.Scope(context.Background(), "notes:access"); err == nil {
		t.Fatal("scope resolver failure was swallowed")
	}
}
