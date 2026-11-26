// Author: yunnuo <ymz@ebox.vip>
// Description: Signed local downloads remain valid by file identity across storage migration.
package files_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
)

func TestLocalDownloadGrantSurvivesStorageMigration(t *testing.T) {
	ctx := context.Background()
	m, admin, _ := setup(t)
	s := m.Files()
	now := time.Now().UTC().Truncate(time.Second)
	s.Now = func() time.Time { return now }
	payload := []byte("download bytes across migration")
	grant, err := s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "report.txt", MimeType: "text/plain", Size: len(payload)})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Complete(ctx, admin, grant.FileID); err != nil {
		t.Fatal(err)
	}
	link, err := s.Access(ctx, admin, grant.FileID)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(link.Url)
	if err != nil {
		t.Fatal(err)
	}
	expires := int64(link.ExpiresAt)
	v2Signature := parsed.Query().Get("signature")
	if v2Signature == "" {
		t.Fatal("local access URL did not include a signature")
	}
	if _, _, err = s.Download(ctx, grant.FileID+"-other", v2Signature, expires); err != files.ErrNotFound {
		t.Fatal("signature was accepted for another file ID", err)
	}
	if _, _, err = s.Download(ctx, grant.FileID, v2Signature, expires-1); err != files.ErrNotFound {
		t.Fatal("signature was accepted with a changed expiry", err)
	}

	before, err := s.Repo.Get(ctx, grant.FileID)
	if err != nil {
		t.Fatal(err)
	}
	legacySignature := s.Secrets.Seal(fmt.Sprintf("%s:%s:%d", before.FileID, before.Key, expires))
	if _, _, err = s.Download(ctx, grant.FileID, s.Secrets.Seal(fmt.Sprintf("other:%s:%d", before.Key, expires)), expires); err != files.ErrNotFound {
		t.Fatal("legacy signature was accepted for another file ID", err)
	}
	if _, _, err = s.Download(ctx, grant.FileID, s.Secrets.Seal(fmt.Sprintf("%s:%s:%d", before.FileID, before.Key, expires+1)), expires); err != files.ErrNotFound {
		t.Fatal("legacy signature was accepted with a changed expiry", err)
	}

	credentials, err := json.Marshal(files.Credentials{AccessKey: "test-access", SecretKey: "test-secret"})
	if err != nil {
		t.Fatal(err)
	}
	destinationID := "controlled-s3"
	destination := files.Location{
		StorageLocation: contracts.StorageLocation{ID: destinationID, Name: "Controlled S3", Provider: "s3", Endpoint: "https://storage.example.test", Bucket: "unicore-test", Region: "us-east-1", Tested: true, CreatedAt: int(now.Unix())},
		Credentials:     s.Secrets.Seal(string(credentials)),
	}
	if err = s.Repo.SaveLocation(ctx, destination, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	originalFactory := s.Factory
	remote := bloblocal.New(t.TempDir())
	s.Factory = func(location files.Location, credentials files.Credentials) (blob.Store, error) {
		if location.ID == destinationID {
			return remote, nil
		}
		return originalFactory(location, credentials)
	}
	if _, err = s.Migrate(ctx, admin, grant.FileID, destinationID); err != nil {
		t.Fatal("migrate into controlled object-store adapter", err)
	}
	after, err := s.Repo.Get(ctx, grant.FileID)
	if err != nil || after.LocationID != destinationID || after.StorageType != "s3" {
		t.Fatal("file did not move to the controlled object location", after, err)
	}
	for label, signature := range map[string]string{"v2": v2Signature, "legacy": legacySignature} {
		reader, _, openErr := s.Download(ctx, grant.FileID, signature, expires)
		if openErr != nil {
			t.Fatalf("%s signed URL failed after migration: %v", label, openErr)
		}
		got, readErr := io.ReadAll(reader)
		reader.Close()
		if readErr != nil || !bytes.Equal(got, payload) {
			t.Fatalf("%s signed URL returned wrong bytes: %q, %v", label, got, readErr)
		}
	}
	if err = s.Delete(ctx, admin, grant.FileID); err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.Download(ctx, grant.FileID, v2Signature, expires); err != files.ErrNotFound {
		t.Fatal("signed URL remained usable after deletion", err)
	}
}

func TestSignedDownloadStillRejectsExpiredMetadata(t *testing.T) {
	ctx := context.Background()
	m, admin, _ := setup(t)
	s := m.Files()
	now := time.Now().UTC().Truncate(time.Second)
	s.Now = func() time.Time { return now }
	payload := []byte("expires with metadata")
	grant, err := s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "expiring.txt", MimeType: "text/plain", Size: len(payload)})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Complete(ctx, admin, grant.FileID); err != nil {
		t.Fatal(err)
	}
	link, err := s.Access(ctx, admin, grant.FileID)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(link.Url)
	if err != nil {
		t.Fatal(err)
	}
	record, err := s.Repo.Get(ctx, grant.FileID)
	if err != nil {
		t.Fatal(err)
	}
	record.ExpiresAt = int(now.Unix())
	if err = s.Repo.Change(ctx, record, nil, admin.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.Download(ctx, grant.FileID, parsed.Query().Get("signature"), int64(link.ExpiresAt)); err != files.ErrNotFound {
		t.Fatal("signed URL bypassed the current file expiry", err)
	}
}
