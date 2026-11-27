// Author: yunnuo <ymz@ebox.vip>
// Description: AI-management endpoints: super-only MCP config, tool policy governance with CAS and call records.
package httpadapter

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/settings"
)

// mcpProtocols mirrors what the transport actually negotiates: the go-sdk's
// supported revisions, newest first, so old clients see their own version.
var mcpProtocols = sdk.SupportedProtocolVersions()

func mountMCP(api chi.Router, config Config) {
	mountMcpOauth(api, config)
	mountMcpOauthAdmin(api, config)
	// adminContext resolves the platform store and effective settings once;
	// every MCP management route is web-platform-only by contract.
	adminContext := func(permission string, fn func(http.ResponseWriter, *http.Request, *platformsql.Repository, map[string]string, contracts.Session)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			store, settingsService, _, profile := config.Install.Services()
			if profile != runtime.WebPlatform || store == nil || settingsService == nil {
				failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供该能力")
				return
			}
			session, ok := require(config.Install, w, r, permission)
			if !ok {
				return
			}
			values, err := settingsService.Values(r.Context())
			if err != nil {
				failure(w, 503, "NOT_READY", "存储尚未就绪")
				return
			}
			fn(w, r, &platformsql.Repository{Store: store}, values, session)
		}
	}
	registry := func() *mcp.Registry {
		if config.MCP == nil {
			return mcp.NewRegistry()
		}
		return config.MCP.Registry
	}

	api.Get("/admin/mcp/config", adminContext("mcp:read", func(w http.ResponseWriter, r *http.Request, repo *platformsql.Repository, values map[string]string, _ contracts.Session) {
		config_, err := mcpConfigView(r.Context(), repo, values)
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		success(w, config_)
	}))
	api.Patch("/admin/mcp/config", adminContext("mcp:write", func(w http.ResponseWriter, r *http.Request, repo *platformsql.Repository, values map[string]string, session contracts.Session) {
		var input contracts.McpConfigPatch
		if !decode(w, r, &input) {
			return
		}
		changes := map[string]string{}
		if !applyMCPConfigChanges(&input, changes) {
			failure(w, 400, "INVALID_INPUT", "配置值超出允许范围")
			return
		}
		if _, err := repo.UpdateMCPConfig(r.Context(), int64(input.ExpectedRevision), changes, session.User.ID); err != nil {
			if errors.Is(err, platformsql.ErrMCPConflict) {
				failure(w, 409, "MCP_CONFLICT", "配置已被其他管理员修改，请刷新后重试")
				return
			}
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		// Re-read through the settings service so the response reflects the
		// committed projection, not the request payload.
		_, settingsService, _, _ := config.Install.Services()
		fresh, err := settingsService.Values(r.Context())
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		config_, err := mcpConfigView(r.Context(), repo, fresh)
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		success(w, config_)
	}))
	api.Get("/admin/mcp/tools", adminContext("mcp:read", func(w http.ResponseWriter, r *http.Request, repo *platformsql.Repository, _ map[string]string, _ contracts.Session) {
		policies, err := repo.MCPPolicies(r.Context())
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		tools := mcpGovernedTools(registry(), policies)
		tools = filterMCPTools(tools, r)
		total := len(tools)
		page, size := pageOf(r, 50)
		tools = slicePage(tools, page, size)
		success(w, contracts.McpToolList{Items: tools, Total: total})
	}))
	api.Get("/admin/mcp/tools/{name}", adminContext("mcp:read", func(w http.ResponseWriter, r *http.Request, repo *platformsql.Repository, _ map[string]string, _ contracts.Session) {
		name := chi.URLParam(r, "name")
		policy, err := repo.MCPPolicy(r.Context(), mcp.KindTool, name)
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		tool, ok := mcpGovernedTool(registry(), policy, name)
		if !ok {
			failure(w, 404, "NOT_FOUND", "能力不存在")
			return
		}
		success(w, tool)
	}))
	api.Patch("/admin/mcp/tools/{name}/policy", adminContext("mcp:write", func(w http.ResponseWriter, r *http.Request, repo *platformsql.Repository, _ map[string]string, session contracts.Session) {
		name := chi.URLParam(r, "name")
		definition, known := registry().Lookup(name)
		if !known {
			failure(w, 404, "NOT_FOUND", "能力不存在或模块未装配")
			return
		}
		var input contracts.McpPolicyPatch
		if !decode(w, r, &input) {
			return
		}
		fingerprint, _ := registry().Fingerprint(name)
		if input.ExpectedFingerprint != fingerprint {
			failure(w, 409, "MCP_CONFLICT", "能力定义已更新，请刷新后重新审查")
			return
		}
		current, err := repo.MCPPolicy(r.Context(), mcp.KindTool, name)
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		if current.Version != input.ExpectedVersion {
			failure(w, 409, "MCP_CONFLICT", "策略已被其他管理员修改，请刷新后重试")
			return
		}
		next, err := repo.UpdateMCPPolicy(r.Context(), mcp.Policy{Kind: mcp.KindTool, Name: name, Enabled: input.Enabled, AcceptedFingerprint: input.ExpectedFingerprint, AcceptedVersion: definition.Version, Version: input.ExpectedVersion}, fingerprint, session.User.ID)
		if err != nil {
			if errors.Is(err, platformsql.ErrMCPConflict) {
				failure(w, 409, "MCP_CONFLICT", "策略已被其他管理员修改，请刷新后重试")
				return
			}
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		success(w, mcpToolView(definition, next, fingerprint, "open"))
	}))
	api.Get("/admin/mcp/calls", adminContext("mcp:logs:read", func(w http.ResponseWriter, r *http.Request, repo *platformsql.Repository, _ map[string]string, _ contracts.Session) {
		filter := platformsql.MCPCallFilter{
			ActorID: queryLimit(r, "actor_id", 64), Name: queryLimit(r, "name", 128), Status: queryLimit(r, "status", 16),
		}
		if value, err := strconv.ParseInt(r.URL.Query().Get("started_after"), 10, 64); err == nil && value > 0 {
			filter.StartedAfter = value
		}
		if value, err := strconv.ParseInt(r.URL.Query().Get("started_before"), 10, 64); err == nil && value > 0 {
			filter.StartedBefore = value
		}
		page, size := pageOf(r, 50)
		filter.Page, filter.PageSize = page, size
		records, total, err := repo.ListMCPCalls(r.Context(), filter)
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		items := make([]contracts.McpCall, 0, len(records))
		for _, record := range records {
			items = append(items, mcpCallView(record))
		}
		success(w, contracts.McpCallList{Items: items, Total: total, Page: page, PageSize: size})
	}))
	api.Get("/admin/mcp/calls/{id}", adminContext("mcp:logs:read", func(w http.ResponseWriter, r *http.Request, repo *platformsql.Repository, _ map[string]string, _ contracts.Session) {
		record, err := repo.GetMCPCall(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			failure(w, 404, "NOT_FOUND", "调用记录不存在")
			return
		}
		success(w, mcpCallView(record))
	}))

	// Personal access hint: any signed-in platform user may read whether the
	// MCP surface is enabled and whether they hold the access point.
	api.Get("/account/mcp/access-info", func(w http.ResponseWriter, r *http.Request) {
		_, settingsService, _, profile := config.Install.Services()
		if profile != runtime.WebPlatform || settingsService == nil {
			failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供该能力")
			return
		}
		session, ok := require(config.Install, w, r, "")
		if !ok {
			return
		}
		values, err := settingsService.Values(r.Context())
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		success(w, contracts.McpAccessInfo{
			Enabled:            values["mcp.enabled"] == "true",
			Endpoint:           strings.TrimRight(settings.MailBaseURL(values, ""), "/") + "/mcp",
			SupportedProtocols: mcpProtocols,
			AccessGranted:      platform.Has(session.User, "mcp:access"),
		})
	})
}

// mcpConfigView projects the effective runtime configuration without any
// credential material; the endpoint derives from the trusted base_url only.
func mcpConfigView(ctx context.Context, repo *platformsql.Repository, values map[string]string) (contracts.McpConfig, error) {
	revision, err := repo.MCPControlRevision(ctx)
	if err != nil {
		return contracts.McpConfig{}, err
	}
	return contracts.McpConfig{
		Revision:                int(revision),
		Enabled:                 values["mcp.enabled"] == "true",
		PatEnabled:              values["mcp.pat_enabled"] == "true",
		OauthEnabled:            values["mcp.oauth_enabled"] == "true",
		WriteEnabled:            values["mcp.write_enabled"] == "true",
		Endpoint:                strings.TrimRight(settings.MailBaseURL(values, ""), "/") + "/mcp",
		SupportedProtocols:      mcpProtocols,
		ImplementedCapabilities: []string{"tools"},
		Limits: contracts.McpLimits{
			DefaultTimeoutSeconds:    atoiDefault(values["mcp.default_timeout_seconds"], 30),
			MaxRequestBytes:          atoiDefault(values["mcp.max_request_bytes"], 1048576),
			MaxResultBytes:           atoiDefault(values["mcp.max_result_bytes"], 262144),
			GlobalConcurrency:        atoiDefault(values["mcp.global_concurrency"], 64),
			UserConcurrency:          atoiDefault(values["mcp.user_concurrency"], 4),
			CredentialConcurrency:    atoiDefault(values["mcp.credential_concurrency"], 2),
			UserCallsPerMinute:       atoiDefault(values["mcp.user_calls_per_minute"], 120),
			CredentialCallsPerMinute: atoiDefault(values["mcp.credential_calls_per_minute"], 60),
			LogRetentionDays:         atoiDefault(values["mcp.log_retention_days"], 30),
		},
		AllowedOrigins: values["mcp.allowed_origins"],
	}, nil
}

// applyMCPConfigChanges maps optional patch fields onto setting values and
// revalidates each against the registered definition. Unknown keys cannot
// appear (generated DTO), invalid values refuse the whole patch.
func applyMCPConfigChanges(input *contracts.McpConfigPatch, changes map[string]string) bool {
	assignInt := func(key string, value *int) bool {
		if value == nil {
			return true
		}
		definition := settingsDefinition(key)
		if definition == nil || !definition.Validate(strconv.Itoa(*value)) {
			return false
		}
		changes[key] = strconv.Itoa(*value)
		return true
	}
	assignBool := func(key string, value *bool) bool {
		if value == nil {
			return true
		}
		changes[key] = strconv.FormatBool(*value)
		return true
	}
	if !assignBool("mcp.enabled", input.Enabled) || !assignBool("mcp.pat_enabled", input.PatEnabled) || !assignBool("mcp.oauth_enabled", input.OauthEnabled) || !assignBool("mcp.write_enabled", input.WriteEnabled) {
		return false
	}
	if !assignInt("mcp.default_timeout_seconds", input.DefaultTimeoutSeconds) ||
		!assignInt("mcp.max_request_bytes", input.MaxRequestBytes) ||
		!assignInt("mcp.max_result_bytes", input.MaxResultBytes) ||
		!assignInt("mcp.global_concurrency", input.GlobalConcurrency) ||
		!assignInt("mcp.user_concurrency", input.UserConcurrency) ||
		!assignInt("mcp.credential_concurrency", input.CredentialConcurrency) ||
		!assignInt("mcp.user_calls_per_minute", input.UserCallsPerMinute) ||
		!assignInt("mcp.credential_calls_per_minute", input.CredentialCallsPerMinute) ||
		!assignInt("mcp.log_retention_days", input.LogRetentionDays) {
		return false
	}
	if input.AllowedOrigins != nil {
		definition := settingsDefinition("mcp.allowed_origins")
		if definition == nil || !definition.Validate(*input.AllowedOrigins) {
			return false
		}
		changes["mcp.allowed_origins"] = *input.AllowedOrigins
	}
	return len(changes) > 0
}

func settingsDefinition(key string) *settings.SettingDefinition {
	for index := range settings.Definitions {
		if settings.Definitions[index].Key == key {
			return &settings.Definitions[index]
		}
	}
	return nil
}

// mcpGovernedTools merges the frozen registry with stored policies; policy
// rows without a live definition surface as module_missing entries.
func mcpGovernedTools(registry *mcp.Registry, policies []mcp.Policy) []contracts.McpTool {
	items := []contracts.McpTool{}
	seen := map[string]bool{}
	for _, def := range registry.Tools() {
		fingerprint, _ := registry.Fingerprint(def.Name)
		policy := mcp.Policy{Kind: mcp.KindTool, Name: def.Name}
		for _, candidate := range policies {
			if candidate.Kind == mcp.KindTool && candidate.Name == def.Name {
				policy = candidate
				break
			}
		}
		items = append(items, mcpToolView(def, policy, fingerprint, mcpToolState(def, policy, fingerprint, registry)))
		seen[def.Name] = true
	}
	for _, policy := range policies {
		if policy.Kind != mcp.KindTool || seen[policy.Name] {
			continue
		}
		module, _, _ := strings.Cut(policy.Name, ".")
		items = append(items, contracts.McpTool{
			Name: policy.Name, Module: module, State: "module_missing",
			Fingerprint: policy.AcceptedFingerprint,
			Policy:      mcpPolicyView(policy),
		})
	}
	return items
}

// filterMCPTools applies the query filters; the items arrive sorted by name.
func filterMCPTools(items []contracts.McpTool, r *http.Request) []contracts.McpTool {
	module := queryLimit(r, "module", 64)
	search := strings.ToLower(queryLimit(r, "search", 96))
	state := queryLimit(r, "state", 32)
	if module == "" && search == "" && state == "" {
		return items
	}
	filtered := make([]contracts.McpTool, 0, len(items))
	for _, item := range items {
		if module != "" && item.Module != module {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(item.Name), search) {
			continue
		}
		if state != "" && item.State != state {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func mcpGovernedTool(registry *mcp.Registry, policy mcp.Policy, name string) (contracts.McpTool, bool) {
	if def, known := registry.Lookup(name); known {
		fingerprint, _ := registry.Fingerprint(name)
		return mcpToolView(def, policy, fingerprint, mcpToolState(def, policy, fingerprint, registry)), true
	}
	if policy.Version == 0 {
		return contracts.McpTool{}, false
	}
	module, _, _ := strings.Cut(name, ".")
	return contracts.McpTool{Name: name, Module: module, State: "module_missing", Fingerprint: policy.AcceptedFingerprint, Policy: mcpPolicyView(policy)}, true
}

// mcpToolState derives the admin-facing policy state; write effects keep
// their state but stay externally closed in P1 (the phase gate).
func mcpToolState(def mcp.ToolDefinition, policy mcp.Policy, fingerprint string, registry *mcp.Registry) string {
	if _, known := registry.Lookup(def.Name); !known {
		return "module_missing"
	}
	if policy.Version == 0 {
		return "unreviewed"
	}
	if policy.AcceptedFingerprint != fingerprint {
		return "needs_review"
	}
	if policy.Enabled {
		return "open"
	}
	return "disabled"
}

func mcpPolicyView(policy mcp.Policy) contracts.McpPolicy {
	return contracts.McpPolicy{Enabled: policy.Enabled, AcceptedFingerprint: policy.AcceptedFingerprint, AcceptedVersion: policy.AcceptedVersion, Version: policy.Version}
}

func mcpToolView(def mcp.ToolDefinition, policy mcp.Policy, fingerprint, state string) contracts.McpTool {
	operations := append([]string(nil), def.OperationIDs...)
	return contracts.McpTool{
		Name: def.Name, Module: def.Module, Version: def.Version, ImplVersion: def.ImplVersion,
		TitleZh: def.TitleZh, TitleEn: def.TitleEn, DescriptionZh: def.DescriptionZh, DescriptionEn: def.DescriptionEn,
		OperationIds: operations, Effect: string(def.Effect), Confirmation: string(def.Confirmation),
		Fingerprint: fingerprint, Policy: mcpPolicyView(policy), State: state,
	}
}

func mcpCallView(record platformsql.MCPCallRecord) contracts.McpCall {
	return contracts.McpCall{
		RequestID: record.Start.RequestID, StartedAt: int(record.Start.StartedAt), FinishedAt: int(record.Finish.FinishedAt),
		DurationMs: int(record.Finish.DurationMs), Status: record.Finish.Status, ErrorCode: record.Finish.ErrorCode,
		ActorID: record.Start.ActorID, ActorName: record.ActorName, CredentialName: record.CredentialName,
		CredentialDeleted: record.CredentialDeleted, RoleID: record.Start.RoleID, AuthMethod: record.Start.AuthMethod,
		Kind: string(record.Start.Kind), Name: record.Start.Name, CapabilityVersion: record.Start.CapabilityVersion,
		PolicyRevision: int(record.Start.PolicyRevision), ProtocolVersion: record.Start.ProtocolVersion,
		ClientName: record.Start.ClientName, ClientVersion: record.Start.ClientVersion,
	}
}

func atoiDefault(value string, fallback int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func queryLimit(r *http.Request, key string, max int) string {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if len([]rune(value)) > max {
		return ""
	}
	return value
}

func pageOf(r *http.Request, defaultSize int) (int, int) {
	page, size := 1, defaultSize
	if value, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && value >= 1 {
		page = value
	}
	if value, err := strconv.Atoi(r.URL.Query().Get("page_size")); err == nil && value >= 1 && value <= 100 {
		size = value
	}
	return page, size
}

func slicePage(items []contracts.McpTool, page, size int) []contracts.McpTool {
	start := (page - 1) * size
	if start >= len(items) {
		return []contracts.McpTool{}
	}
	end := start + size
	if end > len(items) {
		end = len(items)
	}
	return items[start:end]
}
