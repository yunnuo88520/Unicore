// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded registration restrictions shared by identity and profile flows.
package settings

import (
	"net/netip"
	"regexp"
	"strings"
)

var RegistrationDefinitions = []SettingDefinition{
	{"account.registration_enabled", "boolean", "registration", "开放注册", "false", true, false, oneOf("true", "false")},
	{"account.email_verification_required", "boolean", "registration", "注册邮箱验证", "false", true, false, oneOf("true", "false")},
	{"account.phone_required", "boolean", "registration", "注册绑定手机号", "false", true, false, oneOf("true", "false")},
	{"account.register_rate_minutes", "integer", "registration", "注册频率窗口（分钟）", "1", true, false, integer(1, 1440)},
	{"account.register_rate_max", "integer", "registration", "窗口内注册上限", "5", true, false, integer(1, 1000)},
	{"security.register_captcha", "boolean", "protection", "注册图形验证码", "true", true, false, oneOf("true", "false")},
	{"account.email_domain_mode", "string", "registration", "邮箱后缀限制模式", "unrestricted", true, false, oneOf("unrestricted", "allowlist", "blocklist")},
	{"account.email_domains", "string", "registration", "邮箱后缀列表", "", true, false, validDomains},
	{"account.nickname_blacklist", "string", "registration", "昵称黑名单", "", true, false, validList},
	{"account.username_blacklist", "string", "registration", "用户名黑名单", "", true, false, validList},
	{"account.password_blacklist", "string", "registration", "密码黑名单", "", true, false, validList},
	{"account.ip_blacklist", "string", "registration", "IP 黑名单", "", true, false, validIPs},
}

// PolicyLines normalizes configuration entries, never submitted passwords.
func PolicyLines(value string) []string {
	result := []string{}
	for _, line := range strings.Split(value, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			result = append(result, strings.ToLower(line))
		}
	}
	return result
}
func validList(value string) bool {
	return text(16000)(value) && len(PolicyLines(value)) <= 200 && !strings.ContainsAny(value, "\x00\r")
}

var domainPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$`)

func validDomains(value string) bool {
	if !validList(value) {
		return false
	}
	for _, domain := range PolicyLines(value) {
		if len(domain) > 253 || !domainPattern.MatchString(domain) {
			return false
		}
	}
	return true
}
func wildcardPrefix(value string) (netip.Prefix, bool) {
	parts := strings.Split(value, ".")
	if len(parts) != 4 {
		return netip.Prefix{}, false
	}
	first := 4
	for i, p := range parts {
		if p == "*" {
			if first == 4 {
				first = i
			}
			parts[i] = "0"
		} else if first != 4 {
			return netip.Prefix{}, false
		}
	}
	if first == 0 || first == 4 {
		return netip.Prefix{}, false
	}
	addr, err := netip.ParseAddr(strings.Join(parts, "."))
	if err != nil {
		return netip.Prefix{}, false
	}
	return netip.PrefixFrom(addr, first*8), true
}
func validIPs(value string) bool {
	if !validList(value) {
		return false
	}
	for _, entry := range PolicyLines(value) {
		if _, err := netip.ParseAddr(entry); err == nil {
			continue
		}
		if _, err := netip.ParsePrefix(entry); err == nil {
			continue
		}
		if _, ok := wildcardPrefix(entry); !ok {
			return false
		}
	}
	return true
}
func BlockedText(list, value string, exact bool) bool {
	value = strings.ToLower(value)
	for _, entry := range PolicyLines(list) {
		if (exact && value == entry) || (!exact && strings.Contains(value, entry)) {
			return true
		}
	}
	return false
}
func EmailAllowed(values map[string]string, email string) bool {
	_, domain, ok := strings.Cut(strings.ToLower(email), "@")
	if !ok {
		return false
	}
	match := false
	for _, entry := range PolicyLines(values["account.email_domains"]) {
		if domain == entry {
			match = true
			break
		}
	}
	switch values["account.email_domain_mode"] {
	case "allowlist":
		return match
	case "blocklist":
		return !match
	default:
		return true
	}
}
func IPBlocked(values map[string]string, ip string) bool {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return false
	}
	addr = addr.Unmap()
	for _, entry := range PolicyLines(values["account.ip_blacklist"]) {
		if parsed, err := netip.ParseAddr(entry); err == nil && parsed.Unmap() == addr {
			return true
		}
		if prefix, err := netip.ParsePrefix(entry); err == nil && prefix.Contains(addr) {
			return true
		}
		if prefix, ok := wildcardPrefix(entry); ok && prefix.Contains(addr) {
			return true
		}
	}
	return false
}
