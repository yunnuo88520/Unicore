// Author: yunnuo <ymz@ebox.vip>
// Description: Product events reuse the encrypted, retried mail queue without exposing a public send API.
package mailer

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yunnuo/unicore/internal/settings"
)

type Notification struct{ To, Title, Detail string }

type NotificationStore interface {
	EnqueueNotification(ctx context.Context, encrypted, actor string, now, expires int) error
}

// Notify queues a trusted product event. An empty recipient uses the configured administrator mailbox.
func (s *Service) Notify(ctx context.Context, input Notification, actor string) error {
	if (input.To != "" && !settings.ValidEmail(input.To)) || strings.TrimSpace(input.Title) == "" || strings.ContainsAny(input.Title, "\r\n\x00") || !utf8.ValidString(input.Title+input.Detail) || utf8.RuneCountInString(input.Title) > 80 || strings.TrimSpace(input.Detail) == "" || utf8.RuneCountInString(input.Detail) > 2000 {
		return settings.ErrInvalid
	}
	store, ok := s.Store.(NotificationStore)
	if !ok {
		return ErrUnavailable
	}
	values, err := s.Settings.Raw(ctx)
	if err != nil {
		return err
	}
	if input.To == "" {
		input.To = values["site.admin_email"]
	}
	if !settings.ValidEmail(input.To) {
		return settings.ErrInvalid
	}
	if !settings.MailReady(values) {
		return settings.ErrMailNotReady
	}
	logo, err := s.Settings.Logo(ctx)
	if err != nil {
		return err
	}
	values["site.base_url"] = settings.MailBaseURL(values, s.BaseURL)
	message, err := RenderConfigured(values, "notification", "", input.To, false, logo, map[string]string{"title": input.Title, "detail": input.Detail})
	if err != nil {
		return err
	}
	payload := s.Encrypt(message)
	if len(payload) > 65535 {
		return settings.ErrInvalid
	}
	now := int(time.Now().Unix())
	return store.EnqueueNotification(ctx, payload, actor, now, now+24*60*60)
}
