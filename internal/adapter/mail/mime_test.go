// Author: yunnuo <ymz@ebox.vip>
// Description: Validate MIME nesting, Chinese header decoding, text fallback and embedded PNG.
package mailadapter

import (
	"bytes"
	"encoding/base64"
	"github.com/yunnuo/unicore/assets/brand"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/testutil"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"
	"testing"
)

func TestBrandedMIME(t *testing.T) {
	message := mailer.Render("配套站点", "测试版权", "verify", "012345", "recipient@example.test", false)
	data, err := encodeMessage(mailer.Config{From: "sender@example.test"}, message)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := mail.ReadMessage(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	subject, err := (&mime.WordDecoder{}).DecodeHeader(raw.Header.Get("Subject"))
	if err != nil || subject != message.Subject {
		t.Fatal("Chinese subject corrupted", err)
	}
	from, err := raw.Header.AddressList("From")
	if err != nil || len(from) != 1 || from[0].Name != "配套站点" {
		t.Fatal("display name corrupted", err)
	}
	if text := testutil.MailText(string(data)); text != message.Body {
		t.Fatal("plain text fallback corrupted")
	}
	_, params, err := mime.ParseMediaType(raw.Header.Get("Content-Type"))
	if err != nil {
		t.Fatal(err)
	}
	reader := multipart.NewReader(raw.Body, params["boundary"])
	first, err := reader.NextPart()
	if err != nil {
		t.Fatal(err)
	}
	kind, _, _ := mime.ParseMediaType(first.Header.Get("Content-Type"))
	if kind != "multipart/alternative" {
		t.Fatal("text/html alternatives missing")
	}
	_ = first.Close()
	logo, err := reader.NextPart()
	if err != nil || logo.Header.Get("Content-ID") != "<unicore-brand>" {
		t.Fatal("CID logo missing", err)
	}
	bitmap, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, logo))
	if err != nil || !bytes.Equal(bitmap, brand.EmailLogo) {
		t.Fatal("embedded logo does not match brand", err)
	}
	for _, line := range strings.Split(string(data), "\r\n") {
		if len(line) > 998 {
			t.Fatal("SMTP line too long")
		}
	}
}
