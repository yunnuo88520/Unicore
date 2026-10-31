// Author: yunnuo <ymz@ebox.vip>
// Description: File metadata transactions and 0009 retry run on every configured isolated SQL dialect.
package platformsql

import (
	"bytes"
	"context"
	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/adapter/storage/filesql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/secret"
	"github.com/yunnuo/unicore/internal/settings"
	"io"
	"path/filepath"
	"testing"
	"time"
)

func exerciseFiles(t *testing.T, ctx context.Context, store *sqlstore.Store, admin contracts.User) {
	t.Helper()
	dir := t.TempDir()
	key, e := secret.Open(dir, "")
	if e != nil {
		t.Fatal(e)
	}
	cfg := &settings.Service{Store: store, Secrets: key, Profile: "web-platform"}
	repo := &filesql.Repository{Store: store}
	s := &files.Service{Repo: repo, Settings: cfg, Secrets: key, Activate: cfg.SetStorageActive, Factory: func(l files.Location, _ files.Credentials) (blob.Store, error) {
		return bloblocal.New(filepath.Join(dir, l.ID)), nil
	}}
	a := files.Actor{ID: admin.ID, Realm: "administrator", Admin: true}
	data := []byte("cross-dialect private bytes")
	g, e := s.Upload(ctx, a, contracts.FileUploadInput{OriginalName: "dialect.txt", MimeType: "text/plain", Size: len(data)})
	if e != nil {
		t.Fatal(e)
	}
	if e = s.Receive(ctx, a, g.FileID, bytes.NewReader(data), int64(len(data))); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Complete(ctx, a, g.FileID); e != nil {
		t.Fatal(e)
	}
	list, e := repo.List(ctx, a, "dialect", 1)
	if e != nil || list.Total != 1 {
		t.Fatal("list", list.Total, e)
	}
	record, e := repo.Get(ctx, g.FileID)
	if e != nil || record.ETag == "" {
		t.Fatal("metadata", e)
	}
	reader, e := s.Factory(files.Location{StorageLocation: contracts.StorageLocation{ID: "local"}}, files.Credentials{})
	if e != nil {
		t.Fatal(e)
	}
	r, _, e := reader.Open(ctx, record.Key)
	if e != nil {
		t.Fatal(e)
	}
	got, _ := io.ReadAll(r)
	r.Close()
	if !bytes.Equal(got, data) {
		t.Fatal("content")
	}
	if e = s.Delete(ctx, a, g.FileID); e != nil {
		t.Fatal(e)
	}
	future := time.Now().Add(26 * time.Hour)
	s.Now = func() time.Time { return future }
	if e = s.Cleanup(ctx); e != nil {
		t.Fatal(e)
	}
	if _, e = reader.Stat(ctx, record.Key); e == nil {
		t.Fatal("cleanup failed")
	}
	if _, e = store.Exec(ctx, store.DB, "DELETE FROM schema_migrations WHERE version=9"); e != nil {
		t.Fatal(e)
	}
	if e = store.Migrate(ctx, true); e != nil {
		t.Fatal("0009 retry", e)
	}
	f, e := repo.Get(ctx, g.FileID)
	if e != nil || f.State != "deleted" {
		t.Fatal("migration retry lost metadata", e)
	}
}
