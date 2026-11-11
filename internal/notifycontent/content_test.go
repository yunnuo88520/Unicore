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
	if len(c.Rules) != len(Events) || len(c.Templates) != len(Events) {
		t.Fatalf("catalog coverage: %d rules %d templates for %d events", len(c.Rules), len(c.Templates), len(Events))
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
	if len(merged.Rules) != len(Events) || len(merged.Templates) != len(Events) {
		t.Fatalf("backfill must complete the catalog: %d rules %d templates", len(merged.Rules), len(merged.Templates))
	}
	if merged.Rules[0].UserEmail == Defaults().Rules[0].UserEmail {
		t.Fatal("stored customization must survive the backfill")
	}
	if !ValidConfiguration(merged) {
		t.Fatal("merged configuration must validate")
	}
}
