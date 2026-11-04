// Author: yunnuo <ymz@ebox.vip>
package mailer

import (
	"encoding/json"
	"github.com/yunnuo/unicore/internal/notifycontent"
	"github.com/yunnuo/unicore/internal/settings"
	"testing"
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
