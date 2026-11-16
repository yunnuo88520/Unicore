// Author: yunnuo <ymz@ebox.vip>
// Description: Persistent mail delivery port with encrypted payloads and bounded retries.
package mailer

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/settings"
)

type Message struct {
	To, Subject, Body, HTML, FromName string
	Channel, Event                    string `json:",omitempty"`
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

// Stable delivery failure codes persisted in unicore_mail_jobs.last_error and
// documented in docs/03-runbooks/notifications.md; every value fits the 32
// character column. Retryable codes keep the existing backoff, the rest stop
// retrying instead of burning attempts on a send that cannot succeed.
const (
	FailureTimeout            = "TIMEOUT"
	FailurePayloadInvalid     = "PAYLOAD_INVALID"
	FailureConfigNotReady     = "CONFIG_NOT_READY"
	FailureDeliveryFailed     = "DELIVERY_FAILED"
	FailureSMTPAuth           = "SMTP_AUTH_FAILED"
	FailureSMTPRejected       = "SMTP_REJECTED"
	FailureSMTPUnavailable    = "SMTP_UNAVAILABLE"
	FailureSMTPConfigInvalid  = "SMTP_CONFIG_INVALID"
	FailureChannelRateLimited = "CHANNEL_RATE_LIMITED"
	FailureChannelRejected    = "CHANNEL_REJECTED"
	FailureChannelInvalid     = "CHANNEL_INVALID"
	FailureChannelUnavailable = "CHANNEL_UNAVAILABLE"
)

// DeliveryFailure is the structured outcome of one send attempt. Senders
// return it as their error; Tick extracts it with AsDeliveryFailure and the
// store persists only the stable code — raw transport errors never reach the
// database.
type DeliveryFailure struct {
	Code      string
	Retryable bool
	// Detail is an optional short sanitized note for logs; only Code is
	// persisted on the mail job.
	Detail string
}

func (f *DeliveryFailure) Error() string {
	if f == nil {
		return "<nil>"
	}
	if f.Detail != "" {
		return f.Code + ": " + f.Detail
	}
	return f.Code
}

// AsDeliveryFailure maps a sender error to the structured outcome.
// Unclassified errors stay retryable under the legacy generic code, so an
// unknown transport degrades to today's retry behavior instead of dying early.
func AsDeliveryFailure(err error) *DeliveryFailure {
	if err == nil {
		return nil
	}
	var failure *DeliveryFailure
	if errors.As(err, &failure) {
		return failure
	}
	return &DeliveryFailure{Code: FailureDeliveryFailed, Retryable: true}
}

type Job struct {
	ID, Payload, Lease string
	Attempts, Expires  int
	Cancelled          bool
	// CancelReason and Failure travel from Tick to the store in memory only;
	// the durable record keeps the stable code strings.
	CancelReason string
	Failure      *DeliveryFailure
}
type Store interface {
	ClaimMails(context.Context, int, int) ([]Job, error)
	FinishMail(context.Context, Job, bool, int) error
	MailJobs(context.Context) (contracts.MailJobList, error)
}

var ErrUnavailable = errors.New("mail delivery unavailable")

type Service struct {
	BaseURL  string
	Store    Store
	Settings *settings.Service
	Secrets  Secrets
	Sender   Sender
	Channels ChannelSender
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
	values["site.base_url"] = settings.MailBaseURL(values, s.BaseURL)
	message, err := RenderConfigured(values, "test", "", recipient, false, logo, nil)
	if err != nil {
		return err
	}
	if err = s.Sender.Send(ctx, Configuration(values), message); err != nil {
		return ErrUnavailable
	}
	return s.Settings.MarkMailTested(ctx, settings.MailFingerprint(values), actor)
}

// Tick claims up to eight leased jobs and delivers them with bounded
// concurrency: account mail (codes, verification) always claims before event
// notifications, and each channel keeps at most one in-flight request so a
// slow webhook cannot occupy every worker. Delivery is at least once across a
// process crash.
func (s *Service) Tick(ctx context.Context, now int) error {
	jobs, err := s.Store.ClaimMails(ctx, now, 8)
	if err != nil || len(jobs) == 0 {
		return err
	}
	values, configErr := s.Settings.Raw(ctx)
	var wg sync.WaitGroup
	slots := make(chan struct{}, 4)
	var lockMu sync.Mutex
	channelLocks := map[string]*sync.Mutex{}
	for _, job := range jobs {
		wg.Add(1)
		slots <- struct{}{}
		go func(job Job) {
			defer wg.Done()
			defer func() { <-slots }()
			s.deliver(ctx, job, values, configErr, now, &lockMu, channelLocks)
		}(job)
	}
	wg.Wait()
	return nil
}

// deliver resolves one job's outcome and finishes it. A cancelled shutdown
// leaves the lease for recovery rather than discarding work.
func (s *Service) deliver(ctx context.Context, job Job, values map[string]string, configErr error, now int, lockMu *sync.Mutex, channelLocks map[string]*sync.Mutex) {
	delivered := false
	var failure *DeliveryFailure
	var send func(delivery context.Context) error
	channelKey := ""
	switch {
	case configErr != nil:
		failure = &DeliveryFailure{Code: FailureConfigNotReady, Retryable: true}
	default:
		payload, openErr := s.Secrets.Open(job.Payload)
		var message Message
		if openErr != nil || json.Unmarshal([]byte(payload), &message) != nil {
			failure = &DeliveryFailure{Code: FailurePayloadInvalid}
		} else {
			c := settings.NotificationConfig(values)
			disabled := message.Event != "" && !c.Enabled
			if message.Channel != "" {
				disabled = disabled || !c.ChannelEnabled || c.Provider != message.Channel
			}
			switch {
			case disabled:
				job.Cancelled = true
				job.CancelReason = cancelReason(message, c)
				delivered = true
			case message.Channel != "":
				if s.Channels == nil {
					failure = &DeliveryFailure{Code: FailureConfigNotReady, Retryable: true}
				} else {
					channelKey = "channel:" + message.Channel
					send = func(delivery context.Context) error { return s.Channels.SendChannel(delivery, values, message) }
				}
			case settings.MailReady(values):
				channelKey = "mail"
				send = func(delivery context.Context) error { return s.Sender.Send(delivery, Configuration(values), message) }
			default:
				failure = &DeliveryFailure{Code: FailureConfigNotReady, Retryable: true}
			}
		}
	}
	if send != nil {
		lockMu.Lock()
		lock, loaded := channelLocks[channelKey]
		if !loaded {
			lock = &sync.Mutex{}
			channelLocks[channelKey] = lock
		}
		lockMu.Unlock()
		lock.Lock()
		delivery, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := send(delivery)
		cancel()
		lock.Unlock()
		failure = AsDeliveryFailure(err)
		delivered = err == nil
	}
	if ctx.Err() != nil {
		return
	}
	// The verdict carries the stable failure code so the store can persist why
	// a row failed and whether it will be retried.
	job.Failure = failure
	// A failed finish leaves the lease; the next tick reclaims and retries.
	_ = s.Store.FinishMail(ctx, job, delivered, now)
}

// cancelReason distinguishes configuration-driven cancellations so the admin
// job list never mislabels a deliberate stop as a delivery failure.
func cancelReason(message Message, c contracts.NotifyConfiguration) string {
	if message.Event != "" && !c.Enabled {
		return "MASTER_DISABLED"
	}
	if message.Channel != "" && !c.ChannelEnabled {
		return "CHANNEL_DISABLED"
	}
	return "PROVIDER_CHANGED"
}
