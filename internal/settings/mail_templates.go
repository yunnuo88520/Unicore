// Author: yunnuo <ymz@ebox.vip>
// Description: Registered platform-only template configuration, updated atomically through the template service.
package settings

import (
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/mailcontent"
	"strings"
)

var MailTemplateDefinitions = func() []SettingDefinition {
	result := []SettingDefinition{}
	for _, purpose := range mailcontent.Purposes {
		p := purpose
		result = append(result, SettingDefinition{Key: mailcontent.Key(p), Type: "string", Group: "mail_template", Label: "邮件模板", Default: "", PlatformOnly: true, Validate: func(v string) bool {
			if v == "" {
				return true
			}
			var t mailcontent.Template
			return json.Unmarshal([]byte(v), &t) == nil && mailcontent.Validate(p, t) == nil
		}})
	}
	return result
}()

func ManagedMailTemplate(key string) bool { return strings.HasPrefix(key, "mail.template.") }
func (s *Service) SaveMailTemplate(ctx context.Context, purpose string, value *mailcontent.Template, actor string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Profile != "web-platform" || !mailcontent.Known(purpose) {
		return ErrInvalid
	}
	raw := ""
	if value != nil {
		if mailcontent.Validate(purpose, *value) != nil {
			return ErrInvalid
		}
		data, _ := json.Marshal(value)
		raw = string(data)
	}
	return s.Store.SaveSettings(audit.Target(ctx, "mail-template/"+purpose, func() string {
		if value == nil {
			return "defaults=restored"
		}
		return "fields=subject,body"
	}()), map[string]string{mailcontent.Key(purpose): raw}, actor)
}
