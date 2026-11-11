// Author: yunnuo <ymz@ebox.vip>
// Description: Register event metadata, templates and routing once; the settings UI consumes this catalog.
package notifycontent

import (
	"fmt"
	"github.com/yunnuo/unicore/internal/contracts"
	"regexp"
	"sync"
)

type Variable struct{ Key, Label, LabelEN, Sample string }
type Definition struct {
	ID, Label, LabelEN, Description, DescriptionEN string
	UserEmailAllowed                               bool
	Rule                                           contracts.NotifyRule
	Template                                       contracts.NotifyTemplate
	Variables                                      []Variable
	legacy                                         bool
}

var registryMu sync.RWMutex
var definitions = builtins()
var eventID = regexp.MustCompile(`^[a-z][a-z0-9_]{0,39}$`)
var commonVariables = []Variable{
	{Key: "site_name", Label: "站点名称", LabelEN: "Site name"},
	{Key: "site_url", Label: "站点地址", LabelEN: "Site URL"},
	{Key: "username", Label: "用户名", LabelEN: "Username"},
	{Key: "event_time", Label: "事件时间", LabelEN: "Event time"},
	{Key: "ip", Label: "来源 IP", LabelEN: "Source IP"},
	{Key: "message", Label: "事件详情", LabelEN: "Event details"},
}

func builtins() []Definition {
	result := []Definition{
		{
			ID:               "login",
			Label:            "登录成功",
			LabelEN:          "Successful login",
			Description:      "密码、邮箱或 OIDC 登录完成，启用 2FA 时在验证通过后通知。",
			DescriptionEN:    "Password, email or OIDC login completes; with 2FA, delivery waits for verification.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "login", UserEmail: false, AdminEmail: false, AdminChannel: false},
			Template:         contracts.NotifyTemplate{Event: "login", Title: "{{site_name}} · 账号登录通知", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "ip_banned",
			Label:            "登录 IP 封禁",
			LabelEN:          "Login IP blocked",
			Description:      "连续登录失败达到阈值，临时封禁来源 IP。",
			DescriptionEN:    "Repeated login failures temporarily block the source IP.",
			UserEmailAllowed: false,
			Rule:             contracts.NotifyRule{Event: "ip_banned", UserEmail: false, AdminEmail: true, AdminChannel: true},
			Template:         contracts.NotifyTemplate{Event: "ip_banned", Title: "{{site_name}} · 登录 IP 封禁", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "password_changed",
			Label:            "密码修改",
			LabelEN:          "Password changed",
			Description:      "密码修改或找回密码成功。",
			DescriptionEN:    "A password is changed or successfully reset.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "password_changed", UserEmail: true, AdminEmail: false, AdminChannel: false},
			Template:         contracts.NotifyTemplate{Event: "password_changed", Title: "{{site_name}} · 密码修改", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "totp_enabled",
			Label:            "开启双因素认证",
			LabelEN:          "Two-factor authentication enabled",
			Description:      "账户成功开启 TOTP 两步验证。",
			DescriptionEN:    "An account enables TOTP two-step verification.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "totp_enabled", UserEmail: true, AdminEmail: false, AdminChannel: false},
			Template:         contracts.NotifyTemplate{Event: "totp_enabled", Title: "{{site_name}} · 双因素认证启用", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "totp_disabled",
			Label:            "关闭双因素认证",
			LabelEN:          "Two-factor authentication disabled",
			Description:      "账户关闭 TOTP 两步验证。",
			DescriptionEN:    "An account disables TOTP two-step verification.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "totp_disabled", UserEmail: true, AdminEmail: true, AdminChannel: true},
			Template:         contracts.NotifyTemplate{Event: "totp_disabled", Title: "{{site_name}} · 双因素认证关闭", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "account_disabled",
			Label:            "账户停用",
			LabelEN:          "Account disabled",
			Description:      "管理员停用账户并撤销其会话。",
			DescriptionEN:    "An administrator disables an account and revokes its sessions.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "account_disabled", UserEmail: true, AdminEmail: true, AdminChannel: true},
			Template:         contracts.NotifyTemplate{Event: "account_disabled", Title: "{{site_name}} · 账号停用", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "account_enabled",
			Label:            "账户启用",
			LabelEN:          "Account enabled",
			Description:      "停用账户重新启用。",
			DescriptionEN:    "A disabled account is enabled again.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "account_enabled", UserEmail: false, AdminEmail: false, AdminChannel: true},
			Template:         contracts.NotifyTemplate{Event: "account_enabled", Title: "{{site_name}} · 账号启用", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "registered",
			Label:            "用户注册",
			LabelEN:          "User registration",
			Description:      "注册完成；需要邮箱验证时，在验证通过后通知。",
			DescriptionEN:    "Registration completes; when required, notification waits for email verification.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "registered", UserEmail: true, AdminEmail: true, AdminChannel: true},
			Template:         contracts.NotifyTemplate{Event: "registered", Title: "{{site_name}} · 用户注册", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "user_created",
			Label:            "创建用户",
			LabelEN:          "Create user",
			Description:      "管理员在后台创建普通用户。",
			DescriptionEN:    "An administrator creates a member account.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "user_created", UserEmail: true, AdminEmail: false, AdminChannel: true},
			Template:         contracts.NotifyTemplate{Event: "user_created", Title: "{{site_name}} · 用户账号创建", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "admin_created",
			Label:            "创建管理员",
			LabelEN:          "Administrator created",
			Description:      "管理员在后台创建管理员账户。",
			DescriptionEN:    "An administrator creates an administrator account.",
			UserEmailAllowed: false,
			Rule:             contracts.NotifyRule{Event: "admin_created", UserEmail: false, AdminEmail: true, AdminChannel: true},
			Template:         contracts.NotifyTemplate{Event: "admin_created", Title: "{{site_name}} · 管理员账号创建", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "sessions_revoked",
			Label:            "会话失效",
			LabelEN:          "Session revoked",
			Description:      "账户主动撤销一个或多个登录会话。",
			DescriptionEN:    "An account revokes one or more login sessions.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "sessions_revoked", UserEmail: true, AdminEmail: false, AdminChannel: false},
			Template:         contracts.NotifyTemplate{Event: "sessions_revoked", Title: "{{site_name}} · 会话失效通知", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "email_changed",
			Label:            "邮箱变更",
			LabelEN:          "Email changed",
			Description:      "完成原邮箱验证并成功更换绑定邮箱。",
			DescriptionEN:    "The original email is verified and the linked email is changed.",
			UserEmailAllowed: true,
			Rule:             contracts.NotifyRule{Event: "email_changed", UserEmail: true, AdminEmail: false, AdminChannel: false},
			Template:         contracts.NotifyTemplate{Event: "email_changed", Title: "{{site_name}} · 邮箱变更", Body: "账户：{{username}}\n时间：{{event_time}}\nIP：{{ip}}\n{{message}}\n{{site_url}}"},
		},
		{
			ID:               "alert_triggered",
			Label:            "告警触发",
			LabelEN:          "Alert triggered",
			Description:      "运行指标越过触发阈值并连续多拍保持后触发，默认通知管理员邮箱。",
			DescriptionEN:    "Fires when a runtime metric stays past its trigger threshold for the required consecutive ticks; the administrator mailbox is notified by default.",
			UserEmailAllowed: false,
			Rule:             contracts.NotifyRule{Event: "alert_triggered", UserEmail: false, AdminEmail: true, AdminChannel: false},
			Template:         contracts.NotifyTemplate{Event: "alert_triggered", Title: "{{site_name}} · 告警触发", Body: "规则：{{rule_name}}\n级别：{{severity}}\n指标：{{metric}}\n当前值：{{value}}\n阈值：{{threshold}}\n范围：{{scope}}\n实例：{{instance}}\n主机：{{host}}\n发生时间：{{occurred_at}}\n持续时长：{{duration}}\n阶段：{{transition}}\n{{message}}\n{{site_url}}"},
			Variables: []Variable{
				{Key: "rule_name",
					Label:   "规则名称",
					LabelEN: "Rule name", Sample: "CPU 使用率过高"}, {Key: "metric",
					Label:   "指标",
					LabelEN: "Metric", Sample: "cpu"}, {Key: "value",
					Label:   "当前值",
					LabelEN: "Current value", Sample: "91.0%"}, {Key: "threshold",
					Label:   "阈值",
					LabelEN: "Threshold", Sample: "85"}, {Key: "scope",
					Label:   "范围",
					LabelEN: "Scope", Sample: "host"}, {Key: "instance",
					Label:   "实例标识",
					LabelEN: "Instance ID", Sample: "ab12cd34"}, {Key: "host",
					Label:   "主机名",
					LabelEN: "Hostname", Sample: "monitor-host"}, {Key: "severity",
					Label:   "告警级别",
					LabelEN: "Alert severity", Sample: "warning"}, {Key: "occurred_at",
					Label:   "发生时间",
					LabelEN: "Occurred at", Sample: "2026-01-01T11:36:30Z"}, {Key: "duration",
					Label:   "持续时长",
					LabelEN: "Firing duration", Sample: "23m30s"}, {Key: "transition",
					Label:   "阶段",
					LabelEN: "Transition", Sample: "triggered"},
			},
		},
		{
			ID:               "alert_recovered",
			Label:            "告警恢复",
			LabelEN:          "Alert recovered",
			Description:      "运行指标回落到恢复阈值以下，告警退出。",
			DescriptionEN:    "Fires when the metric falls back below its recovery threshold and the alert exits.",
			UserEmailAllowed: false,
			Rule:             contracts.NotifyRule{Event: "alert_recovered", UserEmail: false, AdminEmail: true, AdminChannel: false},
			Template:         contracts.NotifyTemplate{Event: "alert_recovered", Title: "{{site_name}} · 告警恢复", Body: "规则：{{rule_name}}\n级别：{{severity}}\n指标：{{metric}}\n当前值：{{value}}\n阈值：{{threshold}}\n范围：{{scope}}\n实例：{{instance}}\n主机：{{host}}\n发生时间：{{occurred_at}}\n持续时长：{{duration}}\n阶段：{{transition}}\n{{message}}\n{{site_url}}"},
			Variables: []Variable{
				{Key: "rule_name",
					Label:   "规则名称",
					LabelEN: "Rule name", Sample: "CPU 使用率过高"}, {Key: "metric",
					Label:   "指标",
					LabelEN: "Metric", Sample: "cpu"}, {Key: "value",
					Label:   "当前值",
					LabelEN: "Current value", Sample: "91.0%"}, {Key: "threshold",
					Label:   "阈值",
					LabelEN: "Threshold", Sample: "85"}, {Key: "scope",
					Label:   "范围",
					LabelEN: "Scope", Sample: "host"}, {Key: "instance",
					Label:   "实例标识",
					LabelEN: "Instance ID", Sample: "ab12cd34"}, {Key: "host",
					Label:   "主机名",
					LabelEN: "Hostname", Sample: "monitor-host"}, {Key: "severity",
					Label:   "告警级别",
					LabelEN: "Alert severity", Sample: "warning"}, {Key: "occurred_at",
					Label:   "发生时间",
					LabelEN: "Occurred at", Sample: "2026-01-01T11:36:30Z"}, {Key: "duration",
					Label:   "持续时长",
					LabelEN: "Firing duration", Sample: "23m30s"}, {Key: "transition",
					Label:   "阶段",
					LabelEN: "Transition", Sample: "triggered"},
			},
		},
	}
	for i := range result {
		result[i].legacy = true
	}
	return result
}

// Register is called by platform module initialization before serving requests.
// Business registrations default to opt-in: supply explicit defaults in Rule.
func Register(d Definition) {
	if !eventID.MatchString(d.ID) || d.Label == "" || d.LabelEN == "" || d.Description == "" || d.DescriptionEN == "" {
		panic("invalid notification event definition")
	}
	d.Rule.Event, d.Template.Event = d.ID, d.ID
	if !d.UserEmailAllowed && d.Rule.UserEmail {
		panic("notification event has no user email audience")
	}
	seen := map[string]bool{}
	for _, v := range commonVariables {
		seen[v.Key] = true
	}
	for _, v := range d.Variables {
		if !eventID.MatchString(v.Key) || seen[v.Key] || v.Label == "" || v.LabelEN == "" {
			panic("invalid notification variable")
		}
		seen[v.Key] = true
	}
	if len(d.Variables)+len(commonVariables) > 32 || validateTemplate(d.Template, variablesFor(d)) != nil {
		panic("invalid default notification template")
	}
	registryMu.Lock()
	defer registryMu.Unlock()
	if len(definitions) >= 32 {
		panic("notification event catalog is full")
	}
	for _, existing := range definitions {
		if existing.ID == d.ID {
			panic(fmt.Sprintf("duplicate notification event %s", d.ID))
		}
	}
	d.Variables = append([]Variable(nil), d.Variables...)
	definitions = append(definitions, d)
}
func Definitions() []Definition {
	registryMu.RLock()
	defer registryMu.RUnlock()
	result := append([]Definition(nil), definitions...)
	for i := range result {
		result[i].Variables = append([]Variable(nil), result[i].Variables...)
	}
	return result
}
func DefinitionFor(id string) (Definition, bool) {
	for _, d := range Definitions() {
		if d.ID == id {
			return d, true
		}
	}
	return Definition{}, false
}
func EventIDs() []string {
	result := []string{}
	for _, d := range Definitions() {
		result = append(result, d.ID)
	}
	return result
}
func variablesFor(d Definition) []Variable {
	return append(append([]Variable(nil), commonVariables...), d.Variables...)
}
func Catalog() []contracts.NotifyEvent {
	result := []contracts.NotifyEvent{}
	for _, d := range Definitions() {
		vars := []contracts.NotifyVariable{}
		for _, v := range variablesFor(d) {
			vars = append(vars, contracts.NotifyVariable{Key: v.Key, Label: v.Label, LabelEn: v.LabelEN})
		}
		result = append(result, contracts.NotifyEvent{ID: d.ID, Label: d.Label, LabelEn: d.LabelEN, Description: d.Description, DescriptionEn: d.DescriptionEN, UserEmailAllowed: d.UserEmailAllowed, Variables: vars})
	}
	return result
}
