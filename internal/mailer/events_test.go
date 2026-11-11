// Author: yunnuo <ymz@ebox.vip>
package mailer

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/notifycontent"
	"github.com/yunnuo/unicore/internal/settings"
)

func TestEventRouting(t *testing.T) {
	v := settings.Defaults("web-platform")
	v["mail.host"] = "smtp.example.test"
	v["mail.from"] = "from@example.test"
	v["mail.verified_fingerprint"] = settings.MailFingerprint(v)
	v["site.admin_email"] = "admin@example.test"
	c := notifycontent.Defaults()
	c.Enabled = true
	c.ChannelEnabled = true
	c.Provider = "webhook"
	for i := range c.Rules {
		if c.Rules[i].Event == "password_changed" {
			c.Rules[i].UserEmail = true
			c.Rules[i].AdminEmail = true
			c.Rules[i].AdminChannel = true
		}
	}
	raw, _ := json.Marshal(c)
	v["notifications.config"] = string(raw)
	event := Event{Kind: "password_changed", Username: "member", Email: "member@example.test", At: 1}
	got, err := Plan(v, event)
	if err != nil || len(got) != 3 {
		t.Fatalf("routing %d %v", len(got), err)
	}
	event.Administrator = true
	got, err = Plan(v, event)
	if err != nil || len(got) != 2 {
		t.Fatalf("admin got member copy %d %v", len(got), err)
	}
	v["mail.verified_fingerprint"] = ""
	got, err = Plan(v, event)
	if err != nil || len(got) != 1 || got[0].Channel != "webhook" {
		t.Fatal("SMTP should not block channel")
	}
	c.Enabled = false
	raw, _ = json.Marshal(c)
	v["notifications.config"] = string(raw)
	got, err = Plan(v, event)
	if err != nil || len(got) != 0 {
		t.Fatal("master switch ignored")
	}
}

type queueStore struct {
	actors    []string
	payloads  []string
	failAfter int // when > 0, the Nth enqueue fails after that many successes
}

func (s *queueStore) ClaimMail(context.Context, int) (Job, error) { return Job{}, nil }
func (s *queueStore) FinishMail(context.Context, Job, bool, int) error {
	return nil
}
func (s *queueStore) MailJobs(context.Context) (contracts.MailJobList, error) {
	return contracts.MailJobList{}, nil
}
func (s *queueStore) EnqueueNotification(_ context.Context, encrypted, actor string, _, _ int) error {
	if s.failAfter > 0 && len(s.payloads) >= s.failAfter {
		return errors.New("enqueue failed")
	}
	s.actors = append(s.actors, actor)
	s.payloads = append(s.payloads, encrypted)
	return nil
}

func (s *queueStore) EnqueueNotifications(_ context.Context, messages []QueuedNotification, actor string, _, _ int) error {
	if s.failAfter > 0 && len(messages) > s.failAfter {
		return errors.New("batch enqueue failed")
	}
	for _, message := range messages {
		s.actors = append(s.actors, actor)
		s.payloads = append(s.payloads, message.Payload)
	}
	return nil
}

type mapSettingsStore struct{ values map[string]string }

func (m *mapSettingsStore) ReadSettings(context.Context) (map[string]string, error) {
	return m.values, nil
}
func (m *mapSettingsStore) SaveSettings(context.Context, map[string]string, string) error {
	return nil
}

type sealSecrets struct{}

func (sealSecrets) Seal(v string) string          { return "sealed:" + v }
func (sealSecrets) Digest(string) string          { return "" }
func (sealSecrets) Open(v string) (string, error) { return strings.TrimPrefix(v, "sealed:"), nil }

func platformValues() map[string]string {
	v := settings.Defaults("web-platform")
	v["mail.host"] = "smtp.example.test"
	v["mail.from"] = "from@example.test"
	v["mail.verified_fingerprint"] = settings.MailFingerprint(v)
	v["site.admin_email"] = "admin@example.test"
	return v
}

func alertVars() map[string]string {
	return map[string]string{"rule_name": "CPU 使用率过高", "severity": "warning", "metric": "cpu", "value": "91.0%", "threshold": "85", "scope": "host", "instance": "ab12cd34", "host": "mini", "transition": "triggered", "occurred_at": "2026-11-11T04:00:00Z", "duration": ""}
}

func TestAlertEventsRespectMasterSwitch(t *testing.T) {
	v := platformValues()
	c := notifycontent.Defaults() // master switch stays off
	raw, _ := json.Marshal(c)
	v["notifications.config"] = string(raw)
	for _, kind := range []string{"login", "alert_triggered", "alert_recovered"} {
		got, err := Plan(v, Event{Kind: kind, At: 1})
		if err != nil || len(got) != 0 {
			t.Fatalf("%s must respect the master switch like every event: %d %v", kind, len(got), err)
		}
	}
	// With the switch on, the default alert routing notifies the administrator
	// by email only; the channel requires the explicit admin-channel toggle.
	c = notifycontent.Defaults()
	c.Enabled = true
	raw, _ = json.Marshal(c)
	v["notifications.config"] = string(raw)
	got, err := Plan(v, Event{Kind: "alert_triggered", At: 1, Detail: "rule=cpu_high", Vars: alertVars()})
	if err != nil || len(got) != 1 {
		t.Fatalf("enabled matrix must deliver the alert baseline: %d %v", len(got), err)
	}
	if got[0].Event != "alert_triggered" || got[0].To != "admin@example.test" || got[0].Channel != "" {
		t.Fatalf("alert email must carry its event marker and target the admin: %+v", got[0])
	}
}

func TestAlertChannelOptInAndVars(t *testing.T) {
	v := platformValues()
	c := notifycontent.Defaults()
	c.Enabled = true
	c.ChannelEnabled = true
	c.Provider = "webhook"
	for i := range c.Rules {
		if c.Rules[i].Event == "alert_triggered" {
			c.Rules[i].AdminChannel = true
		}
	}
	raw, _ := json.Marshal(c)
	v["notifications.config"] = string(raw)
	got, err := Plan(v, Event{Kind: "alert_triggered", At: 1, Detail: "rule=cpu_high", Vars: alertVars()})
	if err != nil || len(got) != 2 {
		t.Fatalf("admin email plus opted-in channel: %d %v", len(got), err)
	}
	if got[1].Channel != "webhook" || got[1].Event != "alert_triggered" {
		t.Fatalf("channel message must keep the event marker: %+v", got[1])
	}
	if !strings.Contains(got[1].Body, "CPU 使用率过高") || !strings.Contains(got[1].Body, "91.0%") || !strings.Contains(got[1].Body, "warning") {
		t.Fatalf("alert template vars must render: %s", got[1].Body)
	}
}

func TestEnqueueEventSurfaces(t *testing.T) {
	// Master switch off: an intentional silence for every event, no failures.
	v := platformValues()
	raw, _ := json.Marshal(notifycontent.Defaults())
	v["notifications.config"] = string(raw)
	store := &queueStore{}
	svc := &Service{Store: store, Settings: newTestSettings(v), Secrets: sealSecrets{}}
	if err := svc.EnqueueEvent(context.Background(), Event{Kind: "alert_triggered", At: 1, Vars: alertVars()}); err != nil || len(store.payloads) != 0 {
		t.Fatalf("off switch must silence without failure: %v %d", err, len(store.payloads))
	}
	// Switch on, mail ready: one admin email with the event marker.
	v = platformValues()
	c := notifycontent.Defaults()
	c.Enabled = true
	raw, _ = json.Marshal(c)
	v["notifications.config"] = string(raw)
	svc.Settings = newTestSettings(v)
	if err := svc.EnqueueEvent(context.Background(), Event{Kind: "alert_recovered", At: 1, Detail: "rule=cpu_high", Vars: alertVars()}); err != nil {
		t.Fatalf("ready mail must enqueue: %v", err)
	}
	if len(store.payloads) != 1 || store.actors[0] != "notification" {
		t.Fatalf("one admin email expected with notification attribution: %d %v", len(store.payloads), store.actors)
	}
	payload, _ := svc.Secrets.Open(store.payloads[0])
	var message Message
	if json.Unmarshal([]byte(payload), &message) != nil || message.To != "admin@example.test" || message.Event != "alert_recovered" {
		t.Fatalf("queued payload must decode to the marked admin email: %+v", message)
	}
	// Switch on, mail not ready, channel absent: report the dead surface.
	v = settings.Defaults("web-platform")
	c = notifycontent.Defaults()
	c.Enabled = true
	raw, _ = json.Marshal(c)
	v["notifications.config"] = string(raw)
	svc.Settings = newTestSettings(v)
	if err := svc.EnqueueEvent(context.Background(), Event{Kind: "alert_triggered", At: 1, Vars: alertVars()}); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("no deliverable surface must report not-configured: %v", err)
	}
	// Switch on, mail not ready, channel configured and enabled but the alert
	// rule keeps the channel off: a deliberate no-subscriber silence.
	v["notifications.wecom_key"] = "seed-key"
	c = notifycontent.Defaults()
	c.Enabled = true
	c.ChannelEnabled = true
	c.Provider = "wecom"
	raw, _ = json.Marshal(c)
	v["notifications.config"] = string(raw)
	svc.Settings = newTestSettings(v)
	if err := svc.EnqueueEvent(context.Background(), Event{Kind: "alert_triggered", At: 1, Vars: alertVars()}); err != nil || len(store.payloads) != 1 {
		t.Fatalf("channel opt-out must stay silent: %v %d", err, len(store.payloads))
	}
	// Opting the alert into the channel queues exactly one wecom row.
	for i := range c.Rules {
		if c.Rules[i].Event == "alert_triggered" {
			c.Rules[i].AdminChannel = true
		}
	}
	raw, _ = json.Marshal(c)
	v["notifications.config"] = string(raw)
	svc.Settings = newTestSettings(v)
	if err := svc.EnqueueEvent(context.Background(), Event{Kind: "alert_triggered", At: 1, Vars: alertVars()}); err != nil {
		t.Fatalf("channel-only surface must enqueue: %v", err)
	}
	if len(store.payloads) != 2 {
		t.Fatalf("channel row expected: %d", len(store.payloads))
	}
	payload, _ = svc.Secrets.Open(store.payloads[1])
	if json.Unmarshal([]byte(payload), &message) != nil || message.Channel != "wecom" {
		t.Fatalf("queued payload must decode to the channel message: %+v", message)
	}
}

func TestEnqueueEventPartialFailure(t *testing.T) {
	v := platformValues()
	c := notifycontent.Defaults()
	c.Enabled = true
	c.ChannelEnabled = true
	c.Provider = "webhook"
	for i := range c.Rules {
		if c.Rules[i].Event == "alert_triggered" {
			c.Rules[i].AdminChannel = true
		}
	}
	raw, _ := json.Marshal(c)
	v["notifications.config"] = string(raw)
	store := &queueStore{failAfter: 1}
	svc := &Service{Store: store, Settings: newTestSettings(v), Secrets: sealSecrets{}}
	err := svc.EnqueueEvent(context.Background(), Event{Kind: "alert_triggered", At: 1, Vars: alertVars()})
	if err == nil || len(store.payloads) != 0 {
		t.Fatalf("failed batch must leave no partial deliveries: %d %v", len(store.payloads), err)
	}
}

// TestTickIndependentDelivery proves per-row outcomes: a failing email row and
// succeeding channel rows never mask each other, and each failed row stays
// retryable through its own FinishMail verdict.
func TestTickIndependentDelivery(t *testing.T) {
	v := platformValues()
	v["notifications.wecom_key"] = "seed-key"
	c := notifycontent.Defaults()
	c.Enabled = true
	c.ChannelEnabled = true
	c.Provider = "wecom"
	raw, _ := json.Marshal(c)
	v["notifications.config"] = string(raw)
	svc := &Service{Store: &sequenceStore{}, Settings: newTestSettings(v), Secrets: sealSecrets{},
		Sender: failSender{}, Channels: okChannels{}, BaseURL: "https://unicore.test"}
	rows := []Message{
		{To: "admin@example.test", Subject: "alert", Body: "b", Event: "alert_triggered"},
		{Subject: "alert", Body: "b", Channel: "wecom", Event: "alert_triggered"},
		{Subject: "alert", Body: "b", Channel: "wecom", Event: "alert_recovered"},
	}
	store := svc.Store.(*sequenceStore)
	for _, m := range rows {
		store.enqueue(svc.Encrypt(m))
	}
	for i := 0; i < len(rows); i++ {
		if err := svc.Tick(context.Background(), 1000+i); err != nil {
			t.Fatalf("tick %d: %v", i, err)
		}
	}
	if len(store.verdicts) != 3 {
		t.Fatalf("three independent verdicts expected: %v", store.verdicts)
	}
	if store.verdicts[0].delivered {
		t.Fatal("the failing SMTP row must not be reported delivered")
	}
	if !store.verdicts[1].delivered || !store.verdicts[2].delivered {
		t.Fatal("channel rows must deliver independently of the SMTP failure")
	}
	// The failed row stays alive for its own retry; successes are finished.
	if store.verdicts[0].cancelled || store.verdicts[1].cancelled {
		t.Fatal("delivery failures must retry, not cancel")
	}
}

type sequenceStore struct {
	actors   []string
	payloads []string
	jobs     []Job
	verdicts []struct {
		id        string
		delivered bool
		cancelled bool
	}
}

func (s *sequenceStore) enqueue(payload string) {
	s.jobs = append(s.jobs, Job{ID: "job-" + string(rune('a'+len(s.jobs))), Payload: payload})
}
func (s *sequenceStore) ClaimMail(_ context.Context, _ int) (Job, error) {
	if len(s.jobs) == 0 {
		return Job{}, nil
	}
	job := s.jobs[0]
	s.jobs = s.jobs[1:]
	return job, nil
}
func (s *sequenceStore) FinishMail(_ context.Context, job Job, delivered bool, _ int) error {
	s.verdicts = append(s.verdicts, struct {
		id        string
		delivered bool
		cancelled bool
	}{job.ID, delivered, job.Cancelled})
	return nil
}
func (s *sequenceStore) MailJobs(context.Context) (contracts.MailJobList, error) {
	return contracts.MailJobList{}, nil
}
func (s *sequenceStore) EnqueueNotification(_ context.Context, encrypted, actor string, _, _ int) error {
	s.actors = append(s.actors, actor)
	s.payloads = append(s.payloads, encrypted)
	return nil
}

type failSender struct{}

func (failSender) Send(context.Context, Config, Message) error { return errors.New("smtp down") }

type okChannels struct{}

func (okChannels) SendChannel(context.Context, map[string]string, Message) error { return nil }

// newTestSettings wires a settings service whose secrets round-trip through
// sealSecrets, matching production where sensitive values are encrypted.
func newTestSettings(v map[string]string) *settings.Service {
	return &settings.Service{Store: &mapSettingsStore{values: v}, Profile: "web-platform", Secrets: sealSecrets{}}
}

// TestAlertEmailEscapesTemplateValues locks the HTML boundary: alert values
// render through the notification mail shell, whose HTML body must escape
// them; the plain-text body keeps the raw characters on purpose.
func TestAlertEmailEscapesTemplateValues(t *testing.T) {
	v := platformValues()
	c := notifycontent.Defaults()
	c.Enabled = true
	raw, _ := json.Marshal(c)
	v["notifications.config"] = string(raw)
	vars := alertVars()
	vars["rule_name"] = "CPU <b>高</b> & 负载"
	got, err := Plan(v, Event{Kind: "alert_triggered", At: 1, Detail: "rule=cpu_high", Vars: vars})
	if err != nil || len(got) != 1 {
		t.Fatalf("baseline alert email: %d %v", len(got), err)
	}
	if strings.Contains(got[0].HTML, "<b>高") || !strings.Contains(got[0].HTML, "&lt;b&gt;") {
		t.Fatal("alert values must be HTML-escaped in the mail HTML body")
	}
	if !strings.Contains(got[0].Body, "CPU <b>高</b> & 负载") {
		t.Fatal("the plain-text body keeps the raw characters")
	}
}

// Each explicit test destination owns its sender, error classification and payload.
type destinationCapture struct {
	emails, channels []Message
	fail             bool
}

func (c *destinationCapture) Send(_ context.Context, _ Config, m Message) error {
	c.emails = append(c.emails, m)
	if c.fail {
		return errors.New("synthetic SMTP failure")
	}
	return nil
}
func (c *destinationCapture) SendChannel(_ context.Context, _ map[string]string, m Message) error {
	c.channels = append(c.channels, m)
	if c.fail {
		return errors.New("synthetic channel failure")
	}
	return nil
}
func TestNotificationTestDestinationIsolation(t *testing.T) {
	v := platformValues()
	v["notifications.wecom_key"] = "synthetic"
	c := notifycontent.Defaults()
	c.ChannelEnabled = true
	raw, _ := json.Marshal(c)
	v["notifications.config"] = string(raw)
	capture := &destinationCapture{fail: true}
	svc := &Service{Settings: newTestSettings(v), Sender: capture, Channels: capture}
	input := contracts.NotifyTest{Template: c.Templates[0], Destination: "channel", Recipient: "ignored@example.test"}
	if err := svc.TestNotification(context.Background(), input, "admin"); !errors.Is(err, ErrChannelUnavailable) {
		t.Fatalf("channel failure misclassified: %v", err)
	}
	if len(capture.emails) != 0 || len(capture.channels) != 1 || capture.channels[0].To != "" || capture.channels[0].Event != "login" {
		t.Fatal("channel must never call SMTP or use an email recipient")
	}
	input.Destination = "email"
	input.Recipient = "test@example.test"
	if err := svc.TestNotification(context.Background(), input, "admin"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("mail failure misclassified: %v", err)
	}
	if len(capture.emails) != 1 || len(capture.channels) != 1 || capture.emails[0].HTML == "" || capture.emails[0].To != input.Recipient {
		t.Fatal("email must use its rendered mail shell and only SMTP")
	}
	capture.fail = false
	input.Destination = "channel"
	delete(v, "mail.verified_fingerprint")
	svc.Settings = newTestSettings(v)
	if err := svc.TestNotification(context.Background(), input, "admin"); err != nil {
		t.Fatalf("channel must work without SMTP: %v", err)
	}
	delete(v, "notifications.wecom_key")
	svc.Settings = newTestSettings(v)
	if err := svc.TestNotification(context.Background(), input, "admin"); !errors.Is(err, ErrChannelNotReady) {
		t.Fatalf("missing channel credential: %v", err)
	}
}
func TestEventVariablesCannotOverrideCommonValues(t *testing.T) {
	v := platformValues()
	c := notifycontent.Defaults()
	c.Enabled = true
	raw, _ := json.Marshal(c)
	v["notifications.config"] = string(raw)
	if _, err := Plan(v, Event{Kind: "password_changed", Vars: map[string]string{"site_url": "https://spoof.example.test"}}); err == nil {
		t.Fatal("common variables may not be replaced")
	}
}

func TestOptedOutEventDoesNotRequireDeliveryConfiguration(t *testing.T) {
	v := settings.Defaults("web-platform")
	c := notifycontent.Defaults()
	c.Enabled = true
	for i := range c.Rules {
		if c.Rules[i].Event == "password_changed" {
			c.Rules[i] = contracts.NotifyRule{Event: "password_changed"}
		}
	}
	raw, _ := json.Marshal(c)
	v["notifications.config"] = string(raw)
	store := &queueStore{}
	svc := &Service{Store: store, Settings: newTestSettings(v), Secrets: sealSecrets{}}
	if err := svc.EnqueueEvent(context.Background(), Event{Kind: "password_changed"}); err != nil || len(store.payloads) != 0 {
		t.Fatalf("explicit opt-out should remain silent: %v", err)
	}
}
