//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Full-stack MCP protocol interop: real platform install, PAT gate, open policy and SDK client discovery and calls over HTTP.
package httpadapter

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	mcpadapter "github.com/yunnuo/unicore/internal/adapter/mcp"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mcp"
	notesnotessql "github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
	notesusecase "github.com/yunnuo/unicore/internal/modules/notes/usecase"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/platform/mcpauth"
	"github.com/yunnuo/unicore/internal/platform/mcpoauth"
	"github.com/yunnuo/unicore/internal/runtime"
)

// bearerTransport injects one personal token into every request, the way a
// real protocol client would present its credential.
type bearerTransport struct {
	inner  http.RoundTripper
	bearer string
}

func (t *bearerTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	clone := request.Clone(request.Context())
	clone.Header.Set("Authorization", "Bearer "+t.bearer)
	return t.inner.RoundTrip(clone)
}

// mcpInterop is the shared full-stack harness: a real platform install, the
// frozen notes capability and the production surface wiring, OAuth included.
type mcpInterop struct {
	ctx        context.Context
	manager    *install.Manager
	repository *platformsql.Repository
	identity   *platform.Service
	admin      contracts.User
	member     contracts.User
	server     *httptest.Server
	registry   *mcp.Registry
	service    *mcp.Service
	oauth      *mcpoauth.Service
}

func openMCPInterop(t *testing.T) *mcpInterop {
	t.Helper()
	ctx := context.Background()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { manager.Close() })
	bootstrapToken, err := os.ReadFile(manager.TokenPath())
	if err != nil {
		t.Fatal(err)
	}
	_, admin, err := manager.Complete(ctx, strings.TrimSpace(string(bootstrapToken)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "MCP", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	store, _, identity, profile := manager.Services()
	if profile != runtime.WebPlatform || store == nil || identity == nil {
		t.Fatalf("platform identity unavailable: profile=%s", profile)
	}
	repository := &platformsql.Repository{Store: store}

	// The MCP wiring mirrors the web composition root: module contributions
	// register, the registry freezes, and the surface mounts behind /mcp with
	// the same lazy OAuth storage adapter.
	registry := mcp.NewRegistry()
	operations := mcp.OperationResolverFunc(func(id string) (mcp.OperationInfo, bool) {
		operation, ok := platform.Operation(id)
		if !ok {
			return mcp.OperationInfo{}, false
		}
		return mcp.OperationInfo{Grantable: operation.Grantable, SuperAdmin: operation.SuperAdmin, Permissions: operation.Permissions, PermissionMode: operation.PermissionMode}, true
	})
	governance := mcpadapter.GovernanceStore{Manager: manager}
	var callSequence atomic.Int64
	service := mcp.NewService(mcp.ServiceConfig{
		Registry: registry, Authorizer: mcpauth.Authorizer{Operations: operations},
		Policies: governance, Calls: governance,
		Clock:         mcp.ClockFunc(func() int64 { return 1000 }),
		NewIdentifier: func() string { return fmt.Sprintf("e2e-req-%d", callSequence.Add(1)) },
		WritePhase: func() bool {
			_, settingsService, _, profile := manager.Services()
			if settingsService == nil || profile != runtime.WebPlatform {
				return false
			}
			values, err := settingsService.Raw(context.Background())
			return err == nil && values["mcp.write_enabled"] == "true"
		},
	})
	if err = mcpadapter.RegisterNotes(registry, manager, operations); err != nil {
		t.Fatal(err)
	}
	if err = registry.Freeze(); err != nil {
		t.Fatal(err)
	}
	oauth := mcpoauth.New(mcpadapter.OAuthStore{Manager: manager}, func() string { return "http://localhost/mcp" })
	surface := &mcpadapter.Surface{Install: manager, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test", Service: service, Registry: registry, OAuth: oauth}
	router := New(Config{Core: bootstrap.Core(), Install: manager, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), MCP: surface})
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	// Grant the default user role the access point and the notes read operation.
	for _, permission := range []string{"mcp:access", "notes:access"} {
		if _, err = store.Exec(ctx, store.DB, "INSERT OR IGNORE INTO unicore_permissions(id) VALUES(?)", permission); err != nil {
			t.Fatal(err)
		}
		if _, err = store.Exec(ctx, store.DB, "INSERT OR IGNORE INTO unicore_role_permissions(role_id,permission_id) VALUES('user',?)", permission); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = store.Exec(ctx, store.DB, "INSERT OR IGNORE INTO unicore_role_operations(role_id,operation_id) VALUES('user','listNotes')"); err != nil {
		t.Fatal(err)
	}

	member, err := identity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Seed one personal note so discovery and reads touch real business data.
	notes := &notesusecase.Notes{Repo: &notesnotessql.Repository{Store: store}}
	if _, err = notes.Create(ctx, "user/"+member.ID, contracts.NoteInput{Title: "hello", Body: "world", Status: "open"}); err != nil {
		t.Fatal(err)
	}

	// Closed by default: the endpoint answers 503 before any authentication.
	closed, err := http.Post(server.URL+"/mcp", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	closed.Body.Close()
	if closed.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("closed service status = %d, want 503", closed.StatusCode)
	}

	// Enable the service and open the notes.search capability under its fingerprint.
	if _, err = repository.UpdateMCPConfig(ctx, 0, map[string]string{"mcp.enabled": "true"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	fingerprint, _ := registry.Fingerprint("notes.search")
	if _, err = repository.UpdateMCPPolicy(ctx, mcp.Policy{Kind: mcp.KindTool, Name: "notes.search", Enabled: true, AcceptedFingerprint: fingerprint, AcceptedVersion: "1.0"}, fingerprint, admin.ID); err != nil {
		t.Fatal(err)
	}
	return &mcpInterop{ctx: ctx, manager: manager, repository: repository, identity: identity, admin: admin, member: member, server: server, registry: registry, service: service, oauth: oauth}
}

func TestMCPProtocolInteropOverHTTP(t *testing.T) {
	env := openMCPInterop(t)
	ctx := env.ctx

	_, adminSession, err := env.identity.Issue(ctx, env.admin, 1)
	if err != nil {
		t.Fatal(err)
	}
	created, err := env.identity.Tokens.CreatePAT(ctx, adminSession, contracts.PersonalTokenInput{Name: "ai-client", RoleID: "user", ExpiresInDays: 1}, env.member.ID)
	if err != nil {
		t.Fatal(err)
	}

	// A real protocol client discovers and calls through the pinned baseline.
	client := &http.Client{Transport: &bearerTransport{inner: env.server.Client().Transport, bearer: created.Token}}
	transport := &sdk.StreamableClientTransport{Endpoint: env.server.URL + "/mcp", HTTPClient: client, DisableStandaloneSSE: true}
	session, err := sdk.NewClient(&sdk.Implementation{Name: "unicore-e2e", Version: "0"}, nil).Connect(ctx, transport, nil)
	if err != nil {
		t.Fatalf("protocol connect failed: %v", err)
	}
	defer session.Close()
	if revision := session.InitializeResult().ProtocolVersion; revision != "2026-07-28" {
		t.Fatalf("negotiated revision %q, want 2026-07-28", revision)
	}
	listing, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatalf("tools/list failed: %v", err)
	}
	// notes.get stays closed: the directory only exposes the reviewed capability.
	if len(listing.Tools) != 1 || listing.Tools[0].Name != "notes.search" {
		t.Fatalf("tools/list = %+v, want exactly notes.search", listing.Tools)
	}
	result, err := session.CallTool(ctx, &sdk.CallToolParams{
		Name: "notes.search", Arguments: map[string]any{"search": "hello"},
	})
	if err != nil || result.IsError {
		t.Fatalf("notes.search failed: %v %+v", err, result)
	}
	structured, _ := result.StructuredContent.(map[string]any)
	if structured["total"] != float64(1) {
		t.Fatalf("search total = %v, want 1", structured["total"])
	}
	// Calling the closed capability yields the unified unavailability semantics.
	if _, err = session.CallTool(ctx, &sdk.CallToolParams{Name: "notes.get", Arguments: map[string]any{}}); err == nil {
		t.Fatal("closed capability unexpectedly executed")
	}
	// The call record exists with its content-free metadata.
	records, total, err := env.repository.ListMCPCalls(ctx, platformsql.MCPCallFilter{})
	if err != nil || total != 1 || len(records) != 1 {
		t.Fatalf("call records = %d/%d, %v; want exactly one", len(records), total, err)
	}
	if records[0].Start.Name != "notes.search" || records[0].Finish.Status != "succeeded" || records[0].Start.ActorID != env.member.ID {
		t.Fatalf("record projection mismatch: %+v", records[0])
	}

	// Legacy clients negotiate down to 2025-11-25 and ride the same stateless
	// authorization chain: no separate credential family, session store or
	// directory for the old revision.
	legacy, err := sdk.NewClient(&sdk.Implementation{Name: "unicore-legacy", Version: "0"}, nil).Connect(ctx, transport, &sdk.ClientSessionOptions{ProtocolVersion: "2025-11-25"})
	if err != nil {
		t.Fatalf("legacy protocol connect failed: %v", err)
	}
	defer legacy.Close()
	if revision := legacy.InitializeResult().ProtocolVersion; revision != "2025-11-25" {
		t.Fatalf("legacy negotiated revision %q, want 2025-11-25", revision)
	}
	legacyListing, err := legacy.ListTools(ctx, nil)
	if err != nil || len(legacyListing.Tools) != 1 || legacyListing.Tools[0].Name != "notes.search" {
		t.Fatalf("legacy tools/list = %+v, %v; want exactly notes.search", legacyListing, err)
	}
	legacyResult, err := legacy.CallTool(ctx, &sdk.CallToolParams{Name: "notes.search", Arguments: map[string]any{"search": "hello"}})
	if err != nil || legacyResult.IsError {
		t.Fatalf("legacy notes.search failed: %v %+v", err, legacyResult)
	}
	legacyStructured, _ := legacyResult.StructuredContent.(map[string]any)
	if legacyStructured["total"] != float64(1) {
		t.Fatalf("legacy search total = %v, want 1", legacyStructured["total"])
	}
}

func TestMCPProtocolOAuthInteropOverHTTP(t *testing.T) {
	env := openMCPInterop(t)
	ctx := env.ctx

	// The OAuth switch gates every ucm_ credential at the transport gate.
	revision, err := env.repository.MCPControlRevision(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = env.repository.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.oauth_enabled": "true"}, env.admin.ID); err != nil {
		t.Fatal(err)
	}

	// Register and enable one public client the way the admin console would.
	client, _, err := env.oauth.CreateClient(ctx, "E2E CLI", mcpoauth.ClientPublic, "", []string{"http://127.0.0.1:0/callback"}, env.admin.Username)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = env.oauth.UpdateClient(ctx, client.ID, client.Name, client.RedirectURIs, true, client.Version, env.admin.Username); err != nil {
		t.Fatal(err)
	}

	// The consent step binds one held role; the service issues a one-time
	// code that only exchanges once against the registered callback.
	grant, err := env.oauth.CreateGrant(ctx, env.member.ID, client.ID, "user", []string{mcpoauth.ScopeRead, mcpoauth.ScopeOffline}, env.member.Roles)
	if err != nil {
		t.Fatal(err)
	}
	verifier := strings.Repeat("v", 48)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	code, err := env.oauth.IssueCode(ctx, grant, client.RedirectURIs[0], challenge, "S256")
	if err != nil {
		t.Fatal(err)
	}
	issued, err := env.oauth.ExchangeCode(ctx, client.ID, "", code, client.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatal(err)
	}
	if issued.AccessToken == "" || issued.RefreshToken == "" {
		t.Fatal("oauth exchange must yield both tokens")
	}

	// The OAuth access token reaches the same directory under the same rules.
	transport := &sdk.StreamableClientTransport{
		Endpoint: env.server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: &bearerTransport{inner: env.server.Client().Transport, bearer: issued.AccessToken}},
	}
	session, err := sdk.NewClient(&sdk.Implementation{Name: "unicore-oauth", Version: "0"}, nil).Connect(ctx, transport, nil)
	if err != nil {
		t.Fatalf("oauth protocol connect failed: %v", err)
	}
	listing, err := session.ListTools(ctx, nil)
	if err != nil || len(listing.Tools) != 1 || listing.Tools[0].Name != "notes.search" {
		t.Fatalf("oauth tools/list = %+v, %v; want exactly notes.search", listing, err)
	}
	result, err := session.CallTool(ctx, &sdk.CallToolParams{Name: "notes.search", Arguments: map[string]any{"search": "hello"}})
	if err != nil || result.IsError {
		t.Fatalf("oauth notes.search failed: %v %+v", err, result)
	}
	structured, _ := result.StructuredContent.(map[string]any)
	if structured["total"] != float64(1) {
		t.Fatalf("oauth search total = %v, want 1", structured["total"])
	}
	session.Close()

	// Revoking the grant kills every token at once; the next request is
	// rejected before any protocol handling.
	records, err := env.oauth.Store.GrantsForUser(ctx, env.member.ID)
	if err != nil || len(records) != 1 {
		t.Fatalf("grants for user = %v/%d", records, err)
	}
	if err = env.oauth.RevokeGrant(ctx, records[0], env.admin.Username); err != nil {
		t.Fatal(err)
	}
	rejected, err := http.Get(env.server.URL + "/mcp")
	if err != nil {
		t.Fatal(err)
	}
	rejected.Body.Close()
	_ = rejected
	request, err := http.NewRequest(http.MethodPost, env.server.URL+"/mcp", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+issued.AccessToken)
	after, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	after.Body.Close()
	if after.StatusCode != http.StatusUnauthorized {
		t.Fatalf("post-revocation status = %d, want 401", after.StatusCode)
	}
}

func TestMCPWritePhaseGate(t *testing.T) {
	env := openMCPInterop(t)
	ctx := env.ctx

	// The write capability registers under its own fingerprint; open it.
	fingerprint, _ := env.registry.Fingerprint("notes.update")
	if _, err := env.repository.UpdateMCPPolicy(ctx, mcp.Policy{Kind: mcp.KindTool, Name: "notes.update", Enabled: true, AcceptedFingerprint: fingerprint, AcceptedVersion: "1.0"}, fingerprint, env.admin.ID); err != nil {
		t.Fatal(err)
	}
	// The user role needs the delegable write operation and its permission point.
	store, _, _, _ := env.manager.Services()
	for _, statement := range []string{
		"INSERT OR IGNORE INTO unicore_role_operations(role_id,operation_id) VALUES('user','updateNote')",
	} {
		if _, err := store.Exec(ctx, store.DB, statement); err != nil {
			t.Fatal(err)
		}
	}
	seedPermission := func(id string) {
		if _, err := store.Exec(ctx, store.DB, "INSERT OR IGNORE INTO unicore_permissions(id) VALUES(?)", id); err != nil {
			t.Fatal(err)
		}
		if _, err := store.Exec(ctx, store.DB, "INSERT OR IGNORE INTO unicore_role_permissions(role_id,permission_id) VALUES('user',?)", id); err != nil {
			t.Fatal(err)
		}
	}
	seedPermission("notes:update")
	seedPermission("notes:access")

	// Seed one note owned by the member.
	notes := &notesusecase.Notes{Repo: &notesnotessql.Repository{Store: store}}
	entry, err := notes.Create(ctx, "user/"+env.member.ID, contracts.NoteInput{Title: "draft", Body: "v1", Status: "open"})
	if err != nil {
		t.Fatal(err)
	}

	oauthSession := func(scopes []string) *sdk.ClientSession {
		t.Helper()
		client, _, err := env.oauth.CreateClient(ctx, "Writer", mcpoauth.ClientPublic, "", []string{"http://127.0.0.1:0/callback"}, env.admin.Username)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = env.oauth.UpdateClient(ctx, client.ID, client.Name, client.RedirectURIs, true, client.Version, env.admin.Username); err != nil {
			t.Fatal(err)
		}
		grant, err := env.oauth.CreateGrant(ctx, env.member.ID, client.ID, "user", scopes, env.member.Roles)
		if err != nil {
			t.Fatal(err)
		}
		verifier := strings.Repeat("v", 48)
		sum := sha256.Sum256([]byte(verifier))
		code, err := env.oauth.IssueCode(ctx, grant, client.RedirectURIs[0], base64.RawURLEncoding.EncodeToString(sum[:]), "S256")
		if err != nil {
			t.Fatal(err)
		}
		issued, err := env.oauth.ExchangeCode(ctx, client.ID, "", code, client.RedirectURIs[0], verifier)
		if err != nil {
			t.Fatal(err)
		}
		session, err := sdk.NewClient(&sdk.Implementation{Name: "writer", Version: "0"}, nil).Connect(ctx, &sdk.StreamableClientTransport{
			Endpoint: env.server.URL + "/mcp", DisableStandaloneSSE: true,
			HTTPClient: &http.Client{Transport: &bearerTransport{inner: env.server.Client().Transport, bearer: issued.AccessToken}},
		}, nil)
		if err != nil {
			t.Fatal(err)
		}
		return session
	}
	currentVersion := entry.Version
	call := func(session *sdk.ClientSession) error {
		result, err := session.CallTool(ctx, &sdk.CallToolParams{Name: "notes.update", Arguments: map[string]any{
			"id": entry.ID, "title": "draft", "body": "v2", "status": "open", "version": currentVersion,
		}})
		if err == nil && result != nil && !result.IsError {
			if structured, ok := result.StructuredContent.(map[string]any); ok {
				if version, ok := structured["version"].(float64); ok {
					currentVersion = int(version)
				}
			}
		}
		return err
	}

	// The OAuth switch gates every ucm_ credential before the phase matters.
	revision, err := env.repository.MCPControlRevision(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = env.repository.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.oauth_enabled": "true"}, env.admin.ID); err != nil {
		t.Fatal(err)
	}

	// Phase closed: even a mcp.write token cannot pass the phase gate.
	writeScopes := []string{mcpoauth.ScopeRead, mcpoauth.ScopeWrite, mcpoauth.ScopeOffline}
	session := oauthSession(writeScopes)
	if err = call(session); err == nil {
		t.Fatal("closed phase unexpectedly executed a write")
	}
	session.Close()

	// Phase open without the write budget: unified denial at the transport.
	revision, err = env.repository.MCPControlRevision(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = env.repository.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.write_enabled": "true"}, env.admin.ID); err != nil {
		t.Fatal(err)
	}
	session = oauthSession([]string{mcpoauth.ScopeRead, mcpoauth.ScopeOffline})
	if err = call(session); err == nil {
		t.Fatal("missing mcp.write budget unexpectedly executed a write")
	}
	session.Close()

	// Phase open with the budget: notes.update declares a required personal
	// confirmation, and no confirmation workflow exists — the confirmation
	// gate refuses the execution even though phase, policy and budget all
	// allow it. A client dialog or model claim is not a confirmation.
	session = oauthSession(writeScopes)
	if err = call(session); err == nil {
		t.Fatal("confirmation-required write unexpectedly executed without a confirmation record")
	}
	// The confirmation gate also keeps the tool out of the directory: an
	// advertised-but-unexecutable capability would only invite retries.
	listing, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, tool := range listing.Tools {
		if tool.Name == "notes.update" {
			t.Fatalf("tools/list advertises notes.update %v", listing.Tools)
		}
	}
	session.Close()

	// PAT principals carry no scope budget and ride the same gate: the phase
	// switch alone never opens a confirmation-required capability.
	_, adminSession, err := env.identity.Issue(ctx, env.admin, 1)
	if err != nil {
		t.Fatal(err)
	}
	pat, err := env.identity.Tokens.CreatePAT(ctx, adminSession, contracts.PersonalTokenInput{Name: "writer-pat", RoleID: "user", ExpiresInDays: 1}, env.member.ID)
	if err != nil {
		t.Fatal(err)
	}
	patSession, err := sdk.NewClient(&sdk.Implementation{Name: "pat-writer", Version: "0"}, nil).Connect(ctx, &sdk.StreamableClientTransport{
		Endpoint: env.server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: &bearerTransport{inner: env.server.Client().Transport, bearer: pat.Token}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer patSession.Close()
	if err = call(patSession); err == nil {
		t.Fatal("PAT unexpectedly executed a confirmation-required write")
	}
}

func TestMCPDynamicClientRegistration(t *testing.T) {
	env := openMCPInterop(t)
	ctx := env.ctx

	register := func(body string) (int, map[string]any) {
		request, err := http.NewRequest(http.MethodPost, env.server.URL+"/oauth/mcp/register", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Content-Type", "application/json")
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		raw, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatal(err)
		}
		payload := map[string]any{}
		// The closed-switch 404 is plain text; JSON bodies decode where asserted.
		_ = json.Unmarshal(raw, &payload)
		return response.StatusCode, payload
	}

	// Closed by default: the endpoint is a plain 404 like every OAuth route.
	status, _ := register(`{"redirect_uris":["https://app.example/cb"]}`)
	if status != http.StatusNotFound {
		t.Fatalf("closed DCR status = %d, want 404", status)
	}

	revision, err := env.repository.MCPControlRevision(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = env.repository.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.dcr_enabled": "true"}, env.admin.ID); err != nil {
		t.Fatal(err)
	}

	// Discovery now advertises the registration endpoint. The OAuth switch is
	// still closed here, so first open it the way the admin console would.
	revision, err = env.repository.MCPControlRevision(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = env.repository.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.oauth_enabled": "true"}, env.admin.ID); err != nil {
		t.Fatal(err)
	}
	discovery, err := http.Get(env.server.URL + "/.well-known/oauth-authorization-server")
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.NewDecoder(discovery.Body).Decode(&document); err != nil {
		t.Fatalf("discovery document: %v", err)
	}
	discovery.Body.Close()
	// The fixture installs with base_url http://localhost; the advertised
	// endpoint derives from that trusted base, not the request authority.
	if document["registration_endpoint"] != "http://localhost/oauth/mcp/register" {
		t.Fatalf("discovery registration endpoint = %v", document["registration_endpoint"])
	}

	// Invalid metadata maps onto the RFC 7591 error codes.
	status, payload := register(`{"redirect_uris":["http://app.example/cb"]}`)
	if status != 400 || payload["error"] != "invalid_redirect_uri" {
		t.Fatalf("plain http registration = %d %v", status, payload)
	}
	status, payload = register(`{"redirect_uris":["https://app.example/cb"],"token_endpoint_auth_method":"client_secret_basic"}`)
	if status != 400 || payload["error"] != "invalid_client_metadata" {
		t.Fatalf("confidential DCR = %d %v", status, payload)
	}

	// A valid registration yields an enabled public client immediately.
	status, payload = register(`{"redirect_uris":["https://app.example/cb"],"client_name":"DCR Agent"}`)
	if status != 201 {
		t.Fatalf("registration status = %d %v", status, payload)
	}
	clientID, _ := payload["client_id"].(string)
	if clientID == "" || payload["token_endpoint_auth_method"] != "none" || payload["client_name"] != "DCR Agent" {
		t.Fatalf("registration payload = %v", payload)
	}

	// The registered client completes the whole consent loop like a
	// pre-registered one.
	grant, err := env.oauth.CreateGrant(ctx, env.member.ID, clientID, "user", []string{mcpoauth.ScopeRead}, env.member.Roles)
	if err != nil {
		t.Fatal(err)
	}
	verifier := strings.Repeat("v", 48)
	sum := sha256.Sum256([]byte(verifier))
	code, err := env.oauth.IssueCode(ctx, grant, "https://app.example/cb", base64.RawURLEncoding.EncodeToString(sum[:]), "S256")
	if err != nil {
		t.Fatal(err)
	}
	issued, err := env.oauth.ExchangeCode(ctx, clientID, "", code, "https://app.example/cb", verifier)
	if err != nil {
		t.Fatal(err)
	}
	session, err := sdk.NewClient(&sdk.Implementation{Name: "dcr-agent", Version: "0"}, nil).Connect(ctx, &sdk.StreamableClientTransport{
		Endpoint: env.server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: &bearerTransport{inner: env.server.Client().Transport, bearer: issued.AccessToken}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	listing, err := session.ListTools(ctx, nil)
	if err != nil || len(listing.Tools) != 1 || listing.Tools[0].Name != "notes.search" {
		t.Fatalf("dcr tools/list = %+v, %v", listing, err)
	}
}

func TestMCPPatSwitchGatesPersonalTokens(t *testing.T) {
	env := openMCPInterop(t)
	ctx := env.ctx
	// OAuth needs its own switch; enable it so the OAuth path stays available
	// while the PAT switch flips.
	revision, err := env.repository.MCPControlRevision(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = env.repository.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.oauth_enabled": "true"}, env.admin.ID); err != nil {
		t.Fatal(err)
	}
	// The member role needs the notes read operation; the access point is
	// already granted by the fixture.
	store, _, _, _ := env.manager.Services()
	if _, err = store.Exec(ctx, store.DB, "INSERT OR IGNORE INTO unicore_role_operations(role_id,operation_id) VALUES('user','listNotes')"); err != nil {
		t.Fatal(err)
	}
	patSession := func(token string) *sdk.ClientSession {
		t.Helper()
		session, err := sdk.NewClient(&sdk.Implementation{Name: "pat-reader", Version: "0"}, nil).Connect(ctx, &sdk.StreamableClientTransport{
			Endpoint: env.server.URL + "/mcp", DisableStandaloneSSE: true,
			HTTPClient: &http.Client{Transport: &bearerTransport{inner: env.server.Client().Transport, bearer: token}},
		}, nil)
		if err != nil {
			t.Fatal(err)
		}
		return session
	}
	newPat := func() string {
		t.Helper()
		_, adminSession, err := env.identity.Issue(ctx, env.admin, 1)
		if err != nil {
			t.Fatal(err)
		}
		pat, err := env.identity.Tokens.CreatePAT(ctx, adminSession, contracts.PersonalTokenInput{Name: "reader", RoleID: "user", ExpiresInDays: 1}, env.member.ID)
		if err != nil {
			t.Fatal(err)
		}
		return pat.Token
	}
	oauthSession := func() *sdk.ClientSession {
		t.Helper()
		client, _, err := env.oauth.CreateClient(ctx, "Reader", mcpoauth.ClientPublic, "", []string{"http://127.0.0.1:0/callback"}, env.admin.Username)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = env.oauth.UpdateClient(ctx, client.ID, client.Name, client.RedirectURIs, true, client.Version, env.admin.Username); err != nil {
			t.Fatal(err)
		}
		grant, err := env.oauth.CreateGrant(ctx, env.member.ID, client.ID, "user", []string{mcpoauth.ScopeRead}, env.member.Roles)
		if err != nil {
			t.Fatal(err)
		}
		verifier := strings.Repeat("v", 48)
		sum := sha256.Sum256([]byte(verifier))
		code, err := env.oauth.IssueCode(ctx, grant, client.RedirectURIs[0], base64.RawURLEncoding.EncodeToString(sum[:]), "S256")
		if err != nil {
			t.Fatal(err)
		}
		issued, err := env.oauth.ExchangeCode(ctx, client.ID, "", code, client.RedirectURIs[0], verifier)
		if err != nil {
			t.Fatal(err)
		}
		session, err := sdk.NewClient(&sdk.Implementation{Name: "oauth-reader", Version: "0"}, nil).Connect(ctx, &sdk.StreamableClientTransport{
			Endpoint: env.server.URL + "/mcp", DisableStandaloneSSE: true,
			HTTPClient: &http.Client{Transport: &bearerTransport{inner: env.server.Client().Transport, bearer: issued.AccessToken}},
		}, nil)
		if err != nil {
			t.Fatal(err)
		}
		return session
	}
	discover := func(session *sdk.ClientSession) error {
		_, err := session.ListTools(ctx, nil)
		return err
	}

	// Baseline: the PAT switch defaults to on and the token works.
	session := patSession(newPat())
	if err = discover(session); err != nil {
		t.Fatalf("PAT discovery with the default switch: %v", err)
	}
	session.Close()

	// PAT off: the same valid PAT is refused per request while OAuth tokens
	// keep working.
	revision, err = env.repository.MCPControlRevision(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = env.repository.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.pat_enabled": "false"}, env.admin.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = sdk.NewClient(&sdk.Implementation{Name: "pat-reader", Version: "0"}, nil).Connect(ctx, &sdk.StreamableClientTransport{
		Endpoint: env.server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: &bearerTransport{inner: env.server.Client().Transport, bearer: newPat()}},
	}, nil); err == nil {
		t.Fatal("PAT unexpectedly passed with the switch closed")
	}
	oauth := oauthSession()
	if err = discover(oauth); err != nil {
		t.Fatalf("OAuth discovery unaffected by the PAT switch: %v", err)
	}
	oauth.Close()

	// Re-enable: the PAT recovers without re-issuing it.
	revision, err = env.repository.MCPControlRevision(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = env.repository.UpdateMCPConfig(ctx, revision, map[string]string{"mcp.pat_enabled": "true"}, env.admin.ID); err != nil {
		t.Fatal(err)
	}
	session = patSession(newPat())
	if err = discover(session); err != nil {
		t.Fatalf("PAT discovery after re-enabling: %v", err)
	}
	session.Close()
}
