// Author: yunnuo <ymz@ebox.vip>
// Description: Real metadata/local and opt-in MinIO tests for private access, immutable locations and cleanup.
package files_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/install"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

func setup(t *testing.T) (*install.Manager, files.Actor, string) {
	return setupDatabase(t, contracts.DatabaseInput{Driver: "sqlite"})
}
func setupDatabase(t *testing.T, database contracts.DatabaseInput) (*install.Manager, files.Actor, string) {
	t.Helper()
	dir := t.TempDir()
	m, e := install.Open(context.Background(), install.Options{DataDir: dir})
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { m.Close() })
	token, e := os.ReadFile(m.TokenPath())
	if e != nil {
		t.Fatal(e)
	}
	_, admin, e := m.Complete(context.Background(), strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: database, SiteName: "Unicore", BaseUrl: "http://127.0.0.1:8080", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if e != nil {
		t.Fatal(e)
	}
	return m, files.Actor{ID: admin.ID, Realm: "administrator", Admin: true}, dir
}
func TestPrivateLocalLifecycle(t *testing.T) {
	ctx := context.Background()
	m, a, dir := setup(t)
	s := m.Files()
	payload := []byte("private content")
	input := contracts.FileUploadInput{OriginalName: "private.txt", MimeType: "text/plain", Size: len(payload)}
	g, e := s.Upload(ctx, a, input)
	if e != nil || g.Direct {
		t.Fatal("grant", e)
	}
	if e = s.Receive(ctx, a, g.FileID, bytes.NewReader(payload), int64(len(payload)-1)); !errors.Is(e, files.ErrInvalid) {
		t.Fatal("accepted mismatch", e)
	}
	if e = s.Receive(ctx, a, g.FileID, bytes.NewReader(payload), int64(len(payload))); e != nil {
		t.Fatal(e)
	}
	f, e := s.Complete(ctx, a, g.FileID)
	if e != nil || f.State != "ready" {
		t.Fatal("complete", e)
	}
	if _, e = s.Complete(ctx, a, g.FileID); e != nil {
		t.Fatal("not idempotent", e)
	}
	if e = s.Receive(ctx, a, g.FileID, bytes.NewReader(payload), int64(len(payload))); e != files.ErrBusy {
		t.Fatal("completed file overwritten", e)
	}
	for _, other := range []files.Actor{{ID: a.ID, Realm: "user"}, {ID: "stranger", Realm: "administrator"}} {
		if _, e = s.Access(ctx, other, g.FileID); e != files.ErrNotFound {
			t.Fatal("owner boundary", e)
		}
		if e = s.Delete(ctx, other, g.FileID); e != files.ErrNotFound {
			t.Fatal("delete boundary", e)
		}
	}
	link, e := s.Access(ctx, a, g.FileID)
	if e != nil {
		t.Fatal(e)
	}
	u, _ := url.Parse(link.Url)
	expires := int64(link.ExpiresAt)
	signature := u.Query().Get("signature")
	reader, _, e := s.Download(ctx, g.FileID, signature, expires)
	if e != nil {
		t.Fatal(e)
	}
	got, _ := io.ReadAll(reader)
	reader.Close()
	if !bytes.Equal(payload, got) {
		t.Fatal("bytes differ")
	}
	if _, _, e = s.Download(ctx, g.FileID, signature+"bad", expires); e != files.ErrNotFound {
		t.Fatal("bad signature accepted")
	}
	store, settings, _, _ := m.Services()
	raw, _ := settings.Store.ReadSettings(ctx)
	if raw["storage.active"] != "local" {
		t.Fatal("not local default")
	}
	if _, e = settings.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "storage.active", Value: "unknown"}}}, a.ID); e == nil {
		t.Fatal("bypassed activation")
	}
	if e = m.Close(); e != nil {
		t.Fatal(e)
	}
	m, e = install.Open(ctx, install.Options{DataDir: dir})
	if e != nil {
		t.Fatal(e)
	}
	defer m.Close()
	s = m.Files()
	if _, e = s.Access(ctx, a, g.FileID); e != nil {
		t.Fatal("restart lost metadata", e)
	}
	store, _, _, _ = m.Services()
	_ = store
	if e = s.Delete(ctx, a, g.FileID); e != nil {
		t.Fatal(e)
	}
	if _, _, e = s.Download(ctx, g.FileID, signature, expires); e != files.ErrNotFound {
		t.Fatal("deleted local file accessible", e)
	}
	future := time.Now().Add(26 * time.Hour)
	s.Now = func() time.Time { return future }
	if e = s.Cleanup(ctx); e != nil {
		t.Fatal(e)
	}
	record, e := s.Repo.Get(ctx, g.FileID)
	if e != nil || record.State != "deleted" {
		t.Fatal("metadata state", e)
	}
}
func TestMinIODirectAndMigration(t *testing.T) {
	endpoint := os.Getenv("UNICORE_TEST_MINIO_ENDPOINT")
	if endpoint == "" {
		t.Skip("MinIO test environment not supplied")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	ak, sk := os.Getenv("UNICORE_TEST_MINIO_ACCESS_KEY"), os.Getenv("UNICORE_TEST_MINIO_SECRET_KEY")
	bucket := os.Getenv("UNICORE_TEST_MINIO_BUCKET")
	if bucket == "" {
		t.Fatal("bucket required")
	}
	u, e := url.Parse(endpoint)
	if e != nil {
		t.Fatal(e)
	}
	mc, e := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(ak, sk, ""), Secure: u.Scheme == "https"})
	if e != nil {
		t.Fatal("client")
	}
	exists, e := mc.BucketExists(ctx, bucket)
	if e != nil {
		t.Fatal("bucket connection failed")
	}
	if !exists {
		if e = mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); e != nil {
			t.Fatal("create test bucket failed")
		}
	}
	m, a, _ := setup(t)
	s := m.Files()
	prefix := "unicore-acceptance-" + time.Now().Format("20060102T150405.000000000")
	input := contracts.StorageLocationInput{Name: "MinIO acceptance", Provider: "minio", Endpoint: endpoint, Bucket: bucket, Prefix: prefix, PathStyle: true, AccessKey: ak, SecretKey: sk}
	l, e := s.SaveLocation(ctx, input, "", a.ID)
	if e != nil {
		t.Fatal("save location", e)
	}
	if e = s.ActivateLocation(ctx, l.ID, a.ID); e != files.ErrNotReady {
		t.Fatal("untested activated", e)
	}
	if e = s.Test(ctx, l.ID, a.ID); e != nil {
		t.Fatal("probe", e)
	}
	if e = s.ActivateLocation(ctx, l.ID, a.ID); e != nil {
		t.Fatal("activate", e)
	}
	if e = s.Browser(ctx, l.ID, "http://127.0.0.1:8080"); e != nil {
		t.Fatal("browser CORS", e)
	}
	all, _ := s.Locations(ctx)
	raw, _ := json.Marshal(all)
	if bytes.Contains(raw, []byte(sk)) {
		t.Fatal("secret disclosed")
	}
	db, _, _, _ := m.Services()
	var encrypted string
	if e = db.Row(ctx, db.DB, "SELECT credentials FROM storage_locations WHERE id=?", l.ID).Scan(&encrypted); e != nil || strings.Contains(encrypted, sk) {
		t.Fatal("credential encryption")
	}
	changed := input
	changed.Bucket += "-different"
	if _, e = s.SaveLocation(ctx, changed, l.ID, a.ID); e != files.ErrInvalid {
		t.Fatal("mutable target", e)
	}
	payload := []byte("Unicore MinIO direct file")
	grant, e := s.Upload(ctx, a, contracts.FileUploadInput{OriginalName: "cloud.txt", MimeType: "text/plain", Size: len(payload)})
	if e != nil || !grant.Direct || grant.Method != "POST" {
		t.Fatal("direct grant", e)
	}
	// Build the actual browser POST form using the SDK-generated fields.
	response := postGrant(t, ctx, grant, payload)
	if response.StatusCode != 204 {
		t.Fatalf("direct upload status %d", response.StatusCode)
	}
	response.Body.Close()
	f, e := s.Complete(ctx, a, grant.FileID)
	if e != nil || f.State != "ready" {
		t.Fatal("confirm", e)
	}
	record, _ := s.Repo.Get(ctx, f.FileID)
	defer mc.RemoveObject(ctx, bucket, prefix+"/"+record.Key, minio.RemoveObjectOptions{})
	defer mc.RemoveObject(ctx, bucket, grant.Fields["key"], minio.RemoveObjectOptions{})
	link, e := s.Access(ctx, a, f.FileID)
	if e != nil {
		t.Fatal(e)
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", link.Url, nil)
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal("signed download")
	}
	got, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || !bytes.Equal(got, payload) || !strings.HasPrefix(res.Header.Get("Content-Disposition"), "attachment") {
		t.Fatal("download differs")
	}
	unsigned := endpoint + "/" + bucket + "/" + prefix + "/" + record.Key
	req, _ = http.NewRequestWithContext(ctx, "GET", unsigned, nil)
	res, e = http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal("unsigned check")
	}
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatal("test bucket is not private")
	}
	// Replaying the staging grant must never overwrite the ready object.
	replay := postGrant(t, ctx, grant, bytes.Repeat([]byte("z"), len(payload)))
	replay.Body.Close()
	req, _ = http.NewRequestWithContext(ctx, "GET", link.Url, nil)
	res, e = http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal("replay download")
	}
	got, _ = io.ReadAll(res.Body)
	res.Body.Close()
	if !bytes.Equal(got, payload) {
		t.Fatal("staging replay overwrote final file")
	}
	if e = s.ActivateLocation(ctx, "local", a.ID); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Access(ctx, a, f.FileID); e != nil {
		t.Fatal("default switch broke history")
	}
	moved, e := s.Migrate(ctx, a, f.FileID, "local")
	if e != nil || moved.FileID != f.FileID || moved.StorageType != "local" {
		t.Fatal("migration", e)
	}
	// Wrong size must be rejected by POST policy, before confirmation.
	if e = s.ActivateLocation(ctx, l.ID, a.ID); e != nil {
		t.Fatal(e)
	}
	tooBig, e := s.Upload(ctx, a, contracts.FileUploadInput{OriginalName: "bad.txt", MimeType: "text/plain", Size: 3})
	if e != nil {
		t.Fatal(e)
	}
	r := postGrant(t, ctx, tooBig, []byte("oversized"))
	r.Body.Close()
	if r.StatusCode < 400 {
		t.Fatal("POST policy accepted incorrect size")
	}
	defer mc.RemoveObject(ctx, bucket, tooBig.Fields["key"], minio.RemoveObjectOptions{})
}

func postGrant(t *testing.T, ctx context.Context, g contracts.FileUploadGrant, payload []byte) *http.Response {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for k, v := range g.Fields {
		if e := w.WriteField(k, v); e != nil {
			t.Fatal(e)
		}
	}
	part, e := w.CreateFormFile("file", "upload.bin")
	if e != nil {
		t.Fatal(e)
	}
	part.Write(payload)
	w.Close()
	req, _ := http.NewRequestWithContext(ctx, g.Method, g.Url, &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	r, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal("direct POST failed")
	}
	return r
}

// A copy failure persists a retryable state; a fresh process must resume without publishing partial data.
func TestInterruptedConfirmationAndExpiry(t *testing.T) {
	ctx := context.Background()
	m, a, dir := setup(t)
	s := m.Files()
	original := s.Factory
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		st, e := original(l, c)
		return failingCopy{Store: st}, e
	}
	g, e := s.Upload(ctx, a, contracts.FileUploadInput{OriginalName: "retry.txt", MimeType: "text/plain", Size: 5})
	if e != nil {
		t.Fatal(e)
	}
	if e = s.Receive(ctx, a, g.FileID, strings.NewReader("hello"), 5); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Complete(ctx, a, g.FileID); e != files.ErrUnavailable {
		t.Fatal("copy failure not reported", e)
	}
	if _, e = s.Access(ctx, a, g.FileID); e != files.ErrBusy {
		t.Fatal("unconfirmed file published", e)
	}
	m.Close()
	fresh, e := install.Open(ctx, install.Options{DataDir: dir})
	if e != nil {
		t.Fatal(e)
	}
	defer fresh.Close()
	s = fresh.Files()
	if _, e = s.Complete(ctx, a, g.FileID); e != nil {
		t.Fatal("restart did not resume", e)
	}
	_, cfg, _, _ := fresh.Services()
	if _, e = cfg.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "storage.pending_hours", Value: "1"}, {Key: "storage.upload_ttl", Value: "60"}}}, a.ID); e != nil {
		t.Fatal(e)
	}
	pending, e := s.Upload(ctx, a, contracts.FileUploadInput{OriginalName: "abandoned.txt", MimeType: "text/plain", Size: 5})
	if e != nil {
		t.Fatal(e)
	}
	if e = s.Receive(ctx, a, pending.FileID, strings.NewReader("hello"), 5); e != nil {
		t.Fatal(e)
	}
	clock := time.Now().Add(2 * time.Minute)
	s.Now = func() time.Time { return clock }
	if e = s.Receive(ctx, a, pending.FileID, strings.NewReader("hello"), 5); e != files.ErrBusy {
		t.Fatal("expired local grant accepted")
	}
	link, e := s.Access(ctx, a, g.FileID)
	if e != nil {
		t.Fatal(e)
	}
	clock = clock.Add(10 * time.Minute)
	u, _ := url.Parse(link.Url)
	if _, _, e = s.Download(ctx, g.FileID, u.Query().Get("signature"), int64(link.ExpiresAt)); e != files.ErrNotFound {
		t.Fatal("expired download accepted")
	}
	clock = clock.Add(2 * time.Hour)
	if e = s.Cleanup(ctx); e != nil {
		t.Fatal(e)
	}
	record, e := s.Repo.Get(ctx, pending.FileID)
	if e != nil || record.State != "deleted" {
		t.Fatal("abandoned upload not expired", e)
	}
	if _, e = s.Access(ctx, a, g.FileID); e != nil {
		t.Fatal("cleanup removed ready file", e)
	}
}

type failingCopy struct{ blob.Store }

func (f failingCopy) Copy(context.Context, string, string, string) error {
	return errors.New("isolated copy failure")
}
