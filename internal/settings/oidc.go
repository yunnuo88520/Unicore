// Author: yunnuo <ymz@ebox.vip>
// Description: Central OIDC settings validation and secret-revision fingerprinting.
package settings

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/url"
	"strings"
)

// HTTP is permitted only for a literal loopback test issuer, never a remote hostname.
func ValidOIDCURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && u.RawQuery == "" && ValidOIDCEndpoint(value)
}

// Endpoints may carry a query, but cannot contain credentials or fragments.
func ValidOIDCEndpoint(value string) bool {
	u, err := url.Parse(value)
	if err != nil || u.Host == "" || u.User != nil || u.Fragment != "" || len(value) > 2048 || strings.ContainsAny(value, "\r\n\\") {
		return false
	}
	if u.Scheme == "https" {
		return true
	}
	ip := net.ParseIP(u.Hostname())
	return u.Scheme == "http" && ip != nil && ip.IsLoopback()
}

var OIDCDefinitions = []SettingDefinition{
	{"oidc.enabled", "boolean", "oidc", "企业登录", "false", true, false, oneOf("true", "false")},
	{"oidc.provider_name", "string", "oidc", "企业登录名称", "企业账号", true, false, func(v string) bool {
		return strings.TrimSpace(v) != "" && text(40)(v) && !strings.ContainsAny(v, "\r\n")
	}},
	{"oidc.issuer", "string", "oidc", "Issuer 地址", "", true, false, func(v string) bool { return v == "" || ValidOIDCURL(v) }},
	{"oidc.client_id", "string", "oidc", "Client ID", "", true, false, func(v string) bool { return text(256)(v) && !strings.ContainsAny(v, "\r\n") }},
	{"oidc.client_secret", "string", "oidc", "Client Secret", "", true, true, text(2048)},
	{"oidc.scopes", "string", "oidc", "授权范围", "openid email profile", true, false, func(v string) bool {
		if len(v) > 256 {
			return false
		}
		found := false
		for _, scope := range strings.Fields(v) {
			if scope == "openid" {
				found = true
			}
			for _, c := range scope {
				if c < 33 || c > 126 || c == '"' || c == '\\' {
					return false
				}
			}
		}
		return found
	}},
	{"oidc.jit_enabled", "boolean", "oidc", "首次登录创建普通账号", "false", true, false, oneOf("true", "false")},
	{"oidc.require_email_verified", "boolean", "oidc", "企业邮箱必须已验证", "true", true, false, oneOf("true", "false")},
	{"oidc.userinfo_enabled", "boolean", "oidc", "拉取 userinfo 补全身份", "false", true, false, oneOf("true", "false")},
	{"oidc.userinfo_email_path", "string", "oidc", "userinfo 邮箱字段路径", "email", true, false, validClaimPath},
	{"oidc.userinfo_username_path", "string", "oidc", "userinfo 显示名字段路径", "preferred_username", true, false, validClaimPath},
	{"oidc.authorize_url", "string", "oidc", "授权端点（覆盖发现）", "", true, false, func(v string) bool { return v == "" || ValidOIDCEndpoint(v) }},
	{"oidc.token_url", "string", "oidc", "令牌端点（覆盖发现）", "", true, false, func(v string) bool { return v == "" || ValidOIDCEndpoint(v) }},
	{"oidc.userinfo_url", "string", "oidc", "userinfo 端点（覆盖发现）", "", true, false, func(v string) bool { return v == "" || ValidOIDCEndpoint(v) }},
	{"oidc.jwks_url", "string", "oidc", "JWKS 端点（覆盖发现）", "", true, false, func(v string) bool { return v == "" || ValidOIDCEndpoint(v) }},
}

// validClaimPath accepts dotted claim paths such as data.email for non-standard userinfo payloads.
func validClaimPath(value string) bool {
	if value == "" || len(value) > 128 {
		return false
	}
	for _, part := range strings.Split(value, ".") {
		if part == "" || len(part) > 64 || strings.ContainsAny(part, " \t\r\n\"\\/") {
			return false
		}
	}
	return true
}

// OIDCManualEndpoints reports the discovered-endpoint overrides in priority order.
func OIDCManualEndpoints(values map[string]string) map[string]string {
	return map[string]string{
		"authorize": values["oidc.authorize_url"],
		"token":     values["oidc.token_url"],
		"userinfo":  values["oidc.userinfo_url"],
		"jwks":      values["oidc.jwks_url"],
	}
}

func OIDCConfigured(values map[string]string) bool {
	return ValidOIDCURL(values["oidc.issuer"]) && strings.TrimSpace(values["oidc.client_id"]) != ""
}

// Use the encrypted revision, not a fast hash of the client secret.
func OIDCFingerprint(values map[string]string) string {
	selected := map[string]string{}
	for _, d := range OIDCDefinitions {
		value, ok := values[d.Key]
		if !ok {
			value = d.Default
		}
		if d.Sensitive {
			if revision, exists := values["_oidc_credential_revision"]; exists {
				value = revision
			}
		}
		selected[d.Key] = value
	}
	data, _ := json.Marshal(selected)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
