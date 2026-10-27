// Author: yunnuo <ymz@ebox.vip>
// Description: Persistent mail delivery port with encrypted payloads and bounded retries.
package mailer

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/settings"
)

type Message struct {
	To, Subject, Body, HTML, FromName string
	Logo                              []byte `json:",omitempty"`
}
type Config struct{ Host, Port, TLS, From, FromName, Username, Password string }
type Sender interface {
	Send(context.Context, Config, Message) error
}
type Secrets interface {
	Seal(string) string
	Digest(string) string
	Open(string) (string, error)
}
type Job struct {
	ID, Payload, Lease string
	Attempts, Expires  int
}
type Store interface {
	ClaimMail(context.Context, int) (Job, error)
	FinishMail(context.Context, Job, bool, int) error
	MailJobs(context.Context) (contracts.MailJobList, error)
}

var ErrUnavailable = errors.New("mail delivery unavailable")

type Service struct {
	Store    Store
	Settings *settings.Service
	Secrets  Secrets
	Sender   Sender
}

func Configuration(values map[string]string) Config {
	return Config{Host: values["mail.host"], Port: values["mail.port"], TLS: values["mail.tls"], From: values["mail.from"], FromName: values["mail.from_name"], Username: values["mail.username"], Password: values["mail.password"]}
}
func (s *Service) Encrypt(message Message) string {
	data, _ := json.Marshal(message)
	return s.Secrets.Seal(string(data))
}
func (s *Service) Test(ctx context.Context, recipient, actor string) error {
	if !settings.ValidEmail(recipient) {
		return settings.ErrInvalid
	}
	values, err := s.Settings.Raw(ctx)
	if err != nil {
		return err
	}
	if !settings.MailConfigured(values) {
		return settings.ErrMailNotReady
	}
	logo, err := s.Settings.Logo(ctx)
	if err != nil {
		return err
	}
	if err = s.Sender.Send(ctx, Configuration(values), Render(values["site.name"], values["site.copyright"], "test", "", recipient, false, logo)); err != nil {
		return ErrUnavailable
	}
	return s.Settings.MarkMailTested(ctx, settings.MailFingerprint(values), actor)
}

// Tick claims one job with a lease. Delivery is at least once across a process crash.
func (s *Service) Tick(ctx context.Context, now int) error {
	job, err := s.Store.ClaimMail(ctx, now)
	if err != nil || job.ID == "" {
		return err
	}
	delivered := false
	values, configErr := s.Settings.Raw(ctx)
	if configErr == nil && settings.MailReady(values) {
		payload, openErr := s.Secrets.Open(job.Payload)
		var message Message
		if openErr == nil && json.Unmarshal([]byte(payload), &message) == nil {
			delivery, cancel := context.WithTimeout(ctx, 10*time.Second)
			delivered = s.Sender.Send(delivery, Configuration(values), message) == nil
			cancel()
		}
	}
	// A cancelled process leaves the lease for recovery rather than discarding work.
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return s.Store.FinishMail(ctx, job, delivered, now)
}
