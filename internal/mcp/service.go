// Author: yunnuo <ymz@ebox.vip>
// Description: Discovery and read-only call orchestration over the frozen registry, open policies and call records.
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"sync/atomic"
	"time"
)

// Limits are the runtime bounds read from settings on every request.
type Limits struct {
	TimeoutSeconds           int
	MaxRequestBytes          int
	MaxResultBytes           int
	GlobalConcurrency        int
	UserConcurrency          int
	CredentialConcurrency    int
	UserCallsPerMinute       int
	CredentialCallsPerMinute int
}

// Valid bounds-checks the runtime limits against the registered setting
// ranges; a zero or corrupt value falls back to the documented defaults so a
// bad save cannot widen the bounds.
func (l Limits) Valid() bool {
	return l.TimeoutSeconds >= 1 && l.TimeoutSeconds <= 120 &&
		l.MaxRequestBytes >= 1024 && l.MaxRequestBytes <= 4*1024*1024 &&
		l.MaxResultBytes >= 1024 && l.MaxResultBytes <= 1024*1024 &&
		l.GlobalConcurrency >= 1 && l.GlobalConcurrency <= 256 &&
		l.UserConcurrency >= 1 && l.UserConcurrency <= 32 &&
		l.CredentialConcurrency >= 1 && l.CredentialConcurrency <= 16 &&
		l.UserCallsPerMinute >= 1 && l.UserCallsPerMinute <= 10000 &&
		l.CredentialCallsPerMinute >= 1 && l.CredentialCallsPerMinute <= 10000
}

// ServiceConfig wires the core service to its ports.
type ServiceConfig struct {
	Registry   *Registry
	Authorizer Authorizer
	Policies   PolicyStore
	Calls      CallStore
	Clock      Clock
	// NewIdentifier returns a unique server-side request identifier for call
	// records; it is distinct from the client-provided JSON-RPC id.
	NewIdentifier func() string
	// WritePhase reports whether the write phase is open. Nil or false keeps
	// every non-read capability behind the phase gate; the setting flips it
	// without a restart.
	WritePhase func() bool
}

// Service orchestrates discovery and read-only execution. Write effects are
// registered in code but never executed in P1; the phase gate lives here so
// no admin switch can widen it.
type Service struct {
	cfg      ServiceConfig
	limits   atomic.Pointer[limiter]
	limiterKey atomic.Value // Limits of the active limiter
}

func NewService(cfg ServiceConfig) *Service {
	return &Service{cfg: cfg}
}

// limiterFor returns the active limiter, rebuilding it when the configured
// limits change. Rebuilding drops in-flight windows; slots of the old
// limiter drain through their own release closures.
func (s *Service) limiterFor(limits Limits) *limiter {
	if current, ok := s.limiterKey.Load().(Limits); ok && current == limits {
		return s.limits.Load()
	}
	fresh := newLimiter(limits)
	s.limits.Store(fresh)
	s.limiterKey.Store(limits)
	return fresh
}

// AllowDirectory rate-checks a discovery request. Directory queries
// authenticate and rate-limit like calls; concurrency slots stay reserved
// for executions.
func (s *Service) AllowDirectory(_ context.Context, principal Principal, limits Limits) bool {
	if !limits.Valid() {
		return false
	}
	limiter := s.limiterFor(limits)
	if !limiter.allow(limits.UserCallsPerMinute, "user:"+principal.ActorID()) {
		return false
	}
	if !limiter.allow(limits.CredentialCallsPerMinute, "credential:"+principal.CredentialID()) {
		return false
	}
	return true
}

// toolState is the per-request admission verdict for one registered tool.
type toolState struct {
	definition ToolDefinition
	reason     string
}

// WritePhaseOpen reports the current write-phase switch. The transport
// includes it in the server-instance cache key so flipping the setting
// swaps the directory immediately, like a policy revision does.
func (s *Service) WritePhaseOpen() bool { return s.writePhase() }

// writePhase fails closed: an unwired callback keeps destructive and write
// effects unreachable regardless of policy state.
func (s *Service) writePhase() bool {
	if def := s.cfg.WritePhase; def != nil {
		return def()
	}
	return false
}

// admit applies the open policy, review fingerprint and phase gate. The
// authorizer runs separately so callers can decide between directory
// filtering and unified call semantics.
func (s *Service) admit(ctx context.Context, def ToolDefinition) (string, error) {
	// Destructive effects stay behind the phase gate regardless of the write
	// switch; opening them is a separate, explicit decision.
	if def.Effect == EffectDestructive || (def.Effect == EffectWrite && !s.writePhase()) {
		return "phase", ErrUnavailable("phase")
	}
	policy, err := s.cfg.Policies.Policy(ctx, KindTool, def.Name)
	if err != nil {
		return "policy", ErrInternal("policy lookup failed")
	}
	fingerprint, ok := s.cfg.Registry.Fingerprint(def.Name)
	if !ok {
		return "unknown", ErrUnavailable("unknown")
	}
	if !policy.Enabled {
		return "disabled", ErrUnavailable("disabled")
	}
	if policy.AcceptedFingerprint != fingerprint {
		return "unreviewed", ErrUnavailable("unreviewed")
	}
	return "", nil
}

// VisibleTools returns the capability projections the principal may discover:
// registered, enabled under the reviewed fingerprint, in the readable phase
// and fully authorized. Storage failures abort the listing; individual
// denials simply exclude the tool.
func (s *Service) VisibleTools(ctx context.Context, principal Principal) ([]ToolDefinition, error) {
	if s.cfg.Authorizer == nil {
		return nil, ErrInternal("authorizer unavailable")
	}
	visible := []ToolDefinition{}
	for _, def := range s.cfg.Registry.Tools() {
		if _, err := s.admit(ctx, def); err != nil {
			continue
		}
		if err := s.cfg.Authorizer.Authorize(ctx, principal, def.OperationIDs); err != nil {
			continue
		}
		visible = append(visible, def)
	}
	sort.Slice(visible, func(i, j int) bool { return visible[i].Name < visible[j].Name })
	return visible, nil
}

// CallStatus values persisted on call records.
const (
	StatusSucceeded    = "succeeded"
	StatusFailed       = "failed"
	StatusDenied       = "denied"
	StatusRateLimited  = "rate_limited"
	StatusCancelled    = "cancelled"
	StatusTimedOut     = "timed_out"
	StatusInternal     = "internal_error"
	StatusInputInvalid = "input_invalid"
)

// CallTool runs the read-only pipeline of section 9.1 and returns the
// structured business projection. The transport turns the outcome into
// protocol semantics per the pinned revision.
func (s *Service) CallTool(ctx context.Context, principal Principal, limits Limits, name, protocolVersion, clientName, clientVersion string, arguments json.RawMessage) (any, error) {
	if !limits.Valid() {
		return nil, ErrDisabled("service limits are not configured")
	}
	limiter := s.limiterFor(limits)
	// Rate windows and concurrency slots: every budget is per request, never
	// cached with the credential.
	if !limiter.allow(limits.UserCallsPerMinute, "user:"+principal.ActorID()) {
		return nil, ErrRateLimited("user rate budget exhausted")
	}
	if !limiter.allow(limits.CredentialCallsPerMinute, "credential:"+principal.CredentialID()) {
		return nil, ErrRateLimited("credential rate budget exhausted")
	}
	release, ok := limiter.slots(principal.ActorID(), principal.CredentialID())
	if !ok {
		return nil, ErrRateLimited("concurrency slots exhausted")
	}
	defer release()

	def, known := s.cfg.Registry.Lookup(name)
	if !known {
		return nil, ErrUnavailable("unknown")
	}
	if _, err := s.admit(ctx, def); err != nil {
		return nil, err
	}
	if err := s.cfg.Authorizer.Authorize(ctx, principal, def.OperationIDs); err != nil {
		// The entry point (mcp:access) stays a plain denial; per-tool
		// operation failures unify with unknown and disabled capabilities.
		if mcpErr, mcpOK := err.(*Error); mcpOK && mcpErr.Category == CatUnavailable {
			return nil, err
		}
		return nil, ErrUnavailable("denied")
	}
	if len(arguments) == 0 {
		arguments = json.RawMessage("{}")
	}
	if err := validateInstance(arguments, def.InputSchema); err != nil {
		return nil, ErrInput(err.Error())
	}

	requestID := s.cfg.NewIdentifier()
	start := CallStart{
		RequestID: requestID, ActorID: principal.ActorID(), CredentialID: principal.CredentialID(),
		RoleID: principal.RoleID(), AuthMethod: principal.AuthMethod(), Kind: KindTool, Name: def.Name,
		CapabilityVersion: def.Version, ProtocolVersion: protocolVersion,
		ClientName: truncate(clientName, 80), ClientVersion: truncate(clientVersion, 40),
		StartedAt: s.cfg.Clock.NowUnix(),
	}
	if revision, err := s.cfg.Policies.Revision(ctx); err == nil {
		start.PolicyRevision = revision
	}
	// A call without its start record must not run: the audit trail is a
	// precondition of execution, not a best-effort side effect.
	if err := s.cfg.Calls.Begin(ctx, start); err != nil {
		return nil, ErrInternal("call recording unavailable")
	}

	outcome := StatusSucceeded
	errorCode := ""
	result, err := s.execute(ctx, principal, limits, def, arguments)
	if err != nil {
		outcome, errorCode, err = classify(err)
	}
	finish := CallFinish{Status: outcome, ErrorCode: errorCode, FinishedAt: s.cfg.Clock.NowUnix()}
	finish.DurationMs = finish.FinishedAt - start.StartedAt
	// Closing the record must survive a cancelled request context: the call
	// already ran and the audit trail is the only trace. A failed close is a
	// bounded operational signal, never a reason to re-run business work.
	if finErr := s.cfg.Calls.Finish(context.WithoutCancel(ctx), requestID, finish); finErr != nil {
		_ = finErr
	}
	return result, err
}

func (s *Service) execute(ctx context.Context, principal Principal, limits Limits, def ToolDefinition, arguments json.RawMessage) (any, error) {
	if limits.TimeoutSeconds > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(limits.TimeoutSeconds)*time.Second)
		defer cancel()
	}
	output, err := def.Handler.Call(ctx, principal, arguments)
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(output)
	if err != nil {
		return nil, BusinessError("result_not_serializable", "tool result could not be encoded")
	}
	if len(data) > limits.MaxResultBytes {
		return nil, BusinessError("result_too_large", "tool result exceeds the configured size bound")
	}
	return json.RawMessage(data), nil
}

// classify maps execution outcomes onto record status and the external error
// the transport forwards. Unclassified module failures fail closed: the
// caller receives the generic internal error, logs keep the cause behind
// request ids.
func classify(err error) (status, code string, external error) {
	var mcpErr *Error
	if errors.As(err, &mcpErr) {
		switch mcpErr.Category {
		case CatBusiness:
			return StatusFailed, mcpErr.Code, mcpErr
		case CatInput:
			return StatusInputInvalid, mcpErr.Code, mcpErr
		case CatUnavailable:
			return StatusDenied, mcpErr.Code, mcpErr
		case CatRateLimited:
			return StatusRateLimited, mcpErr.Code, mcpErr
		default:
			return StatusInternal, mcpErr.Code, mcpErr
		}
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return StatusTimedOut, "timed_out", &Error{Category: CatInternal, Code: "timed_out", detail: "tool execution timed out"}
	}
	if errors.Is(err, context.Canceled) {
		return StatusCancelled, "cancelled", &Error{Category: CatInternal, Code: "cancelled", detail: "tool call was cancelled"}
	}
	return StatusInternal, string(CatInternal), ErrInternal("tool execution failed")
}

func truncate(value string, max int) string {
	if len(value) > max {
		return strings.TrimSpace(value[:max])
	}
	return value
}
