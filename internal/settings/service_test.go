// Author: yunnuo <ymz@ebox.vip>
// Description: Secret masking, explicit clearing, readiness gates and failed writes.
package settings

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
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
