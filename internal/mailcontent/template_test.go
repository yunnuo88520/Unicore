// Author: yunnuo <ymz@ebox.vip>
// Description: Active markup, unknown variables, invisible codes and header injection must fail closed.
package mailcontent

import "testing"

func TestTemplateBoundaries(t *testing.T) {
	for _, p := range Purposes {
		if e := Validate(p, Default(p)); e != nil {
			t.Fatal(p, e)
		}
	}
	for _, body := range []string{`<script>alert(1)</script>`, `<img src="https://example.com/tracking">`, `<p onclick="alert(1)">hello</p>`, `<a href="javascript:alert(1)">x</a>`, `<svg/onload=alert(1)>`, `<p>{{unknown}}</p>`, `<p>{{code}}</p>`, `<p>{{site_name</p>`, `<!-- hidden -->`, `<p><a href="data:text/html,evil">x</a></p>`} {
		if Validate("test", Template{Subject: "Hello", Body: body}) == nil {
			t.Fatal("accepted", body)
		}
	}
	if Validate("login", Template{Subject: "Hello", Body: `<a href="https://example.com/{{code}}">continue</a>`}) == nil {
		t.Fatal("invisible code allowed")
	}
	if Validate("test", Template{Subject: "Subject\r\nBcc: anyone", Body: "<p>hello</p>"}) == nil {
		t.Fatal("header injection")
	}
	if e := Validate("test", Template{Subject: "{{site_name}}", Body: `<p><b>Hello</b></p><ul><li>Item</li></ul><a href="{{site_url}}">Visit</a>`}); e != nil {
		t.Fatal(e)
	}
}
