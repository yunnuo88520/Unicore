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
