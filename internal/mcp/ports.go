// Author: yunnuo <ymz@ebox.vip>
// Description: Outward ports of the MCP core: operation lookup, open policies, call metadata and time.
package mcp

import "context"

// OperationInfo is the minimal contract-derived view the core needs to bound
// what may become a business capability. The platform adapter implements the
// resolver on top of the authoritative OpenAPI operation catalogue.
type OperationInfo struct {
	Grantable  bool
	SuperAdmin bool
	// Permissions and PermissionMode mirror the contract policy so the
	// authorizer can apply the same permission-point check as HTTP.
	Permissions    []string
	PermissionMode string
}

// OperationResolver looks one operation up by its contract identifier.
type OperationResolver interface {
	LookupOperation(id string) (OperationInfo, bool)
}

// OperationResolverFunc adapts a function to OperationResolver.
type OperationResolverFunc func(id string) (OperationInfo, bool)

func (f OperationResolverFunc) LookupOperation(id string) (OperationInfo, bool) { return f(id) }

// Authorizer decides whether an authenticated principal may use a capability
// at all: the mcp:access point plus every bound business operation. It runs
// per request on freshly resolved credentials; implementations must never
// honor super-admin short-circuits or cache conclusions across requests.
type Authorizer interface {
	Authorize(ctx context.Context, principal Principal, operationIDs []string) error
}

// Policy mirrors one row of the capability policy storage for a registered
// capability. A missing row is the zero value: never enabled, version 0.
type Policy struct {
	Kind                Kind
	Name                string
	Enabled             bool
	AcceptedFingerprint string
	// AcceptedVersion is the definition version the fingerprint was accepted
	// for; AcceptedFingerprint decides staleness, the field keeps the record
	// readable for administrators.
	AcceptedVersion string
	// Version is the CAS revision of the policy row itself.
	Version int
}

// PolicyStore reads open policies and the control revision. Writes belong to
// the admin service, which owns the transactional CAS anchor.
type PolicyStore interface {
	Policy(ctx context.Context, kind Kind, name string) (Policy, error)
	// Revision returns the current control revision; callers re-check it so
	// a stale allow cannot survive a committed policy change.
	Revision(ctx context.Context) (int64, error)
}

// CallStart is the content-free metadata persisted before a capability runs.
// Raw arguments, results and credentials never enter call records.
type CallStart struct {
	RequestID        string
	ActorID          string
	CredentialID     string
	RoleID           string
	AuthMethod       string
	Kind             Kind
	Name             string
	CapabilityVersion string
	PolicyRevision   int64
	ProtocolVersion  string
	ClientName       string
	ClientVersion    string
	StartedAt        int64
}

// CallFinish closes one call record with its classified outcome.
type CallFinish struct {
	Status     string
	ErrorCode  string
	DurationMs int64
	FinishedAt int64
}

// CallStore persists call metadata. A failed Begin must prevent execution;
// a failed Finish is a bounded operational error and never re-runs work.
type CallStore interface {
	Begin(ctx context.Context, start CallStart) error
	Finish(ctx context.Context, requestID string, finish CallFinish) error
}

// Clock returns the current UTC unix seconds; tests inject deterministic time.
type Clock interface {
	NowUnix() int64
}

// ClockFunc adapts a function to Clock.
type ClockFunc func() int64

func (f ClockFunc) NowUnix() int64 { return f() }
