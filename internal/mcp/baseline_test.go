// Author: yunnuo <ymz@ebox.vip>
// Description: P1-00 baseline interop: pin the SDK protocol revision by exercising discovery and a tool round-trip in memory.
package mcp

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// baselineArgs and baselineOut stay deliberately minimal: this test freezes
// the go-sdk version and the 2026-07-28 protocol revision the transport
// adapter (internal/adapter/mcp) must serve, not the business tool surface.
type baselineArgs struct {
	Value string `json:"value" jsonschema:"the value to echo"`
}
type baselineOut struct {
	Echo string `json:"echo"`
}

func TestBaselineSDKInterop(t *testing.T) {
	ctx := context.Background()
	server := mcp.NewServer(&mcp.Implementation{Name: "unicore-baseline", Version: "0.0.0"}, nil)
	mcp.AddTool(server, &mcp.Tool{Name: "baseline.echo"}, func(_ context.Context, _ *mcp.CallToolRequest, input baselineArgs) (*mcp.CallToolResult, baselineOut, error) {
		return nil, baselineOut{Echo: input.Value}, nil
	})
	client := mcp.NewClient(&mcp.Implementation{Name: "unicore-baseline-client", Version: "0.0.0"}, nil)

	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	serverDone := make(chan error, 1)
	go func() { serverDone <- server.Run(ctx, serverTransport) }()
	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("connect failed: %v", err)
	}
	defer session.Close()

	if revision := session.InitializeResult().ProtocolVersion; revision != "2026-07-28" {
		t.Fatalf("negotiated protocol revision %q, want the pinned 2026-07-28 baseline", revision)
	}
	listing, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatalf("tools/list failed: %v", err)
	}
	if len(listing.Tools) != 1 || listing.Tools[0].Name != "baseline.echo" {
		t.Fatalf("tools/list returned %+v, want exactly baseline.echo", listing.Tools)
	}
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "baseline.echo", Arguments: map[string]any{"value": "pong"}})
	if err != nil {
		t.Fatalf("tools/call failed: %v", err)
	}
	if result.IsError {
		t.Fatalf("tools/call reported an error result: %+v", result.Content)
	}
	structured, ok := result.StructuredContent.(map[string]any)
	if !ok {
		t.Fatalf("tools/call returned no structured object: %+v", result.Content)
	}
	if echo, ok := structured["echo"].(string); !ok || echo != "pong" {
		t.Fatalf("structured content %v, want echo=pong", result.StructuredContent)
	}
	if err := session.Close(); err != nil {
		t.Fatalf("close failed: %v", err)
	}
	if err := <-serverDone; err != nil {
		t.Fatalf("server run failed: %v", err)
	}
}
