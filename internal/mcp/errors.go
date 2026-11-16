// Author: yunnuo <ymz@ebox.vip>
// Description: Classified MCP core errors: the transport maps categories to protocol semantics, logs keep stable codes.
package mcp

import "fmt"

// Category is the internal error classification of section 9.2 of the MCP
// design. The transport adapter maps a category onto the HTTP status or
// JSON-RPC error of the pinned protocol revision; internal records keep Code.
type Category string

const (
	CatAuth        Category = "auth_invalid"         // missing, invalid, expired or revoked credential
	CatOrigin      Category = "origin_denied"        // browser origin failed the trusted list
	CatForbidden   Category = "access_denied"        // mcp:access or business operation grant missing
	CatDisabled    Category = "service_disabled"     // runtime switch off or phase not delivered
	CatProtocol    Category = "protocol_invalid"     // malformed protocol message, method or version
	CatInput       Category = "input_invalid"        // arguments rejected before the handler runs
	CatUnavailable Category = "capability_unavailable" // unified external semantics for unknown, unreviewed, disabled or denied capabilities
	CatBusiness    Category = "business_error"       // tool execution failed with a stable business code
	CatRateLimited Category = "rate_limited"         // concurrency or rate budget exhausted
	CatInternal    Category = "internal_error"       // storage or service fault, never leaks internals
)

// Error is the only error type the core returns. Plain errors from tool
// handlers are wrapped as CatInternal by the service, so unclassified module
// failures fail closed instead of leaking internals to clients.
type Error struct {
	Category Category
	// Code is the stable classification recorded in call metadata and admin
	// views. Business errors carry the module's own code (for example
	// "notes_invalid"); other categories use the category constant.
	Code string
	// detail stays internal: logs may print it, clients never receive it.
	detail string
}

func (e *Error) Error() string {
	if e.detail == "" {
		return string(e.Category)
	}
	return fmt.Sprintf("%s: %s", e.Category, e.detail)
}

// Detail returns the internal detail for logging; it is not client-facing.
func (e *Error) Detail() string { return e.detail }

func newError(category Category, code, detail string) *Error {
	return &Error{Category: category, Code: code, detail: detail}
}

// Core errors for control flow inside the service; the transport maps them.
func ErrAuth(detail string) *Error       { return newError(CatAuth, string(CatAuth), detail) }
func ErrOrigin(detail string) *Error     { return newError(CatOrigin, string(CatOrigin), detail) }
func ErrForbidden(detail string) *Error  { return newError(CatForbidden, string(CatForbidden), detail) }
func ErrDisabled(detail string) *Error   { return newError(CatDisabled, string(CatDisabled), detail) }
func ErrProtocol(detail string) *Error   { return newError(CatProtocol, string(CatProtocol), detail) }
func ErrInput(detail string) *Error      { return newError(CatInput, string(CatInput), detail) }
func ErrRateLimited(detail string) *Error { return newError(CatRateLimited, string(CatRateLimited), detail) }
func ErrInternal(detail string) *Error   { return newError(CatInternal, string(CatInternal), detail) }

// ErrUnavailable reports the unified "capability unavailable" semantics. The
// reason distinguishes unknown, unreviewed, disabled and denied inside logs
// only; every reason produces the identical external protocol error.
func ErrUnavailable(reason string) *Error {
	return newError(CatUnavailable, string(CatUnavailable), reason)
}

// BusinessError wraps a module failure with its stable business code. The
// transport turns it into a tool execution error; the detail never carries
// raw arguments or results.
func BusinessError(code, detail string) *Error {
	return newError(CatBusiness, code, detail)
}
