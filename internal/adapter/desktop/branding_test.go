// Author: yunnuo <ymz@ebox.vip>
// Description: Local profiles use build branding and expose only local appearance.
package desktop

import (
	"context"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/runtime"
	"testing"
)

func TestNativeLocalSettingsBoundary(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	store, service, err := local.Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}

	if _, err = store.Exec(ctx, store.DB, "INSERT INTO system_settings(setting_key,setting_value) VALUES('site.name','Legacy local name'),('branding.logo','legacy-reference')"); err != nil {
		t.Fatal(err)
	}
	bridge := NewLocal(bootstrap.Core(), service)
	for _, key := range []string{"site.name", "branding.logo", "mail.host"} {
		if got := bridge.PatchSettings(contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: key, Value: "legacy"}}}); got.Code != "INVALID_INPUT" {
			t.Fatal(key, got)
		}
	}
	if got := bridge.PatchSettings(contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "appearance.theme", Value: "dark"}}}); got.Code != "OK" {
		t.Fatal(got)
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	store, service, err = local.Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	bridge = NewLocal(bootstrap.Core(), service)
	got := bridge.Bootstrap().Data
	if got.SiteName != runtime.Metadata(runtime.Desktop, "native").SiteName || got.Theme == nil || *got.Theme != "dark" {
		t.Fatal(got)
	}
	list := bridge.Settings()
	for _, item := range list.Data.Items {
		if item.Group != "appearance" {
			t.Fatal(item)
		}
	}
}
