// Author: yunnuo <ymz@ebox.vip>
// Description: Personal MCP OAuth consent endpoints: describe the authorization request, consent with one role, list and revoke own grants.
package httpadapter

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/platform/mcpoauth"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/settings"
)

// oauthConsentLimiter bounds authorization attempts per account; the token
// endpoint's one-time codes make brute force pointless, this keeps the
// consent write path from being hammered.
var oauthConsentLimiter = platform.NewLimiter()

// mountMcpOauth attaches the personal consent endpoints. They are
// session-scoped like the personal center: no permission point beyond a
// signed-in platform account, CSRF on every write.
func mountMcpOauth(api chi.Router, config Config) {
	oauthContext := func(w http.ResponseWriter, r *http.Request) (*mcpoauth.Service, map[string]string, bool) {
		_, settingsService, _, profile := config.Install.Services()
		if profile != runtime.WebPlatform || settingsService == nil || !config.Install.Installed() {
			failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供该能力")
			return nil, nil, false
		}
		if config.MCP == nil || config.MCP.OAuth == nil {
			failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供该能力")
			return nil, nil, false
		}
		values, err := settingsService.Raw(r.Context())
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return nil, nil, false
		}
		if values["mcp.enabled"] != "true" || values["mcp.oauth_enabled"] != "true" {
			failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供该能力")
			return nil, nil, false
		}
		return config.MCP.OAuth, values, true
	}

	// oauthRequest reconciles one authorize request against the registry:
	// exact redirect match, canonical resource and the grantable scope set.
	oauthRequest := func(w http.ResponseWriter, r *http.Request, service *mcpoauth.Service, values map[string]string, clientID, redirectURI, scope, resource string) (mcpoauth.Client, []string, bool) {
		client, err := service.Store.Client(r.Context(), clientID)
		if err != nil || !client.Enabled {
			failure(w, 404, "NOT_FOUND", "OAuth 客户端不存在或已停用")
			return client, nil, false
		}
		matched := false
		for _, registered := range client.RedirectURIs {
			if registered == redirectURI {
				matched = true
				break
			}
		}
		if !matched {
			failure(w, 400, "INVALID_INPUT", "回调地址不在客户端注册列表内")
			return client, nil, false
		}
		canonical := mcpoauth.CanonicalResource(strings.TrimRight(settings.MailBaseURL(values, ""), "/"))
		if resource != "" && resource != canonical {
			failure(w, 400, "INVALID_INPUT", "资源标识与本实例不符")
			return client, nil, false
		}
		scopes, err := mcpoauth.NormalizeScopes(strings.Fields(scope))
		if err != nil {
			failure(w, 400, "INVALID_INPUT", "请求的 scope 不在可授权范围内")
			return client, nil, false
		}
		// The write scope rides its own runtime switch: a closed phase never
		// consents to it regardless of the client registration.
		if mcpoauth.ScopesContainWrite(scopes) && values["mcp.write_enabled"] != "true" {
			failure(w, 400, "INVALID_INPUT", "请求的 scope 不在可授权范围内")
			return client, nil, false
		}
		return client, scopes, true
	}

	// heldRoles projects the session account's roles as consent options.
	heldRoles := func(session contracts.Session) []contracts.RoleOption {
		options := []contracts.RoleOption{}
		for index, id := range session.User.Roles {
			name := id
			if session.User.RoleNames != nil && index < len(*session.User.RoleNames) {
				name = (*session.User.RoleNames)[index]
			}
			options = append(options, contracts.RoleOption{ID: id, Name: name, Assignable: true})
		}
		return options
	}

	api.Get("/account/mcp/oauth/authorize", func(w http.ResponseWriter, r *http.Request) {
		service, values, ok := oauthContext(w, r)
		if !ok {
			return
		}
		session, ok := require(config.Install, w, r, "")
		if !ok {
			return
		}
		scope := queryLimit(r, "scope", 200)
		client, scopes, ok := oauthRequest(w, r, service, values, queryLimit(r, "client_id", 64), r.URL.Query().Get("redirect_uri"), scope, queryLimit(r, "resource", 2048))
		if !ok {
			return
		}
		success(w, contracts.McpOauthAuthorizeView{
			ClientID:   client.ID,
			ClientName: client.Name,
			Scopes:     scopes,
			Roles:      heldRoles(session),
			Resource:   mcpoauth.CanonicalResource(strings.TrimRight(settings.MailBaseURL(values, ""), "/")),
			State:      stateOf(r),
		})
	})

	api.Post("/account/mcp/oauth/authorize", func(w http.ResponseWriter, r *http.Request) {
		service, values, ok := oauthContext(w, r)
		if !ok {
			return
		}
		session, ok := require(config.Install, w, r, "")
		if !ok {
			return
		}
		if !oauthConsentLimiter.Allow("mcp-oauth-consent:"+session.User.ID, 20, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		var input contracts.McpOauthConsentInput
		if !decode(w, r, &input) {
			return
		}
		scope, challenge, method, resource := deref(input.Scope), deref(input.CodeChallenge), deref(input.CodeChallengeMethod), deref(input.Resource)
		_, scopes, ok := oauthRequest(w, r, service, values, input.ClientID, input.RedirectUri, scope, resource)
		if !ok {
			return
		}
		if method != "" && method != "S256" {
			failure(w, 400, "INVALID_INPUT", "仅支持 S256 的 PKCE 方法")
			return
		}
		held := false
		for _, role := range session.User.Roles {
			if role == input.RoleID {
				held = true
				break
			}
		}
		if !held {
			failure(w, 403, "MCP_OAUTH_FORBIDDEN", "所选角色不属于当前账号")
			return
		}
		grant, err := consentGrant(r, service, session, input.ClientID, input.RoleID, scopes)
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		code, err := service.IssueCode(r.Context(), grant, input.RedirectUri, challenge, method)
		if err != nil {
			failure(w, 400, "INVALID_INPUT", "授权请求无法完成")
			return
		}
		success(w, contracts.McpOauthConsentResult{
			RedirectUri: oauthRedirect(input.RedirectUri, code, deref(input.State)),
			ExpiresIn:   mcpoauth.CodeTTLSeconds,
		})
	})

	api.Get("/account/mcp/oauth/grants", func(w http.ResponseWriter, r *http.Request) {
		service, _, ok := oauthContext(w, r)
		if !ok {
			return
		}
		session, ok := require(config.Install, w, r, "")
		if !ok {
			return
		}
		grants, err := service.Store.GrantsForUser(r.Context(), session.User.ID)
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		items := []contracts.McpOauthGrant{}
		for _, grant := range grants {
			if grant.Status != mcpoauth.GrantActive {
				continue
			}
			clientName := grant.ClientID
			if client, err := service.Store.Client(r.Context(), grant.ClientID); err == nil {
				clientName = client.Name
			}
			items = append(items, mcpOauthGrantView(grant, clientName, session))
		}
		success(w, contracts.McpOauthGrantList{Items: items})
	})

	api.Delete("/account/mcp/oauth/grants/{id}", func(w http.ResponseWriter, r *http.Request) {
		service, _, ok := oauthContext(w, r)
		if !ok {
			return
		}
		session, ok := require(config.Install, w, r, "")
		if !ok {
			return
		}
		grant, err := service.Store.Grant(r.Context(), chi.URLParam(r, "id"))
		if err != nil || grant.UserID != session.User.ID || grant.Status != mcpoauth.GrantActive {
			failure(w, 404, "NOT_FOUND", "授权不存在")
			return
		}
		if err := service.RevokeGrant(r.Context(), grant, session.User.Username); err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
}

// consentGrant reuses the single active grant per user+client+role or
// records a fresh consent. Reuse re-binds the standing grant to the scope
// snapshot of the current consent: the issued code can never carry budgets
// beyond what this consent page showed and the user approved.
func consentGrant(r *http.Request, service *mcpoauth.Service, session contracts.Session, clientID, roleID string, scopes []string) (mcpoauth.Grant, error) {
	grants, err := service.Store.GrantsForUser(r.Context(), session.User.ID)
	if err == nil {
		for _, grant := range grants {
			if grant.Status == mcpoauth.GrantActive && grant.ClientID == clientID && grant.RoleID == roleID {
				return service.RefreshConsent(r.Context(), grant.ID, scopes)
			}
		}
	}
	return service.CreateGrant(r.Context(), session.User.ID, clientID, roleID, scopes, session.User.Roles)
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func stateOf(r *http.Request) *string {
	state := queryLimit(r, "state", 256)
	if state == "" {
		return nil
	}
	return &state
}

// oauthRedirect appends the one-time code and state to the registered
// callback, preserving any query parameters the registration carries.
func oauthRedirect(redirectURI, code, state string) string {
	parsed, err := url.Parse(redirectURI)
	if err != nil {
		return redirectURI
	}
	query := parsed.Query()
	query.Set("code", code)
	if state != "" {
		query.Set("state", state)
	}
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func mcpOauthGrantView(grant mcpoauth.Grant, clientName string, session contracts.Session) contracts.McpOauthGrant {
	roleName := grant.RoleID
	if session.User.RoleNames != nil {
		for index, id := range session.User.Roles {
			if id == grant.RoleID && index < len(*session.User.RoleNames) {
				roleName = (*session.User.RoleNames)[index]
				break
			}
		}
	}
	return contracts.McpOauthGrant{
		ID: grant.ID, ClientID: grant.ClientID, ClientName: clientName,
		RoleID: grant.RoleID, RoleName: roleName, Scopes: grant.Scopes,
		CreatedAt: grant.CreatedAt, LastUsedAt: grant.LastUsedAt,
	}
}

// mountMcpOauthAdmin attaches the administrator console endpoints: client
// registration behind mcp:clients:read/write with CAS conflicts and global
// grant revocation. Secret material exists only in the create/rotate replies.
func mountMcpOauthAdmin(api chi.Router, config Config) {
	adminService := func(w http.ResponseWriter, r *http.Request, permission string) (*mcpoauth.Service, contracts.Session, bool) {
		_, _, _, profile := config.Install.Services()
		if profile != runtime.WebPlatform || !config.Install.Installed() {
			failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供该能力")
			return nil, contracts.Session{}, false
		}
		if config.MCP == nil || config.MCP.OAuth == nil {
			failure(w, 404, "NOT_AVAILABLE", "此运行形态不提供该能力")
			return nil, contracts.Session{}, false
		}
		session, ok := require(config.Install, w, r, permission)
		if !ok {
			return nil, contracts.Session{}, false
		}
		return config.MCP.OAuth, session, true
	}
	clientView := func(client mcpoauth.Client) contracts.McpOauthClient {
		return contracts.McpOauthClient{
			ID: client.ID, Name: client.Name, ClientType: client.ClientType,
			RedirectUris: client.RedirectURIs, Enabled: client.Enabled,
			HasSecret: client.SecretHash != "", Version: client.Version,
			CreatedAt: client.CreatedAt, UpdatedAt: client.UpdatedAt,
		}
	}

	api.Get("/admin/mcp/oauth-clients", func(w http.ResponseWriter, r *http.Request) {
		service, _, ok := adminService(w, r, "mcp:clients:read")
		if !ok {
			return
		}
		clients, err := service.Store.Clients(r.Context())
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		items := make([]contracts.McpOauthClient, 0, len(clients))
		for _, client := range clients {
			items = append(items, clientView(client))
		}
		success(w, contracts.McpOauthClientList{Items: items})
	})
	api.Post("/admin/mcp/oauth-clients", func(w http.ResponseWriter, r *http.Request) {
		service, session, ok := adminService(w, r, "mcp:clients:write")
		if !ok {
			return
		}
		var input contracts.McpOauthClientCreateInput
		if !decode(w, r, &input) {
			return
		}
		client, secret, err := service.CreateClient(r.Context(), input.Name, input.ClientType, mcpoauth.AuthClientSecretPost, input.RedirectUris, session.User.Username)
		if err != nil {
			oauthClientError(w, err)
			return
		}
		success(w, contracts.McpOauthClientCreated{Client: clientView(client), Secret: secret})
	})
	api.Patch("/admin/mcp/oauth-clients/{id}", func(w http.ResponseWriter, r *http.Request) {
		service, session, ok := adminService(w, r, "mcp:clients:write")
		if !ok {
			return
		}
		var input contracts.McpOauthClientUpdateInput
		if !decode(w, r, &input) {
			return
		}
		client, err := service.UpdateClient(r.Context(), chi.URLParam(r, "id"), input.Name, input.RedirectUris, input.Enabled, input.ExpectedVersion, session.User.Username)
		if err != nil {
			oauthClientError(w, err)
			return
		}
		success(w, clientView(client))
	})
	api.Post("/admin/mcp/oauth-clients/{id}/secret", func(w http.ResponseWriter, r *http.Request) {
		service, session, ok := adminService(w, r, "mcp:clients:write")
		if !ok {
			return
		}
		_, secret, err := service.RotateClientSecret(r.Context(), chi.URLParam(r, "id"), session.User.Username)
		if err != nil {
			oauthClientError(w, err)
			return
		}
		success(w, contracts.McpOauthClientSecret{Secret: secret})
	})
	api.Get("/admin/mcp/oauth-clients/{id}/grants", func(w http.ResponseWriter, r *http.Request) {
		service, _, ok := adminService(w, r, "mcp:clients:read")
		if !ok {
			return
		}
		if _, err := service.Store.Client(r.Context(), chi.URLParam(r, "id")); err != nil {
			failure(w, 404, "NOT_FOUND", "OAuth 客户端不存在或已停用")
			return
		}
		views, err := service.Store.GrantViewsForClient(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		items := make([]contracts.McpOauthAdminGrant, 0, len(views))
		for _, view := range views {
			items = append(items, contracts.McpOauthAdminGrant{
				ID: view.ID, UserID: view.UserID, Username: view.Username,
				RoleID: view.RoleID, RoleName: view.RoleName, Scopes: view.Scopes,
				CreatedAt: view.CreatedAt, LastUsedAt: view.LastUsedAt,
			})
		}
		success(w, contracts.McpOauthAdminGrantList{Items: items})
	})
	api.Delete("/admin/mcp/oauth/grants/{id}", func(w http.ResponseWriter, r *http.Request) {
		service, session, ok := adminService(w, r, "mcp:clients:write")
		if !ok {
			return
		}
		if _, err := service.RevokeGrantByID(r.Context(), chi.URLParam(r, "id"), session.User.Username); err != nil {
			if errors.Is(err, mcpoauth.ErrInvalidGrant) {
				failure(w, 404, "NOT_FOUND", "授权不存在")
				return
			}
			failure(w, 503, "NOT_READY", "存储尚未就绪")
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
}

// oauthClientError maps authorization-service failures onto stable codes.
func oauthClientError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, mcpoauth.ErrClientNotFound):
		failure(w, 404, "NOT_FOUND", "OAuth 客户端不存在或已停用")
	case errors.Is(err, mcpoauth.ErrInvalidRedirect), errors.Is(err, mcpoauth.ErrInvalidScope),
		errors.Is(err, mcpoauth.ErrInvalidRequest), errors.Is(err, mcpoauth.ErrUnsupported):
		failure(w, 400, "INVALID_INPUT", "客户端注册信息超出允许范围")
	case errors.Is(err, mcpoauth.ErrConflict):
		failure(w, 409, "MCP_CONFLICT", "客户端已被其他管理员修改，请刷新后重试")
	default:
		failure(w, 503, "NOT_READY", "存储尚未就绪")
	}
}
