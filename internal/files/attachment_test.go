// Author: yunnuo <ymz@ebox.vip>
// Description: Avatar file validation reads actual image bytes and respects private-file lifecycle.
package files_test

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
)

func TestAvatarContentAndLifecycle(t *testing.T) {
	ctx := context.Background()
	manager, actor, _ := setup(t)
	service := manager.Files()
	var data bytes.Buffer
	if err := png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	upload := func(payload []byte, mime string) string {
		t.Helper()
		grant, err := service.Upload(ctx, actor, contracts.FileUploadInput{OriginalName: "avatar.png", MimeType: mime, Size: len(payload)})
		if err != nil {
			t.Fatal(err)
		}
		if err = service.Receive(ctx, actor, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
			t.Fatal(err)
		}
		if _, err = service.Complete(ctx, actor, grant.FileID); err != nil {
			t.Fatal(err)
		}
		return grant.FileID
	}
	valid := upload(data.Bytes(), "image/png")
	if err := service.ValidateAvatar(ctx, actor, valid); err != nil {
		t.Fatal(err)
	}
	for _, other := range []files.Actor{{ID: actor.ID, Realm: "user"}, {ID: "other", Realm: actor.Realm, Admin: true}} {
		if err := service.ValidateAvatar(ctx, other, valid); err == nil {
			t.Fatal("avatar crossed owner/realm boundary")
		}
	}
	fake := upload([]byte("not a PNG image"), "image/png")
	if err := service.ValidateAvatar(ctx, actor, fake); err == nil {
		t.Fatal("trusted claimed MIME")
	}
	mismatch := upload(data.Bytes(), "image/jpeg")
	if err := service.ValidateAvatar(ctx, actor, mismatch); err == nil {
		t.Fatal("accepted mismatched MIME")
	}
	if err := service.Delete(ctx, actor, valid); err != nil {
		t.Fatal(err)
	}
	if err := service.ValidateAvatar(ctx, actor, valid); err == nil {
		t.Fatal("accepted deleted file")
	}
}
