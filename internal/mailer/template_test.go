// Author: yunnuo <ymz@ebox.vip>
// Description: Template escaping and consistent preview/delivery content.
package mailer

import (
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
