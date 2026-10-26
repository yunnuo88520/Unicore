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
	if len(p.Items) != 4 || !strings.Contains(p.Items[1].Html, "data:image/png;base64,") {
		t.Fatal("preview assets missing")
	}
}
