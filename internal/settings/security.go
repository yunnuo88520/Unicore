// Author: yunnuo <ymz@ebox.vip>
// Description: Realm-specific account security settings and compatibility with the original shared 2FA switch.
package settings

var SecurityDefinitions = []SettingDefinition{
	{"security.login_failure_limit", "integer", "security", "登录失败封禁次数", "5", true, false, integer(1, 20)},
	{"security.ip_ban_minutes", "integer", "security", "IP 封禁时长（分钟）", "15", true, false, integer(1, 1440)},
	{"security.user_idle_minutes", "integer", "security", "用户端空闲超时（分钟）", "1440", true, false, integer(1, 10080)},
	{"security.admin_idle_minutes", "integer", "security", "管理端空闲超时（分钟）", "360", true, false, integer(1, 10080)},
	{"security.admin_max_minutes", "integer", "security", "管理端最长登录时间（分钟）", "1440", true, false, integer(1, 10080)},
	{"security.force_admin_2fa", "boolean", "security", "强制管理员两步验证", "false", true, false, oneOf("true", "false")},
	{"security.force_user_2fa", "boolean", "security", "强制用户两步验证", "false", true, false, oneOf("true", "false")},
}

func Force2FA(values map[string]string, administrator bool) bool {
	key := "security.force_user_2fa"
	if administrator {
		key = "security.force_admin_2fa"
	}
	value, exists := values[key]
	if !exists {
		value = values["security.force_2fa"]
	}
	return value == "true"
}
