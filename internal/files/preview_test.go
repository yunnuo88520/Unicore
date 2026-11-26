// Author: yunnuo <ymz@ebox.vip>
// Description: Inline preview links exist only for whitelisted MIME types and stay attachment otherwise.
package files_test

import (
	"crypto/sha256"
	"fmt"
	"net/url"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
)

func TestInlinePreviewWhitelist(t *testing.T) {
	for _, mime := range []string{"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain", "text/plain; charset=utf-8"} {
		if !files.InlinePreview(mime) {
			t.Fatal("safe mime rejected", mime)
		}
	}
	for _, mime := range []string{"image/svg+xml", "text/html", "application/javascript", "application/octet-stream", "garbage"} {
		if files.InlinePreview(mime) {
			t.Fatal("unsafe mime accepted", mime)
		}
	}
}

func TestCatalogAccessInlineDisposition(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	payload := []byte("preview bytes")
	upload := func(mime string) string {
		grant, err := s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "preview.bin", MimeType: mime, Size: len(payload)})
		if err != nil {
			t.Fatal(err)
		}
		if err := s.Receive(ctx, admin, grant.FileID, strings.NewReader(string(payload)), int64(len(payload))); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Complete(ctx, admin, grant.FileID); err != nil {
			t.Fatal(err)
		}
		return grant.FileID
	}
	image := upload("image/png")
	text := upload("text/plain")
	script := upload("application/javascript")
	for _, spec := range []struct {
		id     string
		inline bool
		want   bool
	}{
		{image, true, true},
		{text, true, true},
		{script, true, false},
		{image, false, false},
	} {
		access, err := s.CatalogAccess(ctx, admin, spec.id, spec.inline)
		if err != nil {
			t.Fatal(err)
		}
		query, err := url.Parse(access.Url)
		if err != nil {
			t.Fatal(err)
		}
		got := query.Query().Get("disposition") == "inline"
		if got != spec.want {
			t.Fatalf("inline=%v for %s: got %v", spec.inline, spec.id, got)
		}
		if _, _, err = s.Download(ctx, spec.id, query.Query().Get("signature"), int64(access.ExpiresAt)); err != nil {
			t.Fatal("download with inline flag", err)
		}
	}
	// Branding files stay signable through the governance surface.
	data := []byte("brand bytes")
	brandID := fmt.Sprintf("%x.png", sha256.Sum256(data))
	if _, err := s.BrandStore().Put(ctx, brandID, strings.NewReader(string(data)), int64(len(data)), "image/png"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CatalogAccess(ctx, admin, brandID, true); err != nil {
		t.Fatal("brand inline", err)
	}
}
