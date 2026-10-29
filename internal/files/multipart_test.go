// Author: yunnuo <ymz@ebox.vip>
// Description: Real persisted multipart restart, retries, ownership, size policy and confirmation failure recovery.
package files_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/install"
)

func multipartInput(data []byte) contracts.MultipartUploadInput {
	sum := sha256.Sum256(data)
	return contracts.MultipartUploadInput{OriginalName: "resume.bin", MimeType: "application/octet-stream", Size: len(data), Fingerprint: hex.EncodeToString(sum[:])}
}
func TestResumableLocalUpload(t *testing.T) {
	for _, driver := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			dsn := os.Getenv("UNICORE_FILE_TEST_" + strings.ToUpper(driver) + "_DSN")
			if driver != "sqlite" && dsn == "" {
				t.Skip("isolated DB not provided")
			}
			exerciseResumableUpload(t, contracts.DatabaseInput{Driver: driver, Dsn: dsn})
		})
	}
}
func exerciseResumableUpload(t *testing.T, database contracts.DatabaseInput) {
	ctx := context.Background()
	m, a, dir := setupDatabase(t, database)
	s := m.Files()
	payload := bytes.Repeat([]byte("chunk-content"), 1024*1024)
	input := multipartInput(payload)
	u, e := s.BeginUpload(ctx, a, input)
	if e != nil || u.PartCount != 2 {
		t.Fatal("begin", e, u.PartCount)
	}
	_, settings, _, _ := m.Services()
	if _, e = settings.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "storage.max_size_mb", Value: "1"}}}, a.ID); e != nil {
		t.Fatal(e)
	}
	if _, e = s.BeginUpload(ctx, a, input); e != files.ErrInvalid {
		t.Fatal("size policy bypassed", e)
	}
	// An accepted session keeps its immutable limits when policy changes.
	for _, other := range []files.Actor{{ID: a.ID, Realm: "user"}, {ID: "other", Realm: "administrator"}} {
		if _, e = s.UploadStatus(ctx, other, u.File.FileID); e != files.ErrNotFound {
			t.Fatal("realm/owner leak", e)
		}
		if _, e = s.UploadPartGrant(ctx, other, u.File.FileID, 1); e != files.ErrNotFound {
			t.Fatal("part authorization", e)
		}
	}
	id := u.File.FileID
	chunk := payload[:u.PartSize]
	if e = s.ReceiveUploadPart(ctx, a, id, 1, bytes.NewReader(chunk), int64(len(chunk)-1)); e != files.ErrInvalid {
		t.Fatal("length mismatch", e)
	}
	if _, e = s.UploadPartGrant(ctx, a, id, 0); e != files.ErrBusy {
		t.Fatal("invalid part", e)
	}
	if _, e = s.FinishUpload(ctx, a, id); e != files.ErrInvalid {
		t.Fatal("missing parts", e)
	}
	for i := 0; i < 2; i++ {
		if e = s.ReceiveUploadPart(ctx, a, id, 1, bytes.NewReader(chunk), int64(len(chunk))); e != nil {
			t.Fatal("retry", e)
		}
	}
	if e = m.Close(); e != nil {
		t.Fatal(e)
	}
	fresh, e := install.Open(ctx, install.Options{DataDir: dir})
	if e != nil {
		t.Fatal(e)
	}
	defer fresh.Close()
	s = fresh.Files()
	status, e := s.UploadStatus(ctx, a, id)
	if e != nil || len(status.Parts) != 1 || status.Parts[0].Number != 1 || status.PartSize != u.PartSize {
		t.Fatal("resume after restart", e, status)
	}
	if e = s.ReceiveUploadPart(ctx, a, id, 2, bytes.NewReader(payload[u.PartSize:]), int64(len(payload)-u.PartSize)); e != nil {
		t.Fatal(e)
	}
	// Simulate a crash/failure after native assembly. A new confirmation must reuse staging.
	original := s.Factory
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		st, e := original(l, c)
		return multipartCopyFailure{Store: st, Multipart: st.(blob.Multipart)}, e
	}
	if _, e = s.FinishUpload(ctx, a, id); e != files.ErrUnavailable {
		t.Fatal("copy failure", e)
	}
	if _, e = s.Access(ctx, a, id); e != files.ErrBusy {
		t.Fatal("partial file published", e)
	}
	s.Factory = original
	// A successful copy with incomplete or mismatched final metadata must remain private.
	for _, invalidMIME := range []bool{false, true} {
		s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
			st, e := original(l, c)
			return multipartInvalidMetadata{Store: st, Multipart: st.(blob.Multipart), invalidMIME: invalidMIME}, e
		}
		if _, e = s.FinishUpload(ctx, a, id); e != files.ErrUnavailable {
			t.Fatal("invalid final metadata published", e)
		}
		if _, e = s.Access(ctx, a, id); e != files.ErrBusy {
			t.Fatal("invalid final metadata accessible", e)
		}
	}
	s.Factory = original
	f, e := s.FinishUpload(ctx, a, id)
	if e != nil || f.State != "ready" {
		t.Fatal("finish recovery", e)
	}
	if _, e = s.FinishUpload(ctx, a, id); e != nil {
		t.Fatal("idempotence", e)
	}
	if e = s.ReceiveUploadPart(ctx, a, id, 1, bytes.NewReader(chunk), int64(len(chunk))); e != files.ErrBusy {
		t.Fatal("late write", e)
	}
	link, e := s.Access(ctx, a, id)
	if e != nil {
		t.Fatal(e)
	}
	target, _ := url.Parse(link.Url)
	reader, _, e := s.Download(ctx, id, target.Query().Get("signature"), int64(link.ExpiresAt))
	if e != nil {
		t.Fatal(e)
	}
	got, e := io.ReadAll(reader)
	reader.Close()
	if e != nil || !bytes.Equal(got, payload) {
		t.Fatal("assembled content differs", e)
	}
}

type multipartCopyFailure struct {
	blob.Store
	blob.Multipart
}

func (multipartCopyFailure) Copy(context.Context, string, string, string) error {
	return errors.New("injected failure")
}

type multipartInvalidMetadata struct {
	blob.Store
	blob.Multipart
	invalidMIME bool
}

func (s multipartInvalidMetadata) Stat(ctx context.Context, key string) (blob.Object, error) {
	o, e := s.Store.Stat(ctx, key)
	if strings.HasPrefix(key, "objects/") {
		if s.invalidMIME {
			o.MIME = "text/plain"
		} else {
			o.ETag = ""
		}
	}
	return o, e
}
func TestMultipartAbortExpiryAndCleanup(t *testing.T) {
	ctx := context.Background()
	m, a, _ := setup(t)
	s := m.Files()
	payload := []byte("aborted bytes")
	u, e := s.BeginUpload(ctx, a, multipartInput(payload))
	if e != nil {
		t.Fatal(e)
	}
	if e = s.ReceiveUploadPart(ctx, a, u.File.FileID, 1, bytes.NewReader(payload), int64(len(payload))); e != nil {
		t.Fatal(e)
	}
	f, _ := s.Repo.Get(ctx, u.File.FileID)
	locations, _ := s.Repo.Locations(ctx)
	var st blob.Store
	for _, l := range locations {
		if l.ID == f.LocationID {
			st, _ = s.Factory(l, files.Credentials{})
		}
	}
	mp := st.(blob.Multipart)
	if e = s.Delete(ctx, a, f.FileID); e != nil {
		t.Fatal(e)
	}
	if _, e = s.FinishUpload(ctx, a, f.FileID); e != files.ErrNotFound {
		t.Fatal("deleted complete", e)
	}
	s.Now = func() time.Time { return time.Unix(f.CleanupAt+7200, 0) }
	if e = s.Cleanup(ctx); e != nil {
		t.Fatal(e)
	}
	parts, e := mp.ListParts(ctx, f.Staging, "local")
	if e != nil || len(parts) != 0 {
		t.Fatal("orphaned parts", e)
	}
	expired, e := s.BeginUpload(ctx, a, multipartInput(payload))
	if e != nil {
		t.Fatal(e)
	}
	s.Now = func() time.Time { return time.Unix(int64(expired.ExpiresAt)+1, 0) }
	if _, e = s.UploadPartGrant(ctx, a, expired.File.FileID, 1); e != files.ErrBusy {
		t.Fatal("expired grant", e)
	}
}

func TestMinIOMultipartAbortAndRetry(t *testing.T) {
	endpoint, ak, sk, bucket := os.Getenv("UNICORE_TEST_MINIO_ENDPOINT"), os.Getenv("UNICORE_TEST_MINIO_ACCESS_KEY"), os.Getenv("UNICORE_TEST_MINIO_SECRET_KEY"), os.Getenv("UNICORE_TEST_MINIO_BUCKET")
	if endpoint == "" {
		t.Skip("MinIO test environment not provided")
	}
	ctx := context.Background()
	m, a, _ := setup(t)
	s := m.Files()
	prefix := "unicore-acceptance-multipart-" + time.Now().Format("20060102T150405.000000000")
	l, e := s.SaveLocation(ctx, contracts.StorageLocationInput{Name: "Multipart verification", Provider: "minio", Endpoint: endpoint, Bucket: bucket, Prefix: prefix, PathStyle: true, AccessKey: ak, SecretKey: sk}, "", a.ID)
	if e != nil {
		t.Fatal("location", e)
	}
	if e = s.Test(ctx, l.ID, a.ID); e != nil {
		t.Fatal("probe", e)
	}
	if e = s.ActivateLocation(ctx, l.ID, a.ID); e != nil {
		t.Fatal(e)
	}
	payload := bytes.Repeat([]byte("a"), 9<<20)
	u, e := s.BeginUpload(ctx, a, multipartInput(payload))
	if e != nil {
		t.Fatal(e)
	}
	g, e := s.UploadPartGrant(ctx, a, u.File.FileID, 1)
	if e != nil {
		t.Fatal(e)
	}
	request, e := http.NewRequestWithContext(ctx, "PUT", g.Url, bytes.NewReader(payload[:u.PartSize]))
	if e != nil {
		t.Fatal("request")
	}
	for k, v := range g.Headers {
		request.Header.Set(k, v)
	}
	response, e := http.DefaultClient.Do(request)
	if e != nil {
		t.Fatal("direct request failed")
	}
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("direct status %d", response.StatusCode)
	}
	status, e := s.UploadStatus(ctx, a, u.File.FileID)
	if e != nil || len(status.Parts) != 1 {
		t.Fatal("authoritative parts", e)
	}
	if e = s.Delete(ctx, a, u.File.FileID); e != nil {
		t.Fatal(e)
	}
	s.Now = func() time.Time { return time.Unix(int64(u.ExpiresAt)+7200, 0) }
	original := s.Factory
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		st, e := original(l, c)
		return abortFailure{Store: st, Multipart: st.(blob.Multipart)}, e
	}
	if e = s.Cleanup(ctx); e != nil {
		t.Fatal(e)
	}
	jobs, e := s.Repo.Jobs(ctx, s.Now().Unix())
	if e != nil || len(jobs) == 0 {
		t.Fatal("failed abort lost persistent cleanup", e)
	}
	s.Factory = original
	if e = s.Cleanup(ctx); e != nil {
		t.Fatal(e)
	}
	jobs, e = s.Repo.Jobs(ctx, s.Now().Unix())
	if e != nil || len(jobs) != 0 {
		t.Fatal("cleanup retry", e, len(jobs))
	}
	// An old native part signature cannot recreate an aborted upload or publish a file.
	request, _ = http.NewRequestWithContext(ctx, "PUT", g.Url, bytes.NewReader(payload[:u.PartSize]))
	for k, v := range g.Headers {
		request.Header.Set(k, v)
	}
	response, e = http.DefaultClient.Do(request)
	if e != nil {
		t.Fatal("replay request failed")
	}
	response.Body.Close()
	if response.StatusCode < 400 {
		t.Fatal("aborted native upload accepted replay")
	}
}

type abortFailure struct {
	blob.Store
	blob.Multipart
}

func (abortFailure) AbortMultipart(context.Context, string) error {
	return errors.New("injected abort failure")
}
