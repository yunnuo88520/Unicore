// Author: yunnuo <ymz@ebox.vip>
// Description: Business settings reuse validation, masking, defaults and profile boundaries.
package settings

import (
	"context"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/secret"
)

func TestBusinessSettingsRegistration(t *testing.T) {
	definitions, groups, fields := Definitions, businessGroups, businessFields
	t.Cleanup(func() { Definitions, businessGroups, businessFields = definitions, groups, fields })
	businessFields = map[string]FieldDefinition{}
	group := GroupDefinition{ID: "reports", Label: "报表", LabelEN: "Reports", Fields: []FieldDefinition{
		{Key: "reports.enabled", Type: "boolean", Label: "启用报表", LabelEN: "Enable reports", Default: "true"},
		{Key: "reports.format", Type: "string", Label: "文件格式", LabelEN: "File format", Default: "pdf", Options: []contracts.SettingOption{{Value: "pdf", Label: "PDF", LabelEn: "PDF"}, {Value: "csv", Label: "表格", LabelEn: "CSV"}}},
		{Key: "reports.token", Type: "string", Label: "服务密钥", LabelEN: "Service token", Sensitive: true},
	}}
	if err := Register(group); err != nil {
		t.Fatal(err)
	}
	if err := Register(group); err == nil {
		t.Fatal("duplicate group accepted")
	}
	group.Fields[1].Options[0].Value = "mutated"
	ctx := context.Background()
	key, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	store := &memoryStore{values: map[string]string{}}
	service := &Service{Store: store, Secrets: key, Profile: "web-platform"}
	list, err := service.List(ctx)
	if err != nil || list.Groups == nil || len(*list.Groups) != 1 {
		t.Fatalf("missing business group: %+v %v", list, err)
	}
	for _, change := range []contracts.SettingChange{{Key: "reports.enabled", Value: "yes"}, {Key: "reports.format", Value: "mutated"}, {Key: "reports.unknown", Value: "x"}} {
		if _, err = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{change}}, "actor"); err != ErrInvalid {
			t.Fatal("invalid business setting accepted", change, err)
		}
	}
	list, err = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "reports.token", Value: "synthetic-token"}, {Key: "reports.format", Value: "csv"}}}, "actor")
	if err != nil {
		t.Fatal(err)
	}
	if store.values["reports.token"] == "synthetic-token" {
		t.Fatal("business secret stored as plaintext")
	}
	for _, entry := range list.Items {
		if entry.Key == "reports.token" && (entry.Value != "" || entry.Configured == nil || !*entry.Configured || entry.LabelEn == nil || *entry.LabelEn != "Service token") {
			t.Fatal("secret or presentation missing", entry)
		}
	}
	clear := true
	if _, err = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "reports.token", Clear: &clear}}}, "actor"); err != nil || store.values["reports.token"] != "" {
		t.Fatal("secret clear failed", err)
	}
	for _, profile := range []contracts.Profile{"desktop", "web-standalone"} {
		local := &Service{Store: store, Profile: profile}
		if list, err := local.List(ctx); err != nil || len(list.Items) != 0 || list.Groups != nil {
			t.Fatal("business settings leaked to local profile", list, err)
		}
	}
	count := len(Definitions)
	bad := GroupDefinition{ID: "incomplete", Label: "缺少英文"}
	if err := Register(GroupDefinition{ID: "valid", Label: "有效", LabelEN: "Valid", Fields: []FieldDefinition{{Key: "valid.limit", Type: "integer", Label: "数量", LabelEN: "Limit", Default: "1"}}}, bad); err == nil || len(Definitions) != count {
		t.Fatal("invalid registration retained a partial batch")
	}
}
