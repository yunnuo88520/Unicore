// Author: yunnuo <ymz@ebox.vip>
// Description: One renderer for editable previews, real account codes, notifications and SMTP tests.
package mailer

import (
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/assets/brand"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailcontent"
	"github.com/yunnuo/unicore/internal/settings"
	"strings"
	"time"
)

func RenderConfigured(values map[string]string, purpose, code, recipient string, preview bool, image []byte, extra map[string]string) (Message, error) {
	content, _, err := mailcontent.Read(values, purpose)
	if err != nil {
		return Message{}, err
	}
	variables := map[string]string{"site_name": values["site.name"], "site_url": values["site.base_url"], "code": code, "expires_minutes": "10", "title": "系统通知", "detail": "实例设置已更新，请查看操作日志。"}
	for key, value := range extra {
		variables[key] = value
	}
	if len(image) == 0 {
		image = brand.EmailLogo
	}
	title := mailcontent.Expand(content.Subject, variables, false)
	if strings.ContainsAny(title, "\r\n\x00") || len([]rune(title)) > 320 {
		return Message{}, mailcontent.ErrInvalid
	}
	body := mailcontent.Expand(content.Body, variables, true)

	// Validate expanded links as well, so substituted values cannot introduce active URLs.
	if mailcontent.ValidateHTML(body) != nil {
		return Message{}, mailcontent.ErrInvalid
	}
	result := renderContent(values["site.name"], values["site.copyright"], title, "", "", "这是一封系统自动邮件，如非本人操作，请通过站点的已知渠道联系管理员。", "", "账号与系统通知", recipient, preview, image, body, mailcontent.Plain(body))
	result.Subject = title
	return result, nil
}
func (s *Service) template(ctx context.Context, input contracts.MailTemplateInput, preview bool, recipient string) (contracts.MailTemplate, Message, error) {
	content := mailcontent.Template{Subject: input.Subject, Body: input.Body}
	if mailcontent.Validate(input.Purpose, content) != nil {
		return contracts.MailTemplate{}, Message{}, settings.ErrInvalid
	}
	values, e := s.Settings.Raw(ctx)
	if e != nil {
		return contracts.MailTemplate{}, Message{}, e
	}
	values["site.base_url"] = s.BaseURL
	data, _ := encodeTemplate(content)
	values[mailcontent.Key(input.Purpose)] = data
	logo, e := s.Settings.Logo(ctx)
	if e != nil {
		return contracts.MailTemplate{}, Message{}, e
	}
	message, e := RenderConfigured(values, input.Purpose, "654321", recipient, preview, logo, nil)
	if e != nil {
		return contracts.MailTemplate{}, Message{}, settings.ErrInvalid
	}
	variables := []contracts.MailTemplateVariable{}
	samples := map[string]string{"site_name": values["site.name"], "site_url": s.BaseURL, "code": "654321", "expires_minutes": "10", "title": "系统通知", "detail": "实例设置已更新，请查看操作日志。"}
	for _, key := range mailcontent.Variables(input.Purpose) {
		variables = append(variables, contracts.MailTemplateVariable{Key: key, Sample: samples[key]})
	}
	return contracts.MailTemplate{Purpose: input.Purpose, Subject: input.Subject, Body: input.Body, Html: message.HTML, Text: message.Body, Variables: variables}, message, e
}
func (s *Service) Templates(ctx context.Context) (contracts.MailTemplateList, error) {
	result := contracts.MailTemplateList{Items: []contracts.MailTemplate{}}
	values, e := s.Settings.Raw(ctx)
	if e != nil {
		return result, e
	}
	for _, p := range mailcontent.Purposes {
		v, custom, e := mailcontent.Read(values, p)
		if e != nil {
			return result, e
		}
		item, _, e := s.template(ctx, contracts.MailTemplateInput{Purpose: p, Subject: v.Subject, Body: v.Body}, true, "")
		if e != nil {
			return result, e
		}
		item.Customized = custom
		result.Items = append(result.Items, item)
	}
	return result, nil
}
func (s *Service) PreviewTemplate(ctx context.Context, input contracts.MailTemplateInput) (contracts.MailTemplate, error) {
	v, _, e := s.template(ctx, input, true, "")
	return v, e
}
func (s *Service) TestTemplate(ctx context.Context, input contracts.MailTemplateTestInput) error {
	if !settings.ValidEmail(input.Recipient) {
		return settings.ErrInvalid
	}
	values, e := s.Settings.Raw(ctx)
	if e != nil {
		return e
	}
	if !settings.MailReady(values) {
		return settings.ErrMailNotReady
	}
	_, m, e := s.template(ctx, input.Template, false, input.Recipient)
	if e != nil {
		return e
	}
	delivery, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if e = s.Sender.Send(delivery, Configuration(values), m); e != nil {
		return ErrUnavailable
	}
	return nil
}

func encodeTemplate(v mailcontent.Template) (string, error) {
	data, e := json.Marshal(v)
	return string(data), e
}
