// Author: yunnuo <ymz@ebox.vip>
// Description: Typed, grouped, profile-aware settings registry shared by Web and Desktop.
package settings

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/yunnuo/unicore/internal/contracts"
)

var ErrInvalid = errors.New("invalid setting")

type Store interface {
	ReadSettings(context.Context) (map[string]string, error)
	SaveSettings(context.Context, map[string]string, string) error
}
type SettingDefinition struct {
	Key, Type, Group, Label, Default string
	PlatformOnly                     bool
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
	{"site.name", "string", "site", "站点名称", "Unicore", false, func(v string) bool { return strings.TrimSpace(v) != "" && text(64)(v) }},
	{"site.description", "string", "site", "站点描述", "一份核心，无限可能", false, text(240)},
	{"site.copyright", "string", "site", "页脚版权", "Crafted by yunnuo", false, text(160)},
	{"appearance.theme", "string", "appearance", "默认主题", "system", false, oneOf("light", "dark", "system")},
	{"admin.path", "string", "admin", "管理后台路径", "/admin", true, ValidAdminPath},
	{"security.login_captcha", "boolean", "security", "登录图形验证码", "true", true, oneOf("true", "false")},
	{"security.session_hours", "integer", "security", "会话有效期（小时）", "24", true, integer(1, 168)},
}

type Service struct {
	Store   Store
	Profile contracts.Profile
}

func (s *Service) List(ctx context.Context) (contracts.Settings, error) {
	values, err := s.Store.ReadSettings(ctx)
	if err != nil {
		return contracts.Settings{}, err
	}
	result := contracts.Settings{Items: []contracts.SettingEntry{}}
	for _, d := range Definitions {
		if d.PlatformOnly && s.Profile != "web-platform" {
			continue
		}
		value, ok := values[d.Key]
		if !ok {
			value = d.Default
		}
		result.Items = append(result.Items, contracts.SettingEntry{Key: d.Key, Value: value, ValueType: d.Type, Group: d.Group, Label: d.Label})
	}
	return result, nil
}
func (s *Service) Value(ctx context.Context, key string) (string, error) {
	list, err := s.List(ctx)
	if err != nil {
		return "", err
	}
	for _, v := range list.Items {
		if v.Key == key {
			return v.Value, nil
		}
	}
	return "", ErrInvalid
}
func (s *Service) Patch(ctx context.Context, input contracts.SettingPatch, actor string) (contracts.Settings, error) {
	if len(input.Changes) == 0 || len(input.Changes) > len(Definitions) {
		return contracts.Settings{}, ErrInvalid
	}
	values := map[string]string{}
	for _, change := range input.Changes {
		if _, exists := values[change.Key]; exists {
			return contracts.Settings{}, ErrInvalid
		}
		found := false
		for _, d := range Definitions {
			if d.Key == change.Key {
				if (d.PlatformOnly && s.Profile != "web-platform") || !d.Validate(change.Value) {
					return contracts.Settings{}, ErrInvalid
				}
				found = true
				break
			}
		}
		if !found {
			return contracts.Settings{}, ErrInvalid
		}
		values[change.Key] = change.Value
	}
	if err := s.Store.SaveSettings(ctx, values, actor); err != nil {
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
