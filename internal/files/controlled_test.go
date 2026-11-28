// Author: yunnuo <ymz@ebox.vip>
// Description: Real private-byte and ZIP downloads cannot survive department transfer, revocation or manifest replacement.
package files_test

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/secret"
)

type resourcePrincipalKey struct{}
type syntheticArtifact struct {
	file       files.ResourceFile
	department string
	deleted    bool
}

// This synthetic module implements the port's read guard. Its business rows
// intentionally do not have a creator-based visibility shortcut or Admin flag.
type artifactAuthorizer struct {
	mu          sync.RWMutex
	rows        map[string]syntheticArtifact
	scopes      map[string]platform.ScopeFilter
	revision    string
	readAllowed bool
	failure     error
}

func (a *artifactAuthorizer) WithResourceFiles(ctx context.Context, resource string, ids []string, visit func(files.ResourceSnapshot) error) error {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.failure != nil {
		return a.failure
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	subject, _ := ctx.Value(resourcePrincipalKey{}).(string)
	if !a.readAllowed || resource != "batch" || subject == "" {
		return files.ErrNotFound
	}
	selected := []files.ResourceFile{}
	for _, id := range ids {
		row, ok := a.rows[id]
		if !ok || row.deleted || !a.scopes[subject].ContainsDepartment(row.department) {
			return files.ErrNotFound
		}
		selected = append(selected, row.file)
	}
	return visit(files.ResourceSnapshot{Subject: subject, Revision: a.revision, Files: selected})
}
func (a *artifactAuthorizer) page(subject string, offset, limit int) ([]string, int) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	var ids []string
	for id, row := range a.rows {
		if a.readAllowed && !row.deleted && a.scopes[subject].ContainsDepartment(row.department) {
			ids = append(ids, id)
		}
	}
	slices.Sort(ids)
	total := len(ids)
	return ids[min(offset, total):min(offset+limit, total)], total
}

type controlledBlob struct {
	blob.Store
	opens, signs int
}

func (b *controlledBlob) Open(ctx context.Context, key string) (io.ReadCloser, blob.Object, error) {
	b.opens++
	return b.Store.Open(ctx, key)
}
func (b *controlledBlob) SignGet(context.Context, string, string, time.Duration, bool) (string, error) {
	b.signs++
	return "", errors.New("provider URLs would bypass revocation")
}

func TestControlledResourceDownloads(t *testing.T) {
	ctx := context.WithValue(t.Context(), resourcePrincipalKey{}, "reader:dept")
	private := bloblocal.New(t.TempDir())
	key, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	provider := &controlledBlob{Store: private}
	auth := &artifactAuthorizer{rows: map[string]syntheticArtifact{}, scopes: map[string]platform.ScopeFilter{
		"reader:dept": {DepartmentIDs: []string{"a"}}, "reader:all": {All: true},
		"other:dept": {DepartmentIDs: []string{"b"}}, "reader:self": {UserIDs: []string{"reader"}},
	}, revision: "1", readAllowed: true}
	for _, f := range []struct{ id, department string }{{"first", "a"}, {"second", "a"}, {"foreign", "b"}} {
		body := []byte("private:" + f.id)
		file := files.ResourceFile{FileID: f.id, Key: "artifacts/" + f.id, Name: "report.txt", MIME: "text/plain", Size: int64(len(body))}
		if _, err = private.Put(ctx, file.Key, bytes.NewReader(body), file.Size, file.MIME); err != nil {
			t.Fatal(err)
		}
		auth.rows[f.id] = syntheticArtifact{file: file, department: f.department}
	}
	now := time.Unix(1800000000, 0)
	store := &files.ControlledStore{Store: provider, Authorizer: auth, Secrets: key, Now: func() time.Time { return now }}
	ids, total := auth.page("reader:dept", 0, 1)
	second, total2 := auth.page("reader:dept", 1, 1)
	if total != 2 || total2 != 2 || len(ids) != 1 || len(second) != 1 || ids[0] == second[0] {
		t.Fatal("scoped pages/count", ids, second, total, total2)
	}
	allIDs := append(ids, second...)
	grant, err := store.Sign(ctx, "batch", allIDs, time.Minute)
	if err != nil || grant.Count != total {
		t.Fatal(grant, err)
	}
	stream, metadata, err := store.Open(ctx, grant.Token)
	if err != nil || metadata.MIME != "application/zip" {
		t.Fatal(metadata, err)
	}
	data, err := io.ReadAll(stream)
	stream.Close()
	if err != nil {
		t.Fatal(err)
	}
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil || len(archive.File) != total {
		t.Fatal("ZIP count", err)
	}
	for i, entry := range archive.File {
		r, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(r)
		r.Close()
		if err != nil || string(body) != "private:"+allIDs[i] {
			t.Fatal("ZIP scope", entry.Name, string(body), err)
		}
	}
	single, err := store.Sign(ctx, "batch", []string{"first"}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	stream, metadata, err = store.Open(ctx, single.Token)
	if err != nil || metadata.FileID != "first" {
		t.Fatal(metadata, err)
	}
	stream.Close()
	if provider.signs != 0 {
		t.Fatal("cloud bearer URL issued")
	}
	if _, err = store.Sign(ctx, "batch", []string{"foreign"}, time.Minute); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("foreign issuance", err)
	}
	self := context.WithValue(ctx, resourcePrincipalKey{}, "reader:self")
	if _, err = store.Sign(self, "batch", []string{"first"}, time.Minute); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("creator shortcut on resource", err)
	}
	// A grant is bound to the principal, including its credential's role.
	wide := context.WithValue(ctx, resourcePrincipalKey{}, "reader:all")
	if _, _, err = store.Open(wide, single.Token); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("grant reused by other principal", err)
	}
	before := provider.opens
	// Transfer keeps the historical batch shell, but removes old-department
	// detail, artifact list, count, individual file and entire archive access.
	auth.mu.Lock()
	moved := auth.rows["first"]
	moved.department = "b"
	auth.rows["first"] = moved
	auth.revision = "2"
	auth.mu.Unlock()
	ids, total = auth.page("reader:dept", 0, 20)
	if total != 1 || !slices.Equal(ids, []string{"second"}) {
		t.Fatal("transferred artifact in list/count", ids, total)
	}
	for _, token := range []string{single.Token, grant.Token} {
		if _, _, err = store.Open(ctx, token); !errors.Is(err, files.ErrNotFound) {
			t.Fatal("old download survived transfer", err)
		}
	}
	if provider.opens != before {
		t.Fatal("denied download opened bytes")
	}
	other := context.WithValue(ctx, resourcePrincipalKey{}, "other:dept")
	fresh, err := store.Sign(other, "batch", []string{"first"}, time.Minute)
	if err != nil {
		t.Fatal("new department denied", err)
	}
	stream, _, err = store.Open(other, fresh.Token)
	if err != nil {
		t.Fatal(err)
	}
	stream.Close()
	// Even a still-authorized principal must obtain a new manifest grant after
	// replacement; old archive caches are never consumed by this port.
	wideGrant, err := store.Sign(wide, "batch", []string{"first", "second"}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	auth.revision = "3"
	if _, _, err = store.Open(wide, wideGrant.Token); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("old revision survived", err)
	}
	auth.readAllowed = false
	if _, _, err = store.Open(other, fresh.Token); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("revoked operation survived", err)
	}
	auth.readAllowed = true
	deleted := auth.rows["first"]
	deleted.deleted = true
	auth.rows["first"] = deleted
	if _, err = store.Sign(other, "batch", []string{"first"}, time.Minute); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("deleted resource signed", err)
	}
	auth.failure = files.ErrUnavailable
	if _, _, err = store.Open(ctx, grant.Token); !errors.Is(err, files.ErrUnavailable) {
		t.Fatal("database failure allowed", err)
	}
	auth.failure = nil
	now = now.Add(time.Hour)
	if _, _, err = store.Open(ctx, grant.Token); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("expired grant", err)
	}
	if _, _, err = store.Open(ctx, grant.Token+"tampered"); !errors.Is(err, files.ErrNotFound) {
		t.Fatal("tampered grant", err)
	}
}

type resourceAuthorizationFunc func(context.Context, string, []string, func(files.ResourceSnapshot) error) error

func (f resourceAuthorizationFunc) WithResourceFiles(ctx context.Context, resource string, ids []string, visit func(files.ResourceSnapshot) error) error {
	return f(ctx, resource, ids, visit)
}

func TestControlledStoreRejectsIncompleteBindings(t *testing.T) {
	key, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	provider := &controlledBlob{Store: bloblocal.New(t.TempDir())}
	base := files.ResourceSnapshot{Subject: "reader", Revision: "1", Files: []files.ResourceFile{{FileID: "file", Key: "artifacts/file", Name: "report.txt", Size: 1}}}
	for _, tc := range []struct {
		name   string
		mutate func(*files.ResourceSnapshot)
	}{
		{"missing binding", func(s *files.ResourceSnapshot) { s.Files = nil }},
		{"wrong file", func(s *files.ResourceSnapshot) { s.Files[0].FileID = "foreign" }},
		{"missing principal", func(s *files.ResourceSnapshot) { s.Subject = "" }},
		{"missing revision", func(s *files.ResourceSnapshot) { s.Revision = "" }},
		{"ZIP traversal", func(s *files.ResourceSnapshot) { s.Files[0].Name = "../report.txt" }},
		{"ZIP backslash", func(s *files.ResourceSnapshot) { s.Files[0].Name = "folder\\report.txt" }},
		{"invalid object key", func(s *files.ResourceSnapshot) { s.Files[0].Key = "../private" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			snapshot := base
			snapshot.Files = slices.Clone(base.Files)
			tc.mutate(&snapshot)
			store := &files.ControlledStore{Store: provider, Secrets: key, Authorizer: resourceAuthorizationFunc(func(_ context.Context, _ string, _ []string, visit func(files.ResourceSnapshot) error) error {
				return visit(snapshot)
			})}
			if _, err := store.Sign(t.Context(), "batch", []string{"file"}, time.Minute); !errors.Is(err, files.ErrNotFound) {
				t.Fatal("incomplete authorization signed", err)
			}
		})
	}
	store := &files.ControlledStore{Store: provider, Secrets: key, Authorizer: resourceAuthorizationFunc(func(context.Context, string, []string, func(files.ResourceSnapshot) error) error { return nil })}
	if _, err := store.Sign(t.Context(), "batch", []string{"file"}, time.Minute); !errors.Is(err, files.ErrUnavailable) {
		t.Fatal("missing authorization callback accepted", err)
	}
	if _, err := store.Sign(t.Context(), "batch", []string{"file", "file"}, time.Minute); !errors.Is(err, files.ErrInvalid) {
		t.Fatal("duplicate selection accepted", err)
	}
	if provider.opens != 0 || provider.signs != 0 {
		t.Fatal("incomplete authorization accessed provider")
	}
}
