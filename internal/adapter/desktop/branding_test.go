// Author: yunnuo <ymz@ebox.vip>
// Description: Actual SQLite/Wails bridge round-trip and restart with instance identity, without HTTP.
package desktop

import (
	"context"
	"encoding/base64"
	"github.com/yunnuo/unicore/assets/brand"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
	"github.com/yunnuo/unicore/internal/contracts"
	"testing"
)

func TestNativeBrandPersistence(t *testing.T) {
	directory := t.TempDir()
	store, service, err := local.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	bridge := NewLocal(bootstrap.Core(), service)
	response := bridge.UpdateBranding(contracts.BrandingInput{Slot: "logo", Content: base64.StdEncoding.EncodeToString(brand.EmailLogo)})
	if response.Code != "OK" || response.Data.Logo == "" {
		t.Fatal(response)
	}
	if got := bridge.Bootstrap().Data.Branding; got == nil || got.Logo != response.Data.Logo {
		t.Fatal("bootstrap missing brand")
	}
	if got := bridge.PatchSettings(contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "branding.logo", Value: ""}}}); got.Code != "INVALID_INPUT" {
		t.Fatal("generic settings bypass", got)
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	store, service, err = local.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	bridge = NewLocal(bootstrap.Core(), service)
	if got := bridge.Branding(); got.Data.Logo != response.Data.Logo {
		t.Fatal("brand lost on restart")
	}
	if got := bridge.UpdateBranding(contracts.BrandingInput{Slot: "favicon", Content: "bad"}); got.Code != "BRAND_INVALID" {
		t.Fatal(got)
	}
	if got := bridge.UpdateBranding(contracts.BrandingInput{Slot: "logo"}); got.Code != "OK" || got.Data.Logo != "" {
		t.Fatal(got)
	}
}
