// Author: yunnuo <ymz@ebox.vip>
// Description: Platform event catalog, routing defaults and bounded plain-text templates.
package notifycontent

import (
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"regexp"
	"strings"
	"unicode/utf8"
)

var Events = []string{"login", "ip_banned", "password_changed", "totp_enabled", "totp_disabled", "account_disabled", "account_enabled", "registered", "user_created", "admin_created", "sessions_revoked", "email_changed", "alert_triggered", "alert_recovered"}
var Variables = []string{"site_name", "site_url", "username", "event_time", "ip", "message", "rule_name", "severity", "metric", "value", "threshold", "scope", "instance", "host", "occurred_at", "duration", "transition"}
var ErrInvalid = errors.New("invalid notification template")
var token = regexp.MustCompile(`\{\{([a-z_]+)\}\}`)

func Known(event string) bool {
	for _, e := range Events {
		if e == event {
			return true
		}
	}
	return false
}
func Defaults() contracts.NotifyConfiguration {
	c := contracts.NotifyConfiguration{Enabled: false, Provider: "wecom", Rules: []contracts.NotifyRule{}, Templates: []contracts.NotifyTemplate{}}
	titles := map[string]string{"login": "账号登录通知", "ip_banned": "登录 IP 封禁", "password_changed": "密码修改", "totp_enabled": "双因素认证启用", "totp_disabled": "双因素认证关闭", "account_disabled": "账号停用", "account_enabled": "账号启用", "registered": "用户注册", "user_created": "用户账号创建", "admin_created": "管理员账号创建", "sessions_revoked": "会话失效通知", "email_changed": "邮箱变更", "alert_triggered": "告警触发", "alert_recovered": "告警恢复"}
	for _, e := range Events {
		user := e != "login" && e != "account_enabled" && e != "ip_banned"
		admin := e == "ip_banned" || e == "totp_disabled" || e == "account_disabled" || e == "registered" || e == "admin_created"
		channel := admin || e == "account_enabled" || e == "user_created"
		body := "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"
		if e == "alert_triggered" || e == "alert_recovered" {
			// Runtime alerts keep the T4 baseline: administrator email only;
			// wecom/webhook stay opt-in through the channel switch.
			user, admin, channel = false, true, false
			body = "规则：{{rule_name}}\n级别：{{severity}}\n指标：{{metric}}\n当前值：{{value}}\n阈值：{{threshold}}\n范围：{{scope}}\n实例：{{instance}}\n主机：{{host}}\n发生时间：{{occurred_at}}\n持续时长：{{duration}}\n阶段：{{transition}}\n{{message}}\n{{site_url}}"
		}
		c.Rules = append(c.Rules, contracts.NotifyRule{Event: e, UserEmail: user, AdminEmail: admin, AdminChannel: channel})
		c.Templates = append(c.Templates, contracts.NotifyTemplate{Event: e, Title: "{{site_name}} · " + titles[e], Body: body})
	}
	return c
}

// MergeDefaults backfills rules and templates for events introduced after a
// configuration was saved, keeping every stored customization untouched.
func MergeDefaults(c contracts.NotifyConfiguration) contracts.NotifyConfiguration {
	hasRule := func(event string) bool {
		for _, r := range c.Rules {
			if r.Event == event {
				return true
			}
		}
		return false
	}
	hasTemplate := func(event string) bool {
		for _, t := range c.Templates {
			if t.Event == event {
				return true
			}
		}
		return false
	}
	defaults := Defaults()
	for _, rule := range defaults.Rules {
		if !hasRule(rule.Event) {
			c.Rules = append(c.Rules, rule)
		}
	}
	for _, template := range defaults.Templates {
		if !hasTemplate(template.Event) {
			c.Templates = append(c.Templates, template)
		}
	}
	return c
}
func Validate(t contracts.NotifyTemplate) error {
	if !Known(t.Event) || strings.TrimSpace(t.Title) == "" || strings.TrimSpace(t.Body) == "" || !utf8.ValidString(t.Title+t.Body) || utf8.RuneCountInString(t.Title) > 160 || utf8.RuneCountInString(t.Body) > 4000 || strings.ContainsAny(t.Title, "\r\n\x00") || strings.ContainsAny(t.Body, "\x00<>") || strings.ContainsAny(t.Title, "<>") {
		return ErrInvalid
	}
	rest := token.ReplaceAllStringFunc(t.Title+t.Body, func(s string) string {
		key := s[2 : len(s)-2]
		for _, v := range Variables {
			if key == v {
				return ""
			}
		}
		return s
	})
	if strings.Contains(rest, "{{") || strings.Contains(rest, "}}") {
		return ErrInvalid
	}
	return nil
}
func Render(t contracts.NotifyTemplate, vars map[string]string) (contracts.NotifyPreview, error) {
	if err := Validate(t); err != nil {
		return contracts.NotifyPreview{}, err
	}
	render := func(s string) string {
		return token.ReplaceAllStringFunc(s, func(x string) string { return vars[x[2:len(x)-2]] })
	}
	title := strings.NewReplacer("\r", " ", "\n", " ", "\x00", "").Replace(render(t.Title))
	body := render(t.Body)
	if utf8.RuneCountInString(title) > 512 || utf8.RuneCountInString(body) > 12000 {
		return contracts.NotifyPreview{}, ErrInvalid
	}
	return contracts.NotifyPreview{Title: title, Body: body}, nil
}
func ValidConfiguration(c contracts.NotifyConfiguration) bool {
	if c.Provider != "wecom" && c.Provider != "webhook" || len(c.Rules) != len(Events) || len(c.Templates) != len(Events) {
		return false
	}
	seen := map[string]bool{}
	for _, r := range c.Rules {
		if !Known(r.Event) || seen[r.Event] {
			return false
		}
		seen[r.Event] = true
	}
	seen = map[string]bool{}
	for _, t := range c.Templates {
		if Validate(t) != nil || seen[t.Event] {
			return false
		}
		seen[t.Event] = true
	}
	return true
}
