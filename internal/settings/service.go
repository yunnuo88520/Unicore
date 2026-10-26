// Author: yunnuo <ymz@ebox.vip>
// Description: Typed, grouped, profile-aware settings registry shared by Web and Desktop.
package settings

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/mail"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/yunnuo/unicore/internal/contracts"
)

var ErrInvalid = errors.New("invalid setting")
var ErrMailNotReady = errors.New("mail configuration must pass a delivery test")

type Store interface {
	ReadSettings(context.Context) (map[string]string, error)
	SaveSettings(context.Context, map[string]string, string) error
}
type SettingDefinition struct {
	Key, Type, Group, Label, Default string
	PlatformOnly                     bool
	Sensitive                        bool
	Validate                         func(string) bool
}

func text(max int) func(string) bool {
	return func(value string) bool { return utf8.ValidString(value) && utf8.RuneCountInString(value) <= max }
}
func oneOf(values ...string) func(string) bool {
	return func(value string) bool {
		for _, v := range values {
			if v == value {
				return true
			}
		}
		return false
	}
}
func integer(min, max int) func(string) bool {
	return func(value string) bool { i, err := strconv.Atoi(value); return err == nil && i >= min && i <= max }
}

// ValidAdminPath keeps API/install/assets and the old admin prefix out of ambiguous routes.
func ValidAdminPath(value string) bool {
	if !regexp.MustCompile(`^/[a-zA-Z][a-zA-Z0-9_-]{1,31}$`).MatchString(value) {
		return false
	}
	switch strings.ToLower(value) {
	case "/api", "/install", "/assets", "/settings", "/login", "/auth":
		return false
	}
	return true
}
func ValidBaseURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && u.User == nil && u.RawQuery == "" && u.Fragment == "" && (u.Path == "" || u.Path == "/")
}

var Definitions = []SettingDefinition{
	{"site.name", "string", "site", "站点名称", "Unicore", false, false, func(v string) bool { return strings.TrimSpace(v) != "" && text(64)(v) }},
	{"site.description", "string", "site", "站点描述", "一份核心，无限可能", false, false, text(240)},
	{"site.copyright", "string", "site", "页脚版权", "Crafted by yunnuo", false, false, text(160)},
	{"appearance.theme", "string", "appearance", "默认主题", "system", false, false, oneOf("light", "dark", "system")},
	{"admin.path", "string", "admin", "管理后台路径", "/admin", true, false, ValidAdminPath},
	{"security.login_captcha", "boolean", "security", "登录图形验证码", "true", true, false, oneOf("true", "false")},
	{"security.session_hours", "integer", "security", "会话有效期（小时）", "24", true, false, integer(1, 168)},
	{"security.register_captcha", "boolean", "security", "注册图形验证码", "true", true, false, oneOf("true", "false")},
	{"account.registration_enabled", "boolean", "account", "开放注册（需验证邮箱）", "false", true, false, oneOf("true", "false")},
	{"account.password_reset_enabled", "boolean", "account", "邮件找回密码", "false", true, false, oneOf("true", "false")},
	{"mail.host", "string", "mail", "SMTP 主机", "", true, false, func(v string) bool { return len(v) <= 253 && !strings.ContainsAny(v, "\r\n /@") }},
	{"mail.port", "integer", "mail", "SMTP 端口", "587", true, false, integer(1, 65535)},
	{"mail.tls", "string", "mail", "SMTP 加密方式", "starttls", true, false, oneOf("starttls", "tls", "plain")},
	{"mail.from", "string", "mail", "发件邮箱", "", true, false, func(v string) bool { return v == "" || ValidEmail(v) }},
	{"mail.username", "string", "mail", "SMTP 用户名", "", true, false, func(v string) bool { return text(254)(v) && !strings.ContainsAny(v, "\r\n") }},
	{"mail.password", "string", "mail", "SMTP 密钥", "", true, true, text(512)},
}

func ValidEmail(value string) bool {
	address, err := mail.ParseAddress(value)
	return err == nil && address.Address == value && len(value) <= 254 && !strings.ContainsAny(value, "\r\n")
}

type Secrets interface {
	Seal(string) string
	Open(string) (string, error)
}
type Service struct {
	Store   Store
	Secrets Secrets
	mu      sync.Mutex
	Profile contracts.Profile
}

// Raw is internal-only: HTTP must use List so secrets never enter responses.
func (s *Service) Raw(ctx context.Context) (map[string]string, error) {
	values, err := s.Store.ReadSettings(ctx)
	if err != nil {
		return nil, err
	}
	for _, d := range Definitions {
		if d.PlatformOnly && s.Profile != "web-platform" {
			continue
		}
		value, ok := values[d.Key]
		if !ok {
			value = d.Default
		}
		if d.Sensitive && value != "" {
			if s.Secrets == nil {
				return nil, errors.New("secret storage unavailable")
			}
			// Keep the randomized ciphertext revision for verification, never a fast password hash.
			if d.Key == "mail.password" {
				values["_mail_credential_revision"] = value
			}
			value, err = s.Secrets.Open(value)
			if err != nil {
				return nil, err
			}
		}
		values[d.Key] = value
	}
	return values, nil
}
func (s *Service) List(ctx context.Context) (contracts.Settings, error) {
	values, err := s.Raw(ctx)
	if err != nil {
		return contracts.Settings{}, err
	}
	result := contracts.Settings{Items: []contracts.SettingEntry{}}
	for _, d := range Definitions {
		if d.PlatformOnly && s.Profile != "web-platform" {
			continue
		}
		value := values[d.Key]
		entry := contracts.SettingEntry{Key: d.Key, Value: value, ValueType: d.Type, Group: d.Group, Label: d.Label, Sensitive: d.Sensitive}
		if d.Sensitive {
			configured := value != ""
			entry.Configured = &configured
			entry.Value = ""
		}
		result.Items = append(result.Items, entry)
	}
	return result, nil
}
func (s *Service) Value(ctx context.Context, key string) (string, error) {
	values, err := s.Raw(ctx)
	if err != nil {
		return "", err
	}
	for _, d := range Definitions {
		if d.Key == key && (!d.PlatformOnly || s.Profile == "web-platform") {
			return values[key], nil
		}
	}
	return "", ErrInvalid
}
func MailFingerprint(values map[string]string) string {
	selected := map[string]string{}
	for _, key := range []string{"mail.host", "mail.port", "mail.tls", "mail.from", "mail.username", "mail.password"} {
		selected[key] = values[key]
		if key == "mail.password" {
			selected[key] = values["_mail_credential_revision"]
		}
	}
	data, _ := json.Marshal(selected)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
func MailConfigured(values map[string]string) bool {
	if values["mail.host"] == "" || !ValidEmail(values["mail.from"]) {
		return false
	}
	if values["mail.username"] != "" && values["mail.password"] == "" {
		return false
	}
	if values["mail.tls"] == "plain" {
		host := values["mail.host"]
		address := net.ParseIP(host)
		if host != "localhost" && (address == nil || !address.IsLoopback()) {
			return false
		}
	}
	return true
}
func MailReady(values map[string]string) bool {
	return MailConfigured(values) && values["mail.verified_fingerprint"] == MailFingerprint(values)
}
func (s *Service) MarkMailTested(ctx context.Context, fingerprint, actor string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	current, err := s.Raw(ctx)
	if err != nil {
		return err
	}
	if !MailConfigured(current) || MailFingerprint(current) != fingerprint {
		return ErrMailNotReady
	}
	return s.Store.SaveSettings(ctx, map[string]string{"mail.verified_fingerprint": fingerprint}, actor)
}
func (s *Service) Patch(ctx context.Context, input contracts.SettingPatch, actor string) (contracts.Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(input.Changes) == 0 || len(input.Changes) > len(Definitions) {
		return contracts.Settings{}, ErrInvalid
	}
	current, err := s.Raw(ctx)
	if err != nil {
		return contracts.Settings{}, err
	}
	values := map[string]string{}
	seen := map[string]bool{}
	for _, change := range input.Changes {
		if seen[change.Key] {
			return contracts.Settings{}, ErrInvalid
		}
		seen[change.Key] = true
		found := false
		for _, d := range Definitions {
			if d.Key == change.Key {
				if d.PlatformOnly && s.Profile != "web-platform" {
					return contracts.Settings{}, ErrInvalid
				}
				clear := change.Clear != nil && *change.Clear
				if clear && (!d.Sensitive || change.Value != "") {
					return contracts.Settings{}, ErrInvalid
				}
				value := change.Value
				if d.Sensitive && value == "" && !clear {
					found = true
					break
				}
				if !d.Validate(value) {
					return contracts.Settings{}, ErrInvalid
				}
				current[d.Key] = value
				if d.Sensitive && value != "" {
					if s.Secrets == nil {
						return contracts.Settings{}, errors.New("secret storage unavailable")
					}
					value = s.Secrets.Seal(value)
				}
				if d.Key == "mail.password" {
					current["_mail_credential_revision"] = value
				}
				values[d.Key] = value
				found = true
				break
			}
		}
		if !found {
			return contracts.Settings{}, ErrInvalid
		}
	}
	if current["account.registration_enabled"] == "true" || current["account.password_reset_enabled"] == "true" {
		if !MailReady(current) {
			return contracts.Settings{}, ErrMailNotReady
		}
	}
	if err = s.Store.SaveSettings(ctx, values, actor); err != nil {
		return contracts.Settings{}, err
	}
	return s.List(ctx)
}
func Defaults(profile contracts.Profile) map[string]string {
	values := map[string]string{}
	for _, d := range Definitions {
		if !d.PlatformOnly || profile == "web-platform" {
			values[d.Key] = d.Default
		}
	}
	return values
}
