// Author: yunnuo <ymz@ebox.vip>
package notifycontent

import (
	"github.com/yunnuo/unicore/internal/contracts"
	"testing"
)

func TestTemplatesBoundaries(t *testing.T) {
	c := Defaults()
	if !ValidConfiguration(c) {
		t.Fatal("invalid catalog")
	}
	for _, bad := range []contracts.NotifyTemplate{{Event: "unknown", Title: "x", Body: "x"}, {Event: "login", Title: "{{password}}", Body: "x"}, {Event: "login", Title: "x\ny", Body: "x"}, {Event: "login", Title: "x", Body: "<script>alert(1)</script>"}, {Event: "login", Title: "x", Body: "{{site_name"}} {
		if Validate(bad) == nil {
			t.Fatalf("accepted %#v", bad)
		}
	}
	input := contracts.NotifyTemplate{Event: "login", Title: "{{site_name}} {{username}}", Body: "{{message}}"}
	got, err := Render(input, map[string]string{"site_name": "Site", "username": "\r\nInjected", "message": "{{password}} <example>"})
	if err != nil || got.Title != "Site   Injected" || got.Body != "{{password}} <example>" {
		t.Fatalf("render did recursive expansion or header injection: %#v %v", got, err)
	}
	c.Rules[1].Event = c.Rules[0].Event
	if ValidConfiguration(c) {
		t.Fatal("duplicate event")
	}
}

func TestAlertEventDefaults(t *testing.T) {
	c := Defaults()
	if len(c.Rules) != len(EventIDs()) || len(c.Templates) != len(EventIDs()) {
		t.Fatalf("catalog coverage: %d rules %d templates for %d events", len(c.Rules), len(c.Templates), len(EventIDs()))
	}
	if !ValidConfiguration(c) {
		t.Fatal("defaults must validate")
	}
	for _, event := range []string{"alert_triggered", "alert_recovered"} {
		var rule *contracts.NotifyRule
		for i := range c.Rules {
			if c.Rules[i].Event == event {
				rule = &c.Rules[i]
			}
		}
		if rule == nil || rule.UserEmail || !rule.AdminEmail || rule.AdminChannel {
			t.Fatalf("%s default rule must target the administrator email only: %+v", event, rule)
		}
	}
}

func TestMergeDefaultsBackfill(t *testing.T) {
	base := Defaults()
	// Simulate a configuration saved before the alert events existed; copy the
	// slices so the stored customization does not alias the defaults.
	legacy := contracts.NotifyConfiguration{Provider: "wecom",
		Rules:     append([]contracts.NotifyRule(nil), base.Rules[:12]...),
		Templates: append([]contracts.NotifyTemplate(nil), base.Templates[:12]...),
	}
	legacy.Rules[0].UserEmail = !legacy.Rules[0].UserEmail
	merged := MergeDefaults(legacy)
	if len(merged.Rules) != len(EventIDs()) || len(merged.Templates) != len(EventIDs()) {
		t.Fatalf("backfill must complete the catalog: %d rules %d templates", len(merged.Rules), len(merged.Templates))
	}
	if merged.Rules[0].UserEmail == Defaults().Rules[0].UserEmail {
		t.Fatal("stored customization must survive the backfill")
	}
	if !ValidConfiguration(merged) {
		t.Fatal("merged configuration must validate")
	}
}

func TestRegisteredBusinessEventBackfillsAndOwnsVariables(t *testing.T) {
	original := Definitions()
	t.Cleanup(func() { registryMu.Lock(); definitions = original; registryMu.Unlock() })
	legacy := Defaults()
	d := Definition{ID: "report_ready", Label: "报表完成", LabelEN: "Report ready", Description: "报表生成完成。", DescriptionEN: "A report is ready.", UserEmailAllowed: true,
		Template: contracts.NotifyTemplate{Title: "{{site_name}} {{report_id}}", Body: "{{username}} {{report_id}}"}, Variables: []Variable{{Key: "report_id", Label: "报表编号", LabelEN: "Report ID", Sample: "R-001"}}}
	Register(d)
	merged := MergeDefaults(legacy)
	if !ValidConfiguration(merged) || len(merged.Rules) != len(legacy.Rules)+1 {
		t.Fatal("business event was not backfilled")
	}
	rule := merged.Rules[len(merged.Rules)-1]
	if rule.AdminEmail || rule.AdminChannel || rule.UserEmail {
		t.Fatal("new business event must default to opt-in")
	}
	catalog := Catalog()
	last := catalog[len(catalog)-1]
	if last.ID != "report_ready" || last.LabelEn != "Report ready" || last.Variables[len(last.Variables)-1].Key != "report_id" {
		t.Fatal("event registration did not populate the bilingual UI catalog")
	}
	template := merged.Templates[len(merged.Templates)-1]
	rendered, err := Render(template, map[string]string{"site_name": "Site", "username": "member", "report_id": "R-1"})
	if err != nil || rendered.Title != "Site R-1" {
		t.Fatalf("business template: %+v %v", rendered, err)
	}
	template.Body = "{{unknown_business_field}}"
	if Validate(template) == nil {
		t.Fatal("unregistered event variable accepted")
	}
	// Registry snapshots must not let consumers mutate future defaults.
	snapshot, _ := DefinitionFor("report_ready")
	snapshot.Variables[0].Key = "poisoned"
	if Validate(merged.Templates[len(merged.Templates)-1]) != nil {
		t.Fatal("definition snapshot changed the registry")
	}
	func() {
		defer func() {
			if recover() == nil {
				t.Error("duplicate event registration accepted")
			}
		}()
		Register(d)
	}()
}

func TestLegacyBuiltinTemplateVariablesRemainReadable(t *testing.T) {
	template := contracts.NotifyTemplate{Event: "login", Title: "Login {{rule_name}}", Body: "{{message}}"}
	if _, err := Render(template, map[string]string{"message": "Signed in"}); err != nil {
		t.Fatal("legacy shared variable invalidated a saved template", err)
	}
}
