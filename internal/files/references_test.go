//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Real file-service deletion guards for notes, avatar and branding references.
package files_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
)

func TestDeleteProtectsMountedBusinessAndPlatformReferences(t *testing.T) {
	ctx := context.Background()
	m, admin, _ := setup(t)
	service := m.Files()
	store, _, _, _ := m.Services()

	readyFile := func(name string) string {
		t.Helper()
		payload := []byte("referenced asset")
		grant, err := service.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: name, MimeType: "text/plain", Size: len(payload)})
		if err != nil {
			t.Fatal(err)
		}
		if err = service.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
			t.Fatal(err)
		}
		if _, err = service.Complete(ctx, admin, grant.FileID); err != nil {
			t.Fatal(err)
		}
		return grant.FileID
	}
	assertProtected := func(fileID string) {
		t.Helper()
		if err := service.Delete(ctx, admin, fileID); !errors.Is(err, files.ErrBusy) {
			t.Fatalf("referenced file %s deletion should be blocked, got %v", fileID, err)
		}
		if err := service.CatalogDelete(ctx, admin, fileID); !errors.Is(err, files.ErrBusy) {
			t.Fatalf("catalog deletion of referenced file %s should be blocked, got %v", fileID, err)
		}
		if _, err := store.Exec(ctx, store.DB, "UPDATE unicore_file_metadata SET expires_at=? WHERE id=?", time.Now().Add(-time.Hour).Unix(), fileID); err != nil {
			t.Fatal(err)
		}
		if err := service.Cleanup(ctx); err != nil {
			t.Fatal(err)
		}
		if record, err := service.Repo.Get(ctx, fileID); err != nil || record.State != "ready" {
			t.Fatalf("expiry cleanup destroyed referenced file %s: %+v %v", fileID, record, err)
		}
	}

	noteAttachment := readyFile("note-attachment.txt")
	ids := []string{noteAttachment}
	notes := &notessql.Repository{Store: store}
	if _, err := notes.Create(ctx, "local", contracts.NoteInput{Title: "Referenced attachment", Body: "body", Status: "open", AttachmentIds: &ids}); err != nil {
		t.Fatal(err)
	}
	assertProtected(noteAttachment)

	avatar := readyFile("avatar.txt")
	if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_account_avatars(user_id,creator_realm,file_id,updated_at) VALUES(?,?,?,0)", admin.ID, "administrator", avatar); err != nil {
		t.Fatal(err)
	}
	assertProtected(avatar)

	logo := readyFile("logo.txt")
	if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES('branding.logo',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", logo); err != nil {
		t.Fatal(err)
	}
	assertProtected(logo)

	unreferenced := readyFile("unused.txt")
	if err := service.Delete(ctx, admin, unreferenced); err != nil {
		t.Fatalf("unreferenced file should remain deletable: %v", err)
	}
}

func TestReferenceCheckerFailureBlocksDelete(t *testing.T) {
	ctx := context.Background()
	m, admin, _ := setup(t)
	service := m.Files()
	service.References = []files.ReferenceChecker{referenceCheckerFunc(func(context.Context, string) (bool, error) {
		return false, errors.New("reference store unavailable")
	})}
	payload := []byte("private content")
	grant, err := service.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "busy.txt", MimeType: "text/plain", Size: len(payload)})
	if err != nil {
		t.Fatal(err)
	}
	if err = service.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Complete(ctx, admin, grant.FileID); err != nil {
		t.Fatal(err)
	}
	if err = service.Delete(ctx, admin, grant.FileID); !errors.Is(err, files.ErrUnavailable) {
		t.Fatalf("checker failure should fail closed as unavailable, got %v", err)
	}
	store, _, _, _ := m.Services()
	if _, err = store.Exec(ctx, store.DB, "UPDATE unicore_file_metadata SET expires_at=? WHERE id=?", time.Now().Add(-time.Hour).Unix(), grant.FileID); err != nil {
		t.Fatal(err)
	}
	if err = service.Cleanup(ctx); !errors.Is(err, files.ErrUnavailable) {
		t.Fatalf("expiry cleanup must fail closed on reference lookup failure, got %v", err)
	}
	if record, err := service.Repo.Get(ctx, grant.FileID); err != nil || record.State != "ready" {
		t.Fatalf("reference lookup failure destroyed file: %+v %v", record, err)
	}
}

func TestExpiryCleanupRotatesPastReferencedBatch(t *testing.T) {
	ctx := t.Context()
	m, _, _ := setup(t)
	service := m.Files()
	now := time.Now().Add(-time.Hour).Unix()
	for i := 0; i < 26; i++ {
		id := fmt.Sprintf("expiry-%02d", i)
		f := files.Record{FileEntry: contracts.FileEntry{FileID: id, OriginalName: id + ".txt", StorageType: "local", LocationID: "local", MimeType: "text/plain", Size: 4, CreatorID: "system", CreatorRealm: "user", CreatedAt: int(now - 10), ExpiresAt: int(now), State: "ready"}, Key: "objects/" + id, Purpose: "user"}
		if err := service.Repo.Create(ctx, f, nil); err != nil {
			t.Fatal(err)
		}
	}
	service.References = []files.ReferenceChecker{referenceCheckerFunc(func(_ context.Context, id string) (bool, error) {
		return id != "expiry-25", nil
	})}
	for range 2 {
		if err := service.Cleanup(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if f, err := service.Repo.Get(ctx, "expiry-00"); err != nil || f.State != "ready" {
		t.Fatalf("referenced first-batch file was removed: %+v %v", f, err)
	}
	if f, err := service.Repo.Get(ctx, "expiry-25"); err != nil || f.State != "deleted" {
		t.Fatalf("protected first batch starved the later expired file: %+v %v", f, err)
	}
	service.References = nil
	if err := service.Cleanup(ctx); err != nil {
		t.Fatal(err)
	}
	if f, err := service.Repo.Get(ctx, "expiry-00"); err != nil || f.State != "deleted" {
		t.Fatalf("released reference was not revisited: %+v %v", f, err)
	}
}

type referenceCheckerFunc func(context.Context, string) (bool, error)

func (f referenceCheckerFunc) Referenced(ctx context.Context, fileID string) (bool, error) {
	return f(ctx, fileID)
}
