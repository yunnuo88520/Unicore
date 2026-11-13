// Author: yunnuo <ymz@ebox.vip>
// Description: Secret masking, explicit clearing, readiness gates and failed writes.
package settings

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/notifycontent"
	"github.com/yunnuo/unicore/internal/secret"
)

type memoryStore struct {
	values map[string]string
	fail   bool
}

func (m *memoryStore) ReadSettings(context.Context) (map[string]string, error) {
	copy := map[string]string{}
	for k, v := range m.values {
		copy[k] = v
	}
	return copy, nil
}
func (m *memoryStore) SaveSettings(_ context.Context, values map[string]string, _ string) error {
	if m.fail {
		return errors.New("failed write")
	}
	for k, v := range values {
		m.values[k] = v
	}
	return nil
}
func TestSensitiveSettingsAndReadiness(t *testing.T) {
	ctx := context.Background()
	key, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	store := &memoryStore{values: map[string]string{}}
	service := &Service{Store: store, Profile: "web-platform", Secrets: key}
	patch := func(changes ...contracts.SettingChange) error {
		_, err := service.Patch(ctx, contracts.SettingPatch{Changes: changes}, "admin")
		return err
	}
	if err = patch(contracts.SettingChange{Key: "account.password_reset_enabled", Value: "true"}); !errors.Is(err, ErrMailNotReady) {
		t.Fatal("enabled without SMTP", err)
	}
	if err = patch(contracts.SettingChange{Key: "mail.host", Value: "127.0.0.1"}, contracts.SettingChange{Key: "mail.from", Value: "sender@example.test"}, contracts.SettingChange{Key: "mail.password", Value: "test-smtp-secret"}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(store.values["mail.password"], "test-smtp-secret") {
		t.Fatal("plaintext persisted")
	}
	list, err := service.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range list.Items {
		if entry.Key == "mail.password" && (entry.Value != "" || !entry.Sensitive || entry.Configured == nil || !*entry.Configured) {
			t.Fatal("secret exposed or lost configured state")
		}
	}
	before := store.values["mail.password"]
	if err = patch(contracts.SettingChange{Key: "mail.password", Value: ""}); err != nil || store.values["mail.password"] != before {
		t.Fatal("blank changed existing secret", err)
	}
	values, _ := service.Raw(ctx)
	if err = service.MarkMailTested(ctx, MailFingerprint(values), "admin"); err != nil {
		t.Fatal(err)
	}
	if err = patch(contracts.SettingChange{Key: "account.password_reset_enabled", Value: "true"}); err != nil {
		t.Fatal(err)
	}
	if err = patch(contracts.SettingChange{Key: "mail.host", Value: "different.example.test"}); !errors.Is(err, ErrMailNotReady) {
		t.Fatal("enabled flow kept stale verification", err)
	}
	if err = patch(contracts.SettingChange{Key: "mail.from_name", Value: "配套通知"}); err != nil {
		t.Fatal("alias unexpectedly invalidated SMTP connectivity", err)
	}
	if err = patch(contracts.SettingChange{Key: "mail.from_name", Value: "Bad\r\nBcc: attacker@example.test"}); !errors.Is(err, ErrInvalid) {
		t.Fatal("header injection accepted", err)
	}
	if err = patch(contracts.SettingChange{Key: "account.password_reset_enabled", Value: "false"}); err != nil {
		t.Fatal(err)
	}
	clear := true
	if err = patch(contracts.SettingChange{Key: "mail.password", Value: "", Clear: &clear}); err != nil || store.values["mail.password"] != "" {
		t.Fatal("explicit clear failed", err)
	}
	store.fail = true
	if err = patch(contracts.SettingChange{Key: "site.name", Value: "Not saved"}); err == nil || store.values["site.name"] == "Not saved" {
		t.Fatal("failed write reported success")
	}
	store.fail = false
	service.Secrets = nil
	if err = patch(contracts.SettingChange{Key: "mail.password", Value: "unavailable-key"}); err == nil {
		t.Fatal("missing key accepted")
	}
	service.Profile = "desktop"
	if err = patch(contracts.SettingChange{Key: "mail.host", Value: "localhost"}); !errors.Is(err, ErrInvalid) {
		t.Fatal("desktop accepted platform setting", err)
	}
	service.Profile = "web-platform"
	wrongKey, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	service.Secrets = wrongKey
	store.values["mail.password"] = before
	if _, err = service.List(ctx); err == nil {
		t.Fatal("wrong key silently accepted")
	}

}

func TestPublicSiteLinks(t *testing.T) {
	service := &Service{Store: &memoryStore{values: map[string]string{}}, Profile: "web-platform"}
	for _, value := range []string{"javascript:alert(1)", "//example.test", "http://example.test", "https://user:secret@example.test", "https://", "https://example.test/#bad"} {
		_, err := service.Patch(context.Background(), contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "site.icp_url", Value: value}}}, "test")
		if !errors.Is(err, ErrInvalid) {
			t.Fatalf("unsafe ICP link accepted: %q", value)
		}
	}
	if _, err := service.Patch(context.Background(), contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "site.icp_number", Value: "测试ICP备00000000号"}, {Key: "site.icp_url", Value: "https://beian.miit.gov.cn/"}}}, "test"); err != nil {
		t.Fatal(err)
	}
}

func TestSiteConfigurationAndMaintenance(t *testing.T) {
	ctx := context.Background()
	store := &memoryStore{values: map[string]string{}}
	service := &Service{Store: store, Profile: "web-platform"}
	if enabled, err := service.Value(ctx, "site.home_enabled"); err != nil || enabled != "true" {
		t.Fatalf("homepage should be enabled by default: %q %v", enabled, err)
	}
	store.values["site.home_enabled"] = "false"
	if enabled, err := service.Value(ctx, "site.home_enabled"); err != nil || enabled != "false" {
		t.Fatalf("explicit homepage choice was overwritten: %q %v", enabled, err)
	}
	for _, change := range []contracts.SettingChange{
		{Key: "site.base_url", Value: "javascript:alert(1)"}, {Key: "site.base_url", Value: "https://user:password@example.test"},
		{Key: "site.base_url", Value: "https://example.test/path"}, {Key: "site.base_url", Value: "https://:443"},
		{Key: "site.admin_email", Value: "Name <admin@example.test>"}, {Key: "site.police_number", Value: "record\nheader"},
		{Key: "site.footer_html", Value: `<script>alert(1)</script>`}, {Key: "site.footer_html", Value: `<p onclick="alert(1)">bad</p>`},
		{Key: "site.footer_html", Value: `<a href="javascript:alert(1)">bad</a>`}, {Key: "maintenance.enabled", Value: "yes"},
		{Key: "site.home_enabled", Value: "yes"},
		{Key: "maintenance.message", Value: strings.Repeat("x", 1001)},
	} {
		if _, err := service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{change}}, "admin"); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid %s: %v", change.Key, err)
		}
	}
	changes := []contracts.SettingChange{{Key: "site.base_url", Value: "https://example.test/"}, {Key: "site.admin_email", Value: "alerts@example.test"}, {Key: "site.footer_html", Value: `<p>Support <a href="https://example.test/help">Help</a></p>`}, {Key: "maintenance.enabled", Value: "true"}, {Key: "maintenance.message", Value: "Scheduled maintenance"}, {Key: "site.home_enabled", Value: "true"}}
	if _, err := service.Patch(ctx, contracts.SettingPatch{Changes: changes}, "admin"); err != nil {
		t.Fatal(err)
	}
	if got := MailBaseURL(store.values, "http://localhost"); got != "https://example.test" {
		t.Fatal(got)
	}
	if got := MailBaseURL(map[string]string{}, "http://localhost/"); got != "http://localhost" {
		t.Fatal(got)
	}
	for _, profile := range []contracts.Profile{"desktop", "web-standalone"} {
		service.Profile = profile
		for _, change := range changes {
			if _, err := service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{change}}, "local"); !errors.Is(err, ErrInvalid) {
				t.Fatalf("%s accepted %s", profile, change.Key)
			}
		}
	}
}

func TestLegacyRegistrationAndPolicyValidation(t *testing.T) {
	ctx := context.Background()
	store := &memoryStore{values: map[string]string{"account.registration_enabled": "true"}}
	s := &Service{Store: store, Profile: "web-platform"}
	values, err := s.Raw(ctx)
	if err != nil || values["account.email_verification_required"] != "true" {
		t.Fatal("legacy verification weakened", values, err)
	}
	for key, value := range map[string]string{"account.ip_blacklist": "203.*.113.*", "account.email_domains": "https://example.com", "storage.upload_paths": "../escape", "storage.allowed_extensions": "*.exe"} {
		if _, err = s.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: key, Value: value}}}, "admin"); !errors.Is(err, ErrInvalid) {
			t.Fatal(key, "invalid rule accepted", err)
		}
	}
}

func TestLoggingRetentionSetting(t *testing.T) {
	ctx := context.Background()
	store := &memoryStore{values: map[string]string{}}
	service := &Service{Store: store, Profile: "web-platform"}
	values, err := service.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, entry := range values.Items {
		if entry.Key == "logging.retention_days" {
			found = true
			if entry.Value != "30" || entry.Group != "logging" {
				t.Fatalf("unexpected default entry: %+v", entry)
			}
		}
	}
	if !found {
		t.Fatal("platform settings must expose logging.retention_days")
	}
	swept := 0
	service.LoggingSweep = sweeperFunc(func() { swept++ })
	if _, err = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "logging.retention_days", Value: "0"}}}, "admin"); err != nil {
		t.Fatal("permanent retention rejected", err)
	}
	if swept != 1 {
		t.Fatalf("saving a logging setting must trigger one sweep, got %d", swept)
	}
	if stored, _ := store.ReadSettings(ctx); stored["logging.retention_days"] != "0" {
		t.Fatalf("stored value missing: %v", stored)
	}
	for _, invalid := range []string{"-1", "36501", "soon"} {
		if _, err = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "logging.retention_days", Value: invalid}}}, "admin"); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid retention %q", invalid)
		}
	}
	// Other profiles never see the group: standalone and desktop cannot patch it.
	for _, profile := range []contracts.Profile{"web-standalone", "desktop"} {
		service.Profile = profile
		if _, err = service.Value(ctx, "logging.retention_days"); !errors.Is(err, ErrInvalid) {
			t.Fatalf("%s must not read the logging group", profile)
		}
		if _, err = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "logging.retention_days", Value: "7"}}}, "admin"); !errors.Is(err, ErrInvalid) {
			t.Fatalf("%s must not patch the logging group", profile)
		}
	}
}

type sweeperFunc func()

func (f sweeperFunc) Sweep() { f() }

func TestNotificationConfigBackfillsNewEvents(t *testing.T) {
	base := notifycontent.Defaults()
	legacy := contracts.NotifyConfiguration{Enabled: true, Rules: base.Rules[:12], Templates: base.Templates[:12]}
	raw, _ := json.Marshal(legacy)
	c := NotificationConfig(map[string]string{"notifications.config": string(raw)})
	if len(c.Rules) != len(notifycontent.EventIDs()) || len(c.Templates) != len(notifycontent.EventIDs()) {
		t.Fatalf("stored configuration must gain the new events: %d rules %d templates", len(c.Rules), len(c.Templates))
	}
	if !c.Enabled {
		t.Fatal("stored switches must survive the backfill")
	}
}

type recordingNotificationWriter struct {
	store   *memoryStore
	changes map[string]string
}

func (w *recordingNotificationWriter) SaveNotificationSettings(ctx context.Context, values map[string]string, actor string) error {
	w.changes = values
	return w.store.SaveSettings(ctx, values, actor)
}

func TestNotificationSaveBackfillsLegacyCatalog(t *testing.T) {
	base := notifycontent.Defaults()
	// Copy the slices so the stored customization does not alias the defaults.
	legacy := contracts.NotifyConfiguration{
		Provider:  "wecom",
		Rules:     append([]contracts.NotifyRule(nil), base.Rules[:12]...),
		Templates: append([]contracts.NotifyTemplate(nil), base.Templates[:12]...),
	}
	legacy.Rules[0].UserEmail = !legacy.Rules[0].UserEmail
	store := &memoryStore{values: map[string]string{}}
	writer := &recordingNotificationWriter{store: store}
	key, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{Store: store, Profile: "web-platform", NotificationWriter: writer, Secrets: key}
	saved, err := service.SaveNotifications(context.Background(), legacy, "admin")
	if err != nil {
		t.Fatalf("legacy catalog save must be completed, not rejected: %v", err)
	}
	if len(saved.Rules) != len(notifycontent.EventIDs()) || len(saved.Templates) != len(notifycontent.EventIDs()) {
		t.Fatalf("saved configuration must gain the new events: %d rules %d templates", len(saved.Rules), len(saved.Templates))
	}
	if saved.Rules[0].UserEmail == base.Rules[0].UserEmail {
		t.Fatal("stored customization must survive the save")
	}
	// The persisted JSON is complete: a fresh read sees the full catalog.
	read, err := service.Notifications(context.Background())
	if err != nil || len(read.Rules) != len(notifycontent.EventIDs()) {
		t.Fatalf("read-modify-save-read must stay consistent: %v %d", err, len(read.Rules))
	}
	// Modify one switch and save again: everything else persists untouched.
	read.Rules[1].AdminEmail = !read.Rules[1].AdminEmail
	resaved, err := service.SaveNotifications(context.Background(), read, "admin")
	if err != nil {
		t.Fatalf("round-trip save failed: %v", err)
	}
	if resaved.Rules[1].AdminEmail == base.Rules[1].AdminEmail || resaved.Rules[0].UserEmail == base.Rules[0].UserEmail {
		t.Fatal("second save must keep both the original and the new customization")
	}
	// Unknown event IDs stay fail-closed.
	poisoned := contracts.NotifyConfiguration{Provider: "wecom", Rules: append(append([]contracts.NotifyRule{}, base.Rules...), contracts.NotifyRule{Event: "mystery_event"}), Templates: base.Templates}
	if _, err = service.SaveNotifications(context.Background(), poisoned, "admin"); err != ErrInvalid {
		t.Fatalf("unknown events must be rejected: %v", err)
	}
}

func TestNotificationSectionsPreserveOtherSavedValues(t *testing.T) {
	store := &memoryStore{values: map[string]string{}}
	writer := &recordingNotificationWriter{store: store}
	key, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{Store: store, Profile: "web-platform", NotificationWriter: writer, Secrets: key}
	stale, _ := service.Notifications(context.Background())
	channels := stale
	section := "channels"
	channels.Section = &section
	channels.ChannelEnabled = true
	channels.WecomKey = "synthetic"
	if _, err = service.SaveNotifications(context.Background(), channels, "admin"); err != nil {
		t.Fatal(err)
	}
	section = "system"
	stale.Section = &section
	stale.Enabled = true
	saved, err := service.SaveNotifications(context.Background(), stale, "admin")
	if err != nil {
		t.Fatal(err)
	}
	if !saved.ChannelEnabled || !saved.WecomConfigured || !saved.Enabled || saved.Catalog == nil {
		t.Fatal("stale system page overwrote channel configuration or lost catalog")
	}
	section = "templates"
	stale.Section = &section
	stale.Enabled = false
	stale.Templates[0].Title = "Updated template"
	stale.ClearWecomKey = true
	saved, err = service.SaveNotifications(context.Background(), stale, "admin")
	if err != nil {
		t.Fatal(err)
	}
	if !saved.Enabled || !saved.WecomConfigured || saved.Templates[0].Title != "Updated template" {
		t.Fatal("template save overwrote routing or credentials")
	}
	if strings.Contains(store.values["notifications.config"], "catalog") || strings.Contains(store.values["notifications.config"], "section") {
		t.Fatal("write scope or server metadata persisted")
	}
}
