// Author: yunnuo <ymz@ebox.vip>
// Description: Real parser tests for safe publication content and browser attack vectors.
package content

import (
	"strings"
	"testing"
)

func TestSafeAnnouncementRendering(t *testing.T) {
	html, err := Announcement("## 平台升级\n\n欢迎 **使用** [帮助](https://example.test/help)", "markdown")
	if err != nil || !strings.Contains(html, "<h2>平台升级</h2>") || !strings.Contains(html, "<strong>使用</strong>") {
		t.Fatal(html, err)
	}
	for _, input := range []string{`<script>alert(1)</script>`, `<p onclick="x()">hello</p>`, `<svg/onload=alert(1)>`, `<p><a href="javascript:alert(1)">hello</a></p>`, `<img src="https://example.test/tracker">`, `<iframe src="https://example.test">x</iframe>`, `<p style="color:red">hi</p>`, `<a href="https://user:password@example.test">hi</a>`} {
		if _, err := Announcement(input, "html"); err == nil {
			t.Fatalf("accepted unsafe HTML %q", input)
		}
	}
	for _, input := range []string{"Hello <script>alert(1)</script>", "<iframe src='https://example.test'>x</iframe>\n\nhello", "[link](javascript:alert%281%29)"} {
		html, err = Announcement(input, "markdown")
		if err == nil && (strings.Contains(html, "<script") || strings.Contains(html, "javascript:") || strings.Contains(html, "<iframe")) {
			t.Fatal("unsafe markdown", html)
		}
	}
	if _, err = Announcement("<p>   </p>", "html"); err == nil {
		t.Fatal("blank content")
	}
}
