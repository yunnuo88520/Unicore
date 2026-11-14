// Author: yunnuo <ymz@ebox.vip>
// Description: MCP OAuth protocol endpoints: discovery documents, browser authorize handoff and the token and revocation RPCs.
package mcp

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/yunnuo/unicore/internal/platform/mcpoauth"
	"github.com/yunnuo/unicore/internal/runtime"
)

func (s *Surface) oauthEnabled(values map[string]string) bool {
	return values["mcp.enabled"] == "true" && values["mcp.oauth_enabled"] == "true"
}

// oauthScopesAdvertised mirrors what consents can actually carry: the write
// scope joins only once the write phase switch is open.
func oauthScopesAdvertised(values map[string]string) []string {
	scopes := []string{mcpoauth.ScopeRead, mcpoauth.ScopeOffline}
	if values["mcp.write_enabled"] == "true" {
		scopes = append(scopes, mcpoauth.ScopeWrite)
	}
	return scopes
}

func (s *Surface) baseURL(values map[string]string) string {
	if base := values["site.base_url"]; base != "" {
		return strings.TrimRight(base, "/")
	}
	return ""
}

func writeJSONValue(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (s *Surface) oauthGate(w http.ResponseWriter, r *http.Request) (map[string]string, bool) {
	_, settings, _, profile := s.Install.Services()
	if profile != runtime.WebPlatform || !s.Install.Installed() {
		http.NotFound(w, r)
		return nil, false
	}
	values, err := settings.Raw(r.Context())
	if err != nil {
		http.Error(w, "storage unavailable", http.StatusServiceUnavailable)
		return nil, false
	}
	if !s.oauthEnabled(values) {
		http.NotFound(w, r)
		return nil, false
	}
	return values, true
}

// handleProtectedResourceMetadata serves RFC 9728 metadata pointing clients
// at this platform as the authorization server for the /mcp resource.
func (s *Surface) handleProtectedResourceMetadata(w http.ResponseWriter, r *http.Request) {
	values, ok := s.oauthGate(w, r)
	if !ok {
		return
	}
	base := s.baseURL(values)
	writeJSONValue(w, 200, map[string]any{
		"resource":               mcpoauth.CanonicalResource(base),
		"authorization_servers":  []string{base},
		"scopes_supported":       oauthScopesAdvertised(values),
		"bearer_methods_supported": []string{"header"},
		"resource_documentation": base + "/api-docs",
	})
}

// handleAuthorizationServerMetadata serves the AS discovery document.
func (s *Surface) handleAuthorizationServerMetadata(w http.ResponseWriter, r *http.Request) {
	values, ok := s.oauthGate(w, r)
	if !ok {
		return
	}
	base := s.baseURL(values)
	writeJSONValue(w, 200, map[string]any{
		"issuer":                         base,
		"authorization_endpoint":         base + "/oauth/mcp/authorize",
		"token_endpoint":                 base + "/oauth/mcp/token",
		"revocation_endpoint":            base + "/oauth/mcp/revoke",
		"response_types_supported":       []string{"code"},
		"grant_types_supported":          []string{"authorization_code", "refresh_token"},
		"code_challenge_methods_supported": []string{"S256"},
		"scopes_supported":               oauthScopesAdvertised(values),
		"token_endpoint_auth_methods_supported": []string{"client_secret_post", "none"},
	})
}

// handleAuthorize hands the browser request to the SPA consent page: guests
// meet the login wall in place, signed-in sessions reach the consent form,
// and the authorize parameters survive both paths unchanged.
func (s *Surface) handleAuthorize(w http.ResponseWriter, r *http.Request) {
	values, ok := s.oauthGate(w, r)
	if !ok {
		return
	}
	if r.URL.RawQuery == "" {
		http.Error(w, "authorization request requires parameters", http.StatusBadRequest)
		return
	}
	http.Redirect(w, r, s.baseURL(values)+"/authorize?"+r.URL.RawQuery, http.StatusSeeOther)
}

// oauthTokenError writes one standard token-endpoint error (RFC 6749 5.2).
func oauthTokenError(w http.ResponseWriter, code string) {
	writeJSONValue(w, 400, map[string]any{"error": code})
}

// handleToken exchanges codes and refresh tokens; responses follow the
// protocol envelope, never the business one.
func (s *Surface) handleToken(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.oauthGate(w, r); !ok {
		return
	}
	if s.OAuth == nil {
		oauthTokenError(w, "server_error")
		return
	}
	if err := r.ParseForm(); err != nil {
		oauthTokenError(w, "invalid_request")
		return
	}
	switch r.PostForm.Get("grant_type") {
	case "authorization_code":
		issued, err := s.OAuth.ExchangeCode(r.Context(),
			r.PostForm.Get("client_id"), r.PostForm.Get("client_secret"),
			r.PostForm.Get("code"), r.PostForm.Get("redirect_uri"), r.PostForm.Get("code_verifier"))
		if err != nil {
			oauthTokenError(w, oauthErrorCode(err))
			return
		}
		s.writeTokenResponse(w, issued)
	case "refresh_token":
		issued, err := s.OAuth.Refresh(r.Context(),
			r.PostForm.Get("client_id"), r.PostForm.Get("client_secret"), r.PostForm.Get("refresh_token"))
		if err != nil {
			oauthTokenError(w, oauthErrorCode(err))
			return
		}
		s.writeTokenResponse(w, issued)
	default:
		oauthTokenError(w, "unsupported_grant_type")
	}
}

func (s *Surface) writeTokenResponse(w http.ResponseWriter, issued mcpoauth.Issued) {
	payload := map[string]any{
		"access_token": issued.AccessToken,
		"token_type":   issued.TokenType,
		"expires_in":   issued.ExpiresIn,
		"scope":        strings.Join(issued.Scopes, " "),
	}
	if issued.RefreshToken != "" {
		payload["refresh_token"] = issued.RefreshToken
	}
	writeJSONValue(w, 200, payload)
}

// oauthErrorCode maps service failures onto standard token-endpoint codes.
func oauthErrorCode(err error) string {
	switch {
	case err == nil:
		return "server_error"
	case err == mcpoauth.ErrInvalidClient, err == mcpoauth.ErrClientNotFound, err == mcpoauth.ErrClientDisabled:
		return "invalid_client"
	case err == mcpoauth.ErrInvalidRedirect:
		return "invalid_grant"
	case err == mcpoauth.ErrInvalidVerifier, err == mcpoauth.ErrInvalidCode, err == mcpoauth.ErrInvalidGrant:
		return "invalid_grant"
	case err == mcpoauth.ErrUnsupported:
		return "unsupported_grant_type"
	default:
		return "invalid_request"
	}
}

// handleRevoke answers RFC 7009; unknown tokens still return 200 so the
// endpoint cannot be probed.
func (s *Surface) handleRevoke(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.oauthGate(w, r); !ok {
		return
	}
	if s.OAuth == nil {
		oauthTokenError(w, "server_error")
		return
	}
	if err := r.ParseForm(); err != nil {
		oauthTokenError(w, "invalid_request")
		return
	}
	_ = s.OAuth.RevokeToken(r.Context(), r.PostForm.Get("client_id"), r.PostForm.Get("client_secret"), r.PostForm.Get("token"))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
}
