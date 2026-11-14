// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-only /mcp protocol surface: PAT gate, origin policy, per-request authorization and SDK transport wiring.
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/platform/mcpauth"
	"github.com/yunnuo/unicore/internal/platform/mcpoauth"
	"github.com/yunnuo/unicore/internal/runtime"
)

// Surface owns the /mcp endpoint. The composition root builds one surface
// per web process; Standalone and desktop simply never pass the profile
// gate, so the route answers a plain 404 there.
type Surface struct {
	Install *install.Manager
	Logger  *slog.Logger
	Version string
	Service *mcp.Service
	// Registry exposes the frozen capability set to the admin surface; the
	// transport never mutates it after the composition root freezes it.
	Registry *mcp.Registry
	// OAuth serves the MCP authorization service; nil keeps every OAuth
	// endpoint answering 404 regardless of the runtime switch.
	OAuth *mcpoauth.Service

	handler *sdk.StreamableHTTPHandler
	mu      sync.Mutex
	cache   map[string]*sdk.Server
}

type principalKey struct{}
type limitsKey struct{}

// Mount attaches the surface to the router. A nil surface leaves /mcp
// unmounted; the router's not-found handler keeps answering a plain 404.
func Mount(router chi.Router, surface *Surface) {
	if surface == nil {
		return
	}
	surface.cache = map[string]*sdk.Server{}
	surface.handler = sdk.NewStreamableHTTPHandler(surface.server, &sdk.StreamableHTTPOptions{
		// The 2026-07-28 baseline runs per request: no long-lived protocol
		// session, every POST re-authenticates and re-authorizes.
		Stateless:           true,
		MaxRequestBodyBytes: 4 << 20,
		Logger:              surface.log(),
	})
	router.Handle("/mcp", surface)
	router.HandleFunc("/.well-known/oauth-protected-resource/mcp", surface.handleProtectedResourceMetadata)
	router.HandleFunc("/.well-known/oauth-authorization-server", surface.handleAuthorizationServerMetadata)
	router.HandleFunc("/oauth/mcp/authorize", surface.handleAuthorize)
	router.HandleFunc("/oauth/mcp/token", surface.handleToken)
	router.HandleFunc("/oauth/mcp/revoke", surface.handleRevoke)
}

func (s *Surface) log() *slog.Logger {
	if s.Logger != nil {
		return s.Logger
	}
	return slog.Default()
}

// ServeHTTP is the platform gate ahead of the SDK transport: profile,
// installation, runtime switch, browser origin, PAT-only authentication and
// the request body bound all resolve before any protocol handling.
func (s *Surface) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	_, settings, identity, profile := s.Install.Services()
	if profile != runtime.WebPlatform || identity == nil || !s.Install.Installed() {
		http.NotFound(w, r)
		return
	}
	values, err := settings.Raw(r.Context())
	if err != nil {
		http.Error(w, "storage unavailable", http.StatusServiceUnavailable)
		return
	}
	if values["mcp.enabled"] != "true" {
		w.Header().Set("Retry-After", "300")
		http.Error(w, "MCP service is disabled", http.StatusServiceUnavailable)
		return
	}
	limits, ok := limitsOf(values)
	if !ok {
		http.Error(w, "MCP service limits are misconfigured", http.StatusServiceUnavailable)
		return
	}
	if !s.originAllowed(r, values) {
		s.log().Info("mcp origin rejected", "event", "mcp.origin_denied", "origin", r.Header.Get("Origin"))
		http.Error(w, "origin not trusted", http.StatusForbidden)
		return
	}
	principal, err := s.authenticate(r, identity, values)
	if err != nil {
		w.Header().Set("WWW-Authenticate", `Bearer realm="unicore-mcp"`)
		http.Error(w, "valid access credential required", http.StatusUnauthorized)
		return
	}
	if !principal.HasPermission(mcpauth.MCPAccessPermission) {
		s.log().Info("mcp access denied", "event", "mcp.access_denied", "actor", principal.ActorID())
		http.Error(w, "mcp access not granted", http.StatusForbidden)
		return
	}
	// Directory queries rate-limit like calls; concurrency slots stay
	// reserved for executions.
	if !s.Service.AllowDirectory(r.Context(), principal, limits) {
		http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, int64(limits.MaxRequestBytes))
	if r.ContentLength > int64(limits.MaxRequestBytes) {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	r = r.WithContext(context.WithValue(r.Context(), principalKey{}, principal))
	r = r.WithContext(context.WithValue(r.Context(), limitsKey{}, limits))
	s.handler.ServeHTTP(w, r)
}

// authenticate resolves exactly one Bearer credential: PATs and OAuth access
// tokens, told apart by their stable prefixes. Client JWTs, repeated headers,
// empty values and any cookie fallback are refused: MCP accepts one
// credential per request.
func (s *Surface) authenticate(r *http.Request, identity *platform.Service, values map[string]string) (*mcpauth.Principal, error) {
	headers, ok := r.Header["Authorization"]
	if !ok || len(headers) != 1 {
		return nil, mcp.ErrAuth("exactly one Authorization header is required")
	}
	bearer, found := strings.CutPrefix(strings.TrimSpace(headers[0]), "Bearer ")
	if !found || strings.TrimSpace(bearer) == "" {
		return nil, mcp.ErrAuth("bearer credential required")
	}
	if _, err := r.Cookie(sessionCookieName); err == nil {
		// A cookie may ride along on a browser request; it never authenticates MCP.
		return nil, mcp.ErrAuth("cookie credentials are not accepted for MCP access")
	}
	if strings.HasPrefix(bearer, "ucm_") {
		// OAuth tokens answer to their own runtime switch.
		if s.OAuth == nil || values["mcp.oauth_enabled"] != "true" {
			return nil, mcp.ErrAuth("oauth access is unavailable")
		}
		grant, actor, err := s.OAuth.Resolve(r.Context(), bearer)
		if err != nil {
			return nil, mcp.ErrAuth("oauth credential rejected")
		}
		return mcpauth.NewOAuthPrincipal(actor.User, grant, grant.ID, identity.Store)
	}
	resolved, err := identity.Tokens.Resolve(r.Context(), bearer)
	if err != nil {
		return nil, mcp.ErrAuth("credential rejected")
	}
	return mcpauth.NewPrincipal(resolved, identity.Store)
}

// sessionCookieName mirrors the browser session cookie name; the value is
// never read, only its presence is refused as an MCP credential.
const sessionCookieName = "unicore_session"

// originAllowed enforces the browser boundary: requests without Origin are
// protocol clients and proceed to authentication; a present Origin must hit
// the same-origin base_url or the registered allow-list exactly.
func (s *Surface) originAllowed(r *http.Request, values map[string]string) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" || parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") {
		return false
	}
	if base := values["site.base_url"]; base != "" {
		if u, err := url.Parse(base); err == nil && parsed.Scheme == u.Scheme && parsed.Host == u.Host {
			return true
		}
	}
	for _, candidate := range strings.FieldsFunc(values["mcp.allowed_origins"], func(char rune) bool { return char == ' ' || char == ',' || char == '\t' }) {
		if candidate != "" && strings.EqualFold(candidate, origin) {
			return true
		}
	}
	return false
}

// limitsOf reads the runtime bounds from the settings projection; a corrupt
// value fails closed instead of widening the bounds.
func limitsOf(values map[string]string) (mcp.Limits, bool) {
	number := func(key string, fallback int) int {
		parsed, err := strconv.Atoi(values[key])
		if err != nil {
			return fallback
		}
		return parsed
	}
	limits := mcp.Limits{
		TimeoutSeconds:           number("mcp.default_timeout_seconds", 30),
		MaxRequestBytes:          number("mcp.max_request_bytes", 1048576),
		MaxResultBytes:           number("mcp.max_result_bytes", 262144),
		GlobalConcurrency:        number("mcp.global_concurrency", 64),
		UserConcurrency:          number("mcp.user_concurrency", 4),
		CredentialConcurrency:    number("mcp.credential_concurrency", 2),
		UserCallsPerMinute:       number("mcp.user_calls_per_minute", 120),
		CredentialCallsPerMinute: number("mcp.credential_calls_per_minute", 60),
	}
	if !limits.Valid() {
		return mcp.Limits{}, false
	}
	return limits, true
}

// server returns the SDK server for one request: tools are filtered by the
// caller's fresh authorization, the open policies and the served language.
// Instances are cached per (principal authorization version, policy
// revision, language, limits); permission or policy changes therefore start
// a new server instead of leaking an old directory.
func (s *Surface) server(r *http.Request) *sdk.Server {
	principal, _ := r.Context().Value(principalKey{}).(*mcpauth.Principal)
	limits, _ := r.Context().Value(limitsKey{}).(mcp.Limits)
	if principal == nil {
		// The gate always installs a principal; an empty server fails closed.
		return sdk.NewServer(&sdk.Implementation{Name: "unicore", Version: s.Version}, nil)
	}
	language := languageOf(r.Header.Get("Accept-Language"))
	revision := int64(0)
	if store, _, _, profile := s.Install.Services(); store != nil && profile == runtime.WebPlatform {
		if value, err := (&platformsql.Repository{Store: store}).MCPControlRevision(r.Context()); err == nil {
			revision = value
		}
	}
	key := fmt.Sprintf("%s|%d|%t|%s|%d-%d-%d-%d-%d-%d-%d-%d", principal.AuthVersion(), revision, s.Service.WritePhaseOpen(), language,
		limits.TimeoutSeconds, limits.MaxRequestBytes, limits.MaxResultBytes, limits.GlobalConcurrency,
		limits.UserConcurrency, limits.CredentialConcurrency, limits.UserCallsPerMinute, limits.CredentialCallsPerMinute)
	s.mu.Lock()
	if cached, ok := s.cache[key]; ok {
		s.mu.Unlock()
		return cached
	}
	s.mu.Unlock()
	server := sdk.NewServer(&sdk.Implementation{Name: "unicore", Version: s.Version}, &sdk.ServerOptions{
		Capabilities: &sdk.ServerCapabilities{Tools: &sdk.ToolCapabilities{ListChanged: false}},
	})
	for _, def := range s.visibleTools(r, principal) {
		s.addTool(server, principal, limits, def, language)
	}
	s.mu.Lock()
	if len(s.cache) >= 64 {
		s.cache = map[string]*sdk.Server{}
	}
	s.cache[key] = server
	s.mu.Unlock()
	return server
}

// visibleTools tolerates storage failures by serving an empty directory:
// fail-closed beats failing open when policies cannot be read.
func (s *Surface) visibleTools(r *http.Request, principal *mcpauth.Principal) []mcp.ToolDefinition {
	tools, err := s.Service.VisibleTools(r.Context(), principal)
	if err != nil {
		s.log().Warn("mcp directory unavailable", "event", "mcp.directory_failed", "error", err.Error())
		return nil
	}
	return tools
}

// addTool projects one core definition onto the SDK server. The raw handler
// form keeps validation and result shaping inside the core pipeline instead
// of delegating it to schema inference.
func (s *Surface) addTool(server *sdk.Server, principal *mcpauth.Principal, limits mcp.Limits, def mcp.ToolDefinition, language string) {
	var inputSchema map[string]any
	if err := json.Unmarshal(def.InputSchema, &inputSchema); err != nil {
		s.log().Error("mcp tool schema invalid", "event", "mcp.tool_schema_invalid", "tool", def.Name)
		return
	}
	tool := &sdk.Tool{
		Name:        def.Name,
		Title:       pickLanguage(def.TitleZh, def.TitleEn, language),
		Description: pickLanguage(def.DescriptionZh, def.DescriptionEn, language),
		InputSchema: inputSchema,
		Annotations: &sdk.ToolAnnotations{ReadOnlyHint: true, DestructiveHint: boolPtr(false)},
	}
	if len(def.OutputSchema) > 0 {
		var outputSchema map[string]any
		if err := json.Unmarshal(def.OutputSchema, &outputSchema); err == nil {
			tool.OutputSchema = outputSchema
		}
	}
	server.AddTool(tool, func(ctx context.Context, request *sdk.CallToolRequest) (*sdk.CallToolResult, error) {
		arguments := request.Params.Arguments
		if len(arguments) == 0 {
			arguments = json.RawMessage("{}")
		}
		// Cached servers are shared by every caller with the same
		// authorization version, so identity always comes from the request
		// context — never from the principal the server was built with.
		actor, ok := ctx.Value(principalKey{}).(*mcpauth.Principal)
		if !ok || actor == nil {
			return nil, s.protocolError(mcp.ErrInternal("principal unavailable"))
		}
		// OAuth tokens additionally need the mcp.write transport budget for
		// write effects; PAT principals carry no budget and ride the phase
		// switch plus the regular authorization chain.
		if def.Effect != mcp.EffectRead {
			if budgets := actor.Scopes(); budgets != nil && !mcpauth.ScopesAllowWrite(budgets) {
				return nil, s.protocolError(mcp.ErrUnavailable("denied"))
			}
		}
		name, version := clientIdentity(request)
		result, err := s.Service.CallTool(ctx, actor, limits, def.Name, request.ProtocolVersion(),
			name, version, arguments)
		if err != nil {
			// Business and input outcomes are tool results, not protocol
			// failures: agents read the stable code and react (retry, re-read)
			// the way the web surface does.
			var mcpErr *mcp.Error
			if errors.As(err, &mcpErr) && (mcpErr.Category == mcp.CatBusiness || mcpErr.Category == mcp.CatInput) {
				return &sdk.CallToolResult{Content: []sdk.Content{&sdk.TextContent{Text: mcpErr.Code}}, IsError: true}, nil
			}
			return nil, s.protocolError(err)
		}
		payload, marshalErr := json.Marshal(result)
		if marshalErr != nil {
			return nil, errors.New("internal error")
		}
		return &sdk.CallToolResult{
			Content:           []sdk.Content{&sdk.TextContent{Text: string(payload)}},
			StructuredContent: json.RawMessage(payload),
		}, nil
	})
}

func clientIdentity(request *sdk.CallToolRequest) (name, version string) {
	if info := request.ClientInfo(); info != nil {
		return info.Name, info.Version
	}
	return "", ""
}

// protocolError maps core errors onto protocol-visible failures. Business
// and input errors never reach this path with raw content; the unified
// capability semantic hides unknown, disabled and denied from probing.
func (s *Surface) protocolError(err error) error {
	var mcpErr *mcp.Error
	if !errors.As(err, &mcpErr) {
		return errors.New("internal error")
	}
	switch mcpErr.Category {
	case mcp.CatRateLimited:
		return errors.New("rate limit exceeded, retry later")
	case mcp.CatInternal:
		if mcpErr.Code == "timed_out" {
			return errors.New("tool execution timed out")
		}
		if mcpErr.Code == "cancelled" {
			return errors.New("tool call was cancelled")
		}
		return errors.New("internal error")
	default:
		return errors.New("capability unavailable")
	}
}

func boolPtr(value bool) *bool { return &value }

// languageOf resolves the served copy language from the Accept-Language
// header; Chinese preferences win, everything else receives English.
func languageOf(header string) string {
	for _, part := range strings.Split(header, ",") {
		tag := strings.ToLower(strings.TrimSpace(strings.SplitN(part, ";", 2)[0]))
		if strings.HasPrefix(tag, "zh") {
			return "zh"
		}
		if strings.HasPrefix(tag, "en") {
			return "en"
		}
	}
	return "en"
}

func pickLanguage(zh, en, language string) string {
	if language == "zh" {
		return zh
	}
	return en
}
