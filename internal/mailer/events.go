// Author: yunnuo <ymz@ebox.vip>
// Description: Trusted product events plan independent email/channel deliveries on the durable queue.
package mailer

import (
	"context"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/notifycontent"
	"github.com/yunnuo/unicore/internal/settings"
	"time"
)

type Event struct {
	Kind, Username, Email, IP, Detail string
	Administrator                     bool
	At                                int
}
type ChannelSender interface {
	SendChannel(context.Context, map[string]string, Message) error
}

// Plan is pure: callers persist every encrypted result in the same transaction as the event.
func Plan(values map[string]string, event Event) ([]Message, error) {
	result := []Message{}
	c := settings.NotificationConfig(values)
	if !c.Enabled {
		return result, nil
	}
	var rule contracts.NotifyRule
	for _, r := range c.Rules {
		if r.Event == event.Kind {
			rule = r
		}
	}
	var template contracts.NotifyTemplate
	for _, t := range c.Templates {
		if t.Event == event.Kind {
			template = t
		}
	}
	if template.Event == "" {
		return result, notifycontent.ErrInvalid
	}
	vars := map[string]string{"site_name": values["site.name"], "site_url": values["site.base_url"], "username": event.Username, "ip": event.IP, "message": event.Detail, "event_time": time.Unix(int64(event.At), 0).UTC().Format(time.RFC3339)}
	rendered, err := notifycontent.Render(template, vars)
	if err != nil {
		return result, err
	}
	recipients := map[string]bool{}
	if settings.MailReady(values) {
		if rule.UserEmail && !event.Administrator && settings.ValidEmail(event.Email) {
			recipients[event.Email] = true
		}
		if rule.AdminEmail && settings.ValidEmail(values["site.admin_email"]) {
			recipients[values["site.admin_email"]] = true
		}
	}
	for to := range recipients {
		message, err := RenderConfigured(values, "notification", "", to, false, nil, map[string]string{"title": rendered.Title, "detail": rendered.Body})
		if err != nil {
			return nil, err
		}
		message.Event = event.Kind
		result = append(result, message)
	}
	if rule.AdminChannel && c.ChannelEnabled {
		result = append(result, Message{Subject: rendered.Title, Body: rendered.Body, Channel: c.Provider, Event: event.Kind})
	}
	return result, nil
}
func (s *Service) PreviewNotification(ctx context.Context, input contracts.NotifyTemplate) (contracts.NotifyPreview, error) {
	v, e := s.Settings.Raw(ctx)
	if e != nil {
		return contracts.NotifyPreview{}, e
	}
	return notifycontent.Render(input, map[string]string{"site_name": v["site.name"], "site_url": settings.MailBaseURL(v, s.BaseURL), "username": "example_user", "event_time": "2026-01-01T12:00:00Z", "ip": "203.0.113.10", "message": "这是一条通知预览 / This is a notification preview."})
}
func (s *Service) TestNotification(ctx context.Context, input contracts.NotifyTest, actor string) error {
	preview, e := s.PreviewNotification(ctx, input.Template)
	if e != nil {
		return settings.ErrInvalid
	}
	v, e := s.Settings.Raw(ctx)
	if e != nil {
		return e
	}
	msg := Message{To: input.Recipient, Subject: preview.Title, Body: preview.Body}
	if input.Destination == "email" {
		if !settings.ValidEmail(input.Recipient) || !settings.MailReady(v) {
			return settings.ErrMailNotReady
		}
		delivery, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		if s.Sender.Send(delivery, Configuration(v), msg) != nil {
			return ErrUnavailable
		}
		return nil
	}
	if input.Destination != "channel" || !settings.NotificationConfig(v).ChannelEnabled || s.Channels == nil {
		return settings.ErrInvalid
	}
	msg.Channel = settings.NotificationConfig(v).Provider
	if s.Channels.SendChannel(ctx, v, msg) != nil {
		return ErrUnavailable
	}
	return nil
}
