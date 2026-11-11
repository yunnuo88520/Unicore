// Author: yunnuo <ymz@ebox.vip>
// Description: Dedicated atomic notification settings with encrypted, write-only channel credentials.
package settings

import (
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/notifycontent"
	"strings"
)

var NotificationDefinitions = []SettingDefinition{
	{Key: "notifications.config", Type: "string", Group: "notifications", Label: "系统通知", Default: "", PlatformOnly: true, Validate: func(v string) bool {
		var c contracts.NotifyConfiguration
		return v == "" || json.Unmarshal([]byte(v), &c) == nil && notifycontent.ValidConfiguration(c)
	}},
	{Key: "notifications.wecom_key", Type: "string", Group: "notifications", Label: "企业微信机器人 Key", Default: "", PlatformOnly: true, Sensitive: true, Validate: text(512)},
	{Key: "notifications.webhook_url", Type: "string", Group: "notifications", Label: "通知回调地址", Default: "", PlatformOnly: true, Sensitive: true, Validate: func(v string) bool { return v == "" || ValidPublicLink(v) }},
	{Key: "notifications.signing_secret", Type: "string", Group: "notifications", Label: "通知签名密钥", Default: "", PlatformOnly: true, Sensitive: true, Validate: text(512)},
}

func ManagedNotification(key string) bool { return strings.HasPrefix(key, "notifications.") }
func NotificationConfig(values map[string]string) contracts.NotifyConfiguration {
	c := notifycontent.Defaults()
	if values["notifications.config"] != "" {
		_ = json.Unmarshal([]byte(values["notifications.config"]), &c)
		// Configurations saved before an event catalog extension keep their
		// stored rules; newly introduced events fall back to their defaults.
		c = notifycontent.MergeDefaults(c)
	}
	c.WecomConfigured = values["notifications.wecom_key"] != ""
	c.WebhookConfigured = values["notifications.webhook_url"] != ""
	c.SigningConfigured = values["notifications.signing_secret"] != ""
	return c
}
func (s *Service) Notifications(ctx context.Context) (contracts.NotifyConfiguration, error) {
	v, e := s.Raw(ctx)
	return NotificationConfig(v), e
}
func (s *Service) SaveNotifications(ctx context.Context, c contracts.NotifyConfiguration, actor string) (contracts.NotifyConfiguration, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Configurations submitted by pages that predate an event catalog
	// extension are completed with the defaults for missing known events;
	// stored customizations stay untouched and unknown events stay invalid.
	c = notifycontent.MergeDefaults(c)
	if s.Profile != "web-platform" || !notifycontent.ValidConfiguration(c) {
		return c, ErrInvalid
	}
	current, err := s.Raw(ctx)
	if err != nil {
		return c, err
	}
	changes := map[string]string{}
	inputs := []struct {
		key, value string
		clear      bool
	}{{"notifications.wecom_key", c.WecomKey, c.ClearWecomKey}, {"notifications.webhook_url", c.WebhookUrl, c.ClearWebhookUrl}, {"notifications.signing_secret", c.SigningSecret, c.ClearSigningSecret}}
	for _, i := range inputs {
		if i.clear && i.value != "" {
			return c, ErrInvalid
		}
		if i.value == "" && !i.clear {
			continue
		}
		for _, d := range NotificationDefinitions {
			if d.Key == i.key && !d.Validate(i.value) {
				return c, ErrInvalid
			}
		}
		current[i.key] = i.value
		changes[i.key] = ""
		if i.value != "" {
			if s.Secrets == nil {
				return c, ErrInvalid
			}
			changes[i.key] = s.Secrets.Seal(i.value)
		}
	}
	if c.ChannelEnabled && ((c.Provider == "wecom" && current["notifications.wecom_key"] == "") || (c.Provider == "webhook" && current["notifications.webhook_url"] == "")) {
		return c, ErrInvalid
	}
	c.WecomKey = ""
	c.WebhookUrl = ""
	c.SigningSecret = ""
	c.ClearWecomKey = false
	c.ClearWebhookUrl = false
	c.ClearSigningSecret = false
	c.WecomConfigured = false
	c.WebhookConfigured = false
	c.SigningConfigured = false
	raw, _ := json.Marshal(c)
	changes["notifications.config"] = string(raw)
	if s.NotificationWriter == nil {
		return c, ErrInvalid
	}
	if err = s.NotificationWriter.SaveNotificationSettings(audit.Target(ctx, "notification-settings", "configuration=updated"), changes, actor); err != nil {
		return c, err
	}
	return s.Notifications(ctx)
}
