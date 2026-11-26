// Author: yunnuo <ymz@ebox.vip>
// Description: Template escaping and consistent preview/delivery content.
package mailer

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"
)

func TestBrandedTemplates(t *testing.T) {
	for _, purpose := range []string{"verify", "login", "reset"} {
		m := Render("<script>site</script>", "copyright", purpose, "012345", "recipient@example.test", false)
		if strings.Contains(m.HTML, "<script>site</script>") || !strings.Contains(m.HTML, "&lt;script&gt;") || !strings.Contains(m.HTML, "cid:unicore-brand") || !strings.Contains(m.Body, "012345") {
			t.Fatal("unsafe or incomplete template", purpose)
		}
	}
	p := Previews("Unicore", "yunnuo")
	if len(p.Items) != 5 || !strings.Contains(p.Items[1].Html, "data:image/png;base64,") {
		t.Fatal("preview assets missing")
	}
	n := RenderNotification("配套站点", "版权", "变更提醒", "<script>unsafe</script>\n详情", "recipient@example.test", false)
	if strings.Contains(n.HTML, "<script>") || !strings.Contains(n.HTML, "&lt;script&gt;") || !strings.Contains(n.HTML, "系统通知") || !strings.Contains(n.Body, "\n详情") || strings.Contains(n.Body, "验证码：") {
		t.Fatal("unsafe or incorrect notification template")
	}
}

func TestConfiguredTemplateEscaping(t *testing.T) {
	values := map[string]string{"site.name": "<img src=x onerror=alert(1)>", "site.base_url": "https://example.test", "site.copyright": "Copyright", "mail.template.login": `{"subject":"{{site_name}} · Sign in","body":"<p>Your code: <b>{{code}}</b></p><a href=\"{{site_url}}\">Visit</a>"}`}
	message, e := RenderConfigured(values, "login", "012345", "recipient@example.test", false, nil, nil)
	if e != nil || !strings.Contains(message.Body, "012345") || strings.Contains(message.HTML, "onerror=alert(1)> ·") || !strings.Contains(message.HTML, `href="https://example.test"`) {
		t.Fatal("configured render", message.Body, e)
	}
	values["mail.template.notification"] = `{"subject":"{{site_name}}","body":"<p>{{detail}}</p>"}`
	message, e = RenderConfigured(values, "notification", "", "", true, nil, map[string]string{"detail": "literal {{unknown}} <script>bad</script>"})
	if e != nil || strings.Contains(message.HTML, "<script>bad") || !strings.Contains(message.Body, "{{unknown}}") {
		t.Fatal("business content was reinterpreted", e)
	}
}

func TestMailLogoPreservesNaturalDimensions(t *testing.T) {
	for _, test := range []struct {
		name string
		w, h int
		want string
	}{
		{name: "wordmark", w: 320, h: 80, want: `width="160" height="40"`},
		{name: "mark", w: 84, h: 84, want: `width="42" height="42"`},
	} {
		t.Run(test.name, func(t *testing.T) {
			logo := image.NewNRGBA(image.Rect(0, 0, test.w, test.h))
			for y := 0; y < test.h; y++ {
				for x := 0; x < test.w; x++ {
					logo.SetNRGBA(x, y, color.NRGBA{R: 30, G: 80, B: 160, A: 255})
				}
			}
			var data bytes.Buffer
			if err := png.Encode(&data, logo); err != nil {
				t.Fatal(err)
			}
			message := Render("A long instance name", "Copyright", "verify", "123456", "user@example.test", false, data.Bytes())
			if !strings.Contains(message.HTML, test.want) || !strings.Contains(message.HTML, "max-width:160px;max-height:42px") || !strings.Contains(message.HTML, "word-break:break-word") {
				t.Fatalf("logo dimensions or site-name space missing: %s", message.HTML)
			}
			start := strings.Index(message.HTML, `<img src="cid:unicore-brand"`)
			if start < 0 {
				t.Fatal("mail logo image is missing")
			}
			end := strings.Index(message.HTML[start:], ">")
			if end < 0 || strings.Contains(message.HTML[start:start+end], "border-radius") {
				t.Fatal("mail logo should not be clipped by rounded corners")
			}
		})
	}
}
