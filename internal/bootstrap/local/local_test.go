// Author: yunnuo <ymz@ebox.vip>
package local

import (
	"context"
	"github.com/yunnuo/unicore/internal/contracts"
	"testing"
)

func TestDesktopHasSQLiteWithoutUsers(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	store, service, err := Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if _, _, err = Open(ctx, directory); err == nil {
		t.Fatal("second desktop process acquired the same data directory")
	}
	if err = store.DB.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('users','roles','sessions','external_identities','oidc_flows')").Scan(&count); err != nil || count != 0 {
		t.Fatal("desktop loaded identity schema")
	}
	if _, err = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "appearance.theme", Value: "dark"}}}, "desktop"); err != nil {
		t.Fatal(err)
	}
	_ = store.Close()
	store, service, err = Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if value, _ := service.Value(ctx, "appearance.theme"); value != "dark" {
		t.Fatal(value)
	}
}
