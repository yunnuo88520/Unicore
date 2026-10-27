// Author: yunnuo <ymz@ebox.vip>
// Description: Queued six-digit email keeps its image snapshot after replacement and real SQLite restart.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/base64"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/testutil"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime"
	"mime/multipart"
	"net"
	"net/mail"
	"os"
	"strings"
	"testing"
	"time"
)

func TestQueuedMailBrandSnapshot(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	manager, err := install.Open(ctx, install.Options{DataDir: directory})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = manager.Close() }()
	token, _ := os.ReadFile(manager.TokenPath())
	_, admin, err := manager.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "品牌平台", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	smtp, err := testutil.StartSMTP()
	if err != nil {
		t.Fatal(err)
	}
	defer smtp.Close()
	host, port, _ := net.SplitHostPort(smtp.Listener.Addr().String())
	_, service, _, _ := manager.Services()
	_, err = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "mail.host", Value: host}, {Key: "mail.port", Value: port}, {Key: "mail.tls", Value: "plain"}, {Key: "mail.from", Value: "sender@example.test"}, {Key: "mail.from_name", Value: "品牌通知"}}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.Branding.Update(ctx, contracts.BrandingInput{Slot: "logo", Content: base64.StdEncoding.EncodeToString(noisyBrand(t))}, admin.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	logo, err := service.Logo(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err = manager.Mail().Test(ctx, "recipient@example.test", admin.ID); err != nil {
		t.Fatal(err)
	}
	_, err = service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "account.email_login_enabled", Value: "true"}, {Key: "security.login_captcha", Value: "false"}}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = manager.Accounts().RequestCode(ctx, contracts.EmailRequest{Email: admin.Email}, "brand-test", "login"); err != nil {
		t.Fatal(err)
	}
	if err = manager.Mail().Notify(ctx, mailer.Notification{To: "recipient@example.test", Title: "设置变更提醒", Detail: "<script>unsafe</script>\n请查看审计记录。"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	store, _, _, _ := manager.Services()
	var payload string
	if err = store.Row(ctx, store.DB, "SELECT payload FROM mail_jobs WHERE payload<>'' LIMIT 1").Scan(&payload); err != nil {
		t.Fatal(err)
	}
	if len(payload) > 65535 {
		t.Fatalf("encrypted brand mail exceeds MySQL TEXT: %d", len(payload))
	}
	// Reset removes the public asset, but the encrypted queued message must remain complete.
	if _, err = service.Branding.Update(ctx, contracts.BrandingInput{Slot: "logo"}, admin.ID, false); err != nil {
		t.Fatal(err)
	}
	if err = manager.Close(); err != nil {
		t.Fatal(err)
	}
	manager, err = install.Open(ctx, install.Options{DataDir: directory})
	if err != nil {
		t.Fatal(err)
	}
	if err = manager.Mail().Tick(ctx, int(time.Now().Unix())); err != nil {
		t.Fatal(err)
	}
	if err = manager.Mail().Tick(ctx, int(time.Now().Unix())); err != nil {
		t.Fatal(err)
	}
	messages := smtp.Messages()
	if len(messages) != 3 {
		t.Fatal("test, login and system notification not delivered", len(messages))
	}
	for _, message := range messages {
		parsed, err := mail.ReadMessage(strings.NewReader(message))
		if err != nil {
			t.Fatal(err)
		}
		from, err := parsed.Header.AddressList("From")
		if err != nil || len(from) != 1 || from[0].Name != "品牌通知" {
			t.Fatal("sender alias not applied", err)
		}
		_, params, _ := mime.ParseMediaType(parsed.Header.Get("Content-Type"))
		reader := multipart.NewReader(parsed.Body, params["boundary"])
		first, err := reader.NextPart()
		if err != nil {
			t.Fatal(err)
		}
		_ = first.Close()
		part, err := reader.NextPart()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, part))
		if err != nil || !bytes.Equal(data, logo) {
			t.Fatal("queued CID image changed", err)
		}
	}
	joined := testutil.MailText(messages[1]) + testutil.MailText(messages[2])
	if !strings.Contains(joined, "品牌平台") || !strings.Contains(joined, "验证码：") || !strings.Contains(joined, "请查看审计记录。") {
		t.Fatal("branded account/notification content absent")
	}
}

// A nearly incompressible RGBA image exercises the largest mail image, rather than a tiny flat logo.
func noisyBrand(t *testing.T) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 240, 240))
	state := uint32(1)
	next := func() uint8 { state ^= state << 13; state ^= state >> 17; state ^= state << 5; return uint8(state) }
	for y := 0; y < 240; y++ {
		for x := 0; x < 240; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: next(), G: next(), B: next(), A: next()})
		}
	}
	var output bytes.Buffer
	if err := png.Encode(&output, img); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}
