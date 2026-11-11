// Author: yunnuo <ymz@ebox.vip>
// Description: Trusted product events plan independent email/channel deliveries on the durable queue.
package mailer

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/notifycontent"
	"github.com/yunnuo/unicore/internal/settings"
	"time"
)

type Event struct {
	Kind, Username, Email, IP, Detail string
	Administrator                     bool
	At                                int
	// Vars carries extra template variables merged over the base set.
	Vars map[string]string
}
type ChannelSender interface {
	SendChannel(context.Context, map[string]string, Message) error
}

// ErrNotConfigured reports that no delivery surface exists for an event: the
// matrix is enabled but mail is not ready and the channel is disabled or
// lacks credentials.
var ErrNotConfigured = errors.New("notification channel not configured")

// Plan is pure: callers persist every encrypted result in the same transaction as the event.
// The matrix master switch uniformly governs every event notification, alert
// events included; transactional mail without an Event marker is unrelated.
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
	for key, value := range event.Vars {
		vars[key] = value
	}
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

// EnqueueEvent plans one trusted product event and persists every delivery on
// the durable queue with the shared "monitor" attribution. An off master
// switch intentionally silences every event notification; an on switch with
// no deliverable surface is reported so the caller can record the failure.
func (s *Service) EnqueueEvent(ctx context.Context, event Event) error {
	store, ok := s.Store.(NotificationStore)
	if !ok {
		return ErrUnavailable
	}
	values, err := s.Settings.Raw(ctx)
	if err != nil {
		return err
	}
	values["site.base_url"] = settings.MailBaseURL(values, s.BaseURL)
	c := settings.NotificationConfig(values)
	if !c.Enabled {
		return nil
	}
	messages, err := Plan(values, event)
	if err != nil {
		return err
	}
	if len(messages) == 0 && !settings.MailReady(values) {
		if !c.ChannelEnabled || (!c.WecomConfigured && !c.WebhookConfigured) {
			return ErrNotConfigured
		}
	}
	payloads := make([]string, 0, len(messages))
	for _, message := range messages {
		payload := s.Encrypt(message)
		if len(payload) > 65535 {
			return settings.ErrInvalid
		}
		payloads = append(payloads, payload)
	}
	now := int(time.Now().Unix())
	for _, payload := range payloads {
		if err = store.EnqueueNotification(ctx, payload, "monitor", now, now+24*60*60); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) PreviewNotification(ctx context.Context, input contracts.NotifyTemplate) (contracts.NotifyPreview, error) {
	v, e := s.Settings.Raw(ctx)
	if e != nil {
		return contracts.NotifyPreview{}, e
	}
	return notifycontent.Render(input, map[string]string{"site_name": v["site.name"], "site_url": settings.MailBaseURL(v, s.BaseURL), "username": "example_user", "event_time": "2026-01-01T12:00:00Z", "ip": "203.0.113.10", "message": "这是一条通知预览 / This is a notification preview.", "rule_name": "CPU 使用率过高", "severity": "warning", "metric": "cpu", "value": "91.0%", "threshold": "85", "scope": "host", "instance": "ab12cd34", "host": "monitor-host", "occurred_at": "2026-01-01T11:36:30Z", "duration": "23m30s", "transition": "triggered"})
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
