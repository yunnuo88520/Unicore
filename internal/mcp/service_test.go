// Author: yunnuo <ymz@ebox.vip>
// Description: Service pipeline tests: admission, phase gate, limits, call records and failure classification.
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

type stubPolicies struct {
	policy    map[string]Policy
	revision  int64
	policyErr error
}

func (s *stubPolicies) Policy(_ context.Context, kind Kind, name string) (Policy, error) {
	policy, ok := s.policy[name]
	if !ok {
		policy = Policy{Kind: kind, Name: name}
	}
	return policy, s.policyErr
}
func (s *stubPolicies) Revision(context.Context) (int64, error) { return s.revision, nil }

type stubCalls struct {
	beginErr  error
	finishErr error
	starts    []CallStart
	finishes  []CallFinish
}

func (s *stubCalls) Begin(_ context.Context, start CallStart) error {
	if s.beginErr != nil {
		return s.beginErr
	}
	s.starts = append(s.starts, start)
	return nil
}
func (s *stubCalls) Finish(_ context.Context, _ string, finish CallFinish) error {
	if s.finishErr != nil {
		return s.finishErr
	}
	s.finishes = append(s.finishes, finish)
	return nil
}

type stubAuthorizer struct{ err error }

func (s stubAuthorizer) Authorize(context.Context, Principal, []string) error { return s.err }

type stubPrincipal struct{ actor, credential, role string }

func (p stubPrincipal) ActorID() string      { return p.actor }
func (p stubPrincipal) CredentialID() string { return p.credential }
func (p stubPrincipal) RoleID() string       { return p.role }
func (p stubPrincipal) AuthMethod() string   { return "pat" }
func (p stubPrincipal) AuthVersion() string  { return "v1" }

var testLimits = Limits{TimeoutSeconds: 5, MaxRequestBytes: 1048576, MaxResultBytes: 262144, GlobalConcurrency: 8, UserConcurrency: 2, CredentialConcurrency: 2, UserCallsPerMinute: 120, CredentialCallsPerMinute: 60}

func pipelineTool(handler ToolHandler) (ToolDefinition, string) {
	def := ToolDefinition{
		Name: "notes.search", Module: "notes", Version: "1.0", ImplVersion: "1",
		TitleZh: "搜索", TitleEn: "Search", DescriptionZh: "搜索", DescriptionEn: "Search",
		InputSchema:  json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"search":{"type":"string","maxLength":128}}}`),
		OperationIDs: []string{"listNotes"}, Effect: EffectRead, Confirmation: ConfirmationNone, Handler: handler,
	}
	fingerprint, _ := Fingerprint(def)
	return def, fingerprint
}

func pipelineService(t *testing.T, def ToolDefinition, policies *stubPolicies, calls *stubCalls, authorizer Authorizer) *Service {
	t.Helper()
	registry := NewRegistry()
	if err := registry.Register(def, stubResolver{known: map[string]OperationInfo{"listNotes": {Grantable: true}}}); err != nil {
		t.Fatalf("registration failed: %v", err)
	}
	if err := registry.Freeze(); err != nil {
		t.Fatalf("freeze failed: %v", err)
	}
	return NewService(ServiceConfig{Registry: registry, Authorizer: authorizer, Policies: policies, Calls: calls, Clock: ClockFunc(func() int64 { return 1000 }), NewIdentifier: func() string { return "req-1" }})
}

func mustFingerprint(t *testing.T, def ToolDefinition) string {
	t.Helper()
	fingerprint, err := Fingerprint(def)
	if err != nil {
		t.Fatalf("fingerprint failed: %v", err)
	}
	return fingerprint
}

// enabledPolicies returns a policy store whose every tool is open under its
// own reviewed fingerprint; individual cases override for denial paths.
func enabledPolicies(t *testing.T, defs ...ToolDefinition) *stubPolicies {
	t.Helper()
	policies := &stubPolicies{policy: map[string]Policy{}}
	for _, def := range defs {
		policies.policy[def.Name] = Policy{Kind: KindTool, Name: def.Name, Enabled: true, AcceptedFingerprint: mustFingerprint(t, def)}
	}
	return policies
}

func TestCallToolSucceedsAndRecords(t *testing.T) {
	def, _ := pipelineTool(ToolHandlerFunc(func(_ context.Context, _ Principal, _ json.RawMessage) (any, error) {
		return map[string]any{"total": 1}, nil
	}))
	calls := &stubCalls{}
	service := pipelineService(t, def, enabledPolicies(t, def), calls, stubAuthorizer{})
	result, err := service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1", role: "member"}, testLimits, def.Name, "2026-07-28", "client", "1", json.RawMessage(`{"search":"hi"}`))
	if err != nil {
		t.Fatalf("call failed: %v", err)
	}
	if string(result.(json.RawMessage)) != `{"total":1}` {
		t.Fatalf("result = %s", result)
	}
	if len(calls.starts) != 1 || len(calls.finishes) != 1 {
		t.Fatalf("records = %d starts, %d finishes", len(calls.starts), len(calls.finishes))
	}
	if calls.finishes[0].Status != StatusSucceeded || calls.starts[0].ActorID != "u1" || calls.starts[0].RoleID != "member" {
		t.Fatalf("record content wrong: %+v %+v", calls.starts[0], calls.finishes[0])
	}
}

func TestCallToolAdmissionFailures(t *testing.T) {
	def, _ := pipelineTool(ToolHandlerFunc(func(_ context.Context, _ Principal, _ json.RawMessage) (any, error) {
		t.Fatal("handler must not run for admission failures")
		return nil, nil
	}))
	calls := &stubCalls{}
	cases := []struct {
		name       string
		tool       string
		policies   *stubPolicies
		authorizer Authorizer
		want       Category
	}{
		{"unknown tool", "ghost", &stubPolicies{}, stubAuthorizer{}, CatUnavailable},
		{"policy lookup failed", def.Name, &stubPolicies{policyErr: errors.New("db down")}, stubAuthorizer{}, CatInternal},
		{"disabled policy", def.Name, &stubPolicies{policy: map[string]Policy{def.Name: {Enabled: false}}}, stubAuthorizer{}, CatUnavailable},
		{"unreviewed fingerprint", def.Name, &stubPolicies{policy: map[string]Policy{def.Name: {Enabled: true, AcceptedFingerprint: "stale"}}}, stubAuthorizer{}, CatUnavailable},
		{"operation denied", def.Name, &stubPolicies{}, stubAuthorizer{err: ErrUnavailable("denied: operation grant missing")}, CatUnavailable},
		{"entry denied", def.Name, &stubPolicies{}, stubAuthorizer{err: ErrForbidden("mcp access point not granted")}, CatUnavailable},
	}
	for _, testCase := range cases {
		service := pipelineService(t, def, testCase.policies, calls, testCase.authorizer)
		_, err := service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, testLimits, testCase.tool, "2026-07-28", "", "", nil)
		var mcpErr *Error
		if !errors.As(err, &mcpErr) || mcpErr.Category != testCase.want {
			t.Errorf("%s: error = %v, want category %s", testCase.name, err, testCase.want)
		}
		if len(calls.starts) != 0 {
			t.Errorf("%s: call record started despite denial", testCase.name)
		}
	}
	// A write-effect tool is registered but never executes in P1.
	writeTool, _ := pipelineTool(ToolHandlerFunc(func(_ context.Context, _ Principal, _ json.RawMessage) (any, error) { return nil, nil }))
	writeTool.Effect = EffectWrite
	service := pipelineService(t, writeTool, &stubPolicies{}, calls, stubAuthorizer{})
	if _, err := service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, testLimits, writeTool.Name, "", "", "", nil); err == nil || !strings.Contains(err.Error(), "phase") {
		t.Fatalf("write tool error = %v, want phase gate", err)
	}
}

func TestCallToolInputValidationAndRecords(t *testing.T) {
	handlerRan := false
	def, _ := pipelineTool(ToolHandlerFunc(func(_ context.Context, _ Principal, _ json.RawMessage) (any, error) {
		handlerRan = true
		return map[string]any{}, nil
	}))
	calls := &stubCalls{}
	service := pipelineService(t, def, enabledPolicies(t, def), calls, stubAuthorizer{})
	// Unknown fields fail before the handler and before any record.
	if _, err := service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, testLimits, def.Name, "", "", "", json.RawMessage(`{"search":"x","evil":1}`)); err == nil {
		t.Fatal("unknown field unexpectedly accepted")
	}
	if handlerRan || len(calls.starts) != 0 {
		t.Fatalf("handler or record ran for invalid input: ran=%v records=%d", handlerRan, len(calls.starts))
	}
	// A failed start record blocks execution: audit availability precedes work.
	blocked := &stubCalls{beginErr: errors.New("storage down")}
	service = pipelineService(t, def, enabledPolicies(t, def), blocked, stubAuthorizer{})
	if _, err := service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, testLimits, def.Name, "", "", "", json.RawMessage(`{}`)); err == nil {
		t.Fatal("call unexpectedly ran without its start record")
	}
	if handlerRan {
		t.Fatal("handler ran although the start record failed")
	}
}

func TestCallToolBusinessAndTimeoutMapping(t *testing.T) {
	business, _ := pipelineTool(ToolHandlerFunc(func(_ context.Context, _ Principal, _ json.RawMessage) (any, error) {
		return nil, BusinessError("NOTE_NOT_FOUND", "note not found")
	}))
	calls := &stubCalls{}
	service := pipelineService(t, business, enabledPolicies(t, business), calls, stubAuthorizer{})
	_, err := service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, testLimits, business.Name, "", "", "", json.RawMessage(`{}`))
	var mcpErr *Error
	if !errors.As(err, &mcpErr) || mcpErr.Code != "NOTE_NOT_FOUND" || calls.finishes[0].Status != StatusFailed {
		t.Fatalf("business error = %v, record %+v", err, calls.finishes[0])
	}
	// Unclassified errors fail closed as internal errors.
	plain, _ := pipelineTool(ToolHandlerFunc(func(_ context.Context, _ Principal, _ json.RawMessage) (any, error) {
		return nil, errors.New("secret sql detail")
	}))
	service = pipelineService(t, plain, enabledPolicies(t, plain), calls, stubAuthorizer{})
	_, err = service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, testLimits, plain.Name, "", "", "", json.RawMessage(`{}`))
	if !errors.As(err, &mcpErr) || mcpErr.Category != CatInternal || strings.Contains(err.Error(), "secret") {
		t.Fatalf("unclassified error = %v, want closed internal error", err)
	}
	// A handler outliving its budget records a timeout.
	slow, _ := pipelineTool(ToolHandlerFunc(func(ctx context.Context, _ Principal, _ json.RawMessage) (any, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}))
	slowLimits := testLimits
	slowLimits.TimeoutSeconds = 1
	service = pipelineService(t, slow, enabledPolicies(t, slow), calls, stubAuthorizer{})
	start := time.Now()
	_, err = service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, slowLimits, slow.Name, "", "", "", json.RawMessage(`{}`))
	if time.Since(start) > 3*time.Second {
		t.Fatalf("timeout took %v, budget is 1s", time.Since(start))
	}
	if !errors.As(err, &mcpErr) || mcpErr.Code != "timed_out" || calls.finishes[len(calls.finishes)-1].Status != StatusTimedOut {
		t.Fatalf("timeout error = %v, record %+v", err, calls.finishes[len(calls.finishes)-1])
	}
}

func TestCallToolResultBoundAndRateLimits(t *testing.T) {
	huge, _ := pipelineTool(ToolHandlerFunc(func(_ context.Context, _ Principal, _ json.RawMessage) (any, error) {
		return map[string]any{"blob": strings.Repeat("x", 4096)}, nil
	}))
	calls := &stubCalls{}
	tinyLimits := testLimits
	tinyLimits.MaxResultBytes = 1024
	service := pipelineService(t, huge, enabledPolicies(t, huge), calls, stubAuthorizer{})
	_, err := service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, tinyLimits, huge.Name, "", "", "", json.RawMessage(`{}`))
	var mcpErr *Error
	if !errors.As(err, &mcpErr) || mcpErr.Code != "result_too_large" {
		t.Fatalf("oversized result error = %v, want result_too_large", err)
	}
	// Rate windows: one user call per minute on this configuration.
	limited, _ := pipelineTool(ToolHandlerFunc(func(_ context.Context, _ Principal, _ json.RawMessage) (any, error) {
		return map[string]any{}, nil
	}))
	tinyLimits = testLimits
	tinyLimits.UserCallsPerMinute = 1
	service = pipelineService(t, limited, enabledPolicies(t, limited), calls, stubAuthorizer{})
	if _, err = service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, tinyLimits, limited.Name, "", "", "", json.RawMessage(`{}`)); err != nil {
		t.Fatalf("first call failed: %v", err)
	}
	_, err = service.CallTool(context.Background(), stubPrincipal{actor: "u1", credential: "c1"}, tinyLimits, limited.Name, "", "", "", json.RawMessage(`{}`))
	if !errors.As(err, &mcpErr) || mcpErr.Category != CatRateLimited {
		t.Fatalf("second call error = %v, want rate limited", err)
	}
	// A different user keeps its own window.
	if _, err = service.CallTool(context.Background(), stubPrincipal{actor: "u2", credential: "c2"}, tinyLimits, limited.Name, "", "", "", json.RawMessage(`{}`)); err != nil {
		t.Fatalf("second user unexpectedly rate limited: %v", err)
	}
}

func TestVisibleToolsFiltersByPolicyAndAuthorization(t *testing.T) {
	def, _ := pipelineTool(ToolHandlerFunc(func(_ context.Context, _ Principal, _ json.RawMessage) (any, error) { return nil, nil }))
	other := def
	other.Name, other.Module = "notes.read", "notes"
	registry := NewRegistry()
	resolver := stubResolver{known: map[string]OperationInfo{"listNotes": {Grantable: true}}}
	if err := registry.Register(def, resolver); err != nil {
		t.Fatalf("register failed: %v", err)
	}
	if err := registry.Register(other, resolver); err != nil {
		t.Fatalf("register failed: %v", err)
	}
	if err := registry.Freeze(); err != nil {
		t.Fatalf("freeze failed: %v", err)
	}
	policies := &stubPolicies{policy: map[string]Policy{
		def.Name:   {Enabled: true, AcceptedFingerprint: mustFingerprint(t, def)},
		other.Name: {Enabled: true, AcceptedFingerprint: mustFingerprint(t, other)},
	}}
	service := NewService(ServiceConfig{Registry: registry, Authorizer: stubAuthorizer{}, Policies: policies, Calls: &stubCalls{}, Clock: ClockFunc(func() int64 { return 0 }), NewIdentifier: func() string { return "r" }})
	visible, err := service.VisibleTools(context.Background(), stubPrincipal{actor: "u1"})
	if err != nil || len(visible) != 2 {
		t.Fatalf("visible = %d tools, %v; want both", len(visible), err)
	}
	// Every tool denied by the authorizer: the directory hides them all.
	denied := NewService(ServiceConfig{Registry: registry, Authorizer: stubAuthorizer{err: ErrUnavailable("denied")}, Policies: policies, Calls: &stubCalls{}, Clock: ClockFunc(func() int64 { return 0 }), NewIdentifier: func() string { return "r" }})
	if visible, err = denied.VisibleTools(context.Background(), stubPrincipal{actor: "u1"}); err != nil || len(visible) != 0 {
		t.Fatalf("denied visible = %d tools, %v; want none", len(visible), err)
	}
}
