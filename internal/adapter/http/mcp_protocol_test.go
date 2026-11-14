//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Full-stack MCP protocol interop: real platform install, PAT gate, open policy and SDK client discovery and calls over HTTP.
package httpadapter

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	mcpadapter "github.com/yunnuo/unicore/internal/adapter/mcp"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	notesnotessql "github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
	notesusecase "github.com/yunnuo/unicore/internal/modules/notes/usecase"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/platform/mcpauth"
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

func TestMCPProtocolInteropOverHTTP(t *testing.T) {
	ctx := context.Background()
	manager, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
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
	// register, the registry freezes, and the surface mounts behind /mcp.
	registry := mcp.NewRegistry()
	operations := mcp.OperationResolverFunc(func(id string) (mcp.OperationInfo, bool) {
		operation, ok := platform.Operation(id)
		if !ok {
			return mcp.OperationInfo{}, false
		}
		return mcp.OperationInfo{Grantable: operation.Grantable, SuperAdmin: operation.SuperAdmin, Permissions: operation.Permissions, PermissionMode: operation.PermissionMode}, true
	})
	governance := mcpadapter.GovernanceStore{Manager: manager}
	service := mcp.NewService(mcp.ServiceConfig{
		Registry: registry, Authorizer: mcpauth.Authorizer{Operations: operations},
		Policies: governance, Calls: governance,
		Clock: mcp.ClockFunc(func() int64 { return 1000 }), NewIdentifier: func() string { return "e2e-req" },
	})
	if err = mcpadapter.RegisterNotes(registry, manager, operations); err != nil {
		t.Fatal(err)
	}
	if err = registry.Freeze(); err != nil {
		t.Fatal(err)
	}
	surface := &mcpadapter.Surface{Install: manager, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test", Service: service, Registry: registry}
	router := New(Config{Core: bootstrap.Core(), Install: manager, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), MCP: surface})
	server := httptest.NewServer(router)
	defer server.Close()

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
	_, adminSession, err := identity.Issue(ctx, admin, 1)
	if err != nil {
		t.Fatal(err)
	}
	created, err := identity.Tokens.CreatePAT(ctx, adminSession, contracts.PersonalTokenInput{Name: "ai-client", RoleID: "user", ExpiresInDays: 1}, member.ID)
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

	// A real protocol client discovers and calls through the pinned baseline.
	client := &http.Client{Transport: &bearerTransport{inner: server.Client().Transport, bearer: created.Token}}
	transport := &sdk.StreamableClientTransport{Endpoint: server.URL + "/mcp", HTTPClient: client, DisableStandaloneSSE: true}
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
	records, total, err := repository.ListMCPCalls(ctx, platformsql.MCPCallFilter{})
	if err != nil || total != 1 || len(records) != 1 {
		t.Fatalf("call records = %d/%d, %v; want exactly one", len(records), total, err)
	}
	if records[0].Start.Name != "notes.search" || records[0].Finish.Status != "succeeded" || records[0].Start.ActorID != member.ID {
		t.Fatalf("record projection mismatch: %+v", records[0])
	}
}
