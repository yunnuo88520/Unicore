// Author: yunnuo <ymz@ebox.vip>
// Description: Instance catalog preserves business isolation and directory/ID identity across verified migration.
package files_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/url"
	"os"
	"path"
	"strings"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
)

func TestCatalogAllRealmsAndDirectoryFilters(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	for i, spec := range []struct{ realm, folder string }{{"user", "reports/a"}, {"avatar", "reports/a/deep"}, {"user", "reports/ab"}, {"user", "percent_%"}} {
		f := files.Record{FileEntry: contracts.FileEntry{FileID: fmt.Sprintf("catalog-%d", i), OriginalName: fmt.Sprintf("report-%d.txt", i), StorageType: "local", LocationID: "local", MimeType: "text/plain", Size: 4, CreatorID: "different-user", CreatorRealm: spec.realm, CreatedAt: i + 1, State: "ready"}, Key: "objects/" + spec.folder + "/object", Purpose: "user"}
		if err := s.Repo.Create(ctx, f, nil); err != nil {
			t.Fatal(err)
		}
	}
	for i, folder := range []string{"Docs", "docs"} {
		f := files.Record{FileEntry: contracts.FileEntry{FileID: fmt.Sprintf("case-catalog-%d", i), OriginalName: "case.txt", StorageType: "local", LocationID: "local", MimeType: "text/plain", Size: 4, CreatorID: "case-user", CreatorRealm: "avatar", CreatedAt: i + 10, State: "ready"}, Key: "objects/" + folder + "/object", Purpose: "user"}
		if err := s.Repo.Create(ctx, f, nil); err != nil {
			t.Fatal(err)
		}
	}
	data := []byte("normalized branding bytes")
	brandID := fmt.Sprintf("%x.png", sha256.Sum256(data))
	if _, err := s.BrandStore().Put(ctx, brandID, bytes.NewReader(data), int64(len(data)), "image/png"); err != nil {
		t.Fatal(err)
	}
	all, err := s.Catalog(ctx, admin, files.CatalogFilter{Page: 1})
	if err != nil || all.Total != 7 {
		t.Fatal("catalog must include every realm and branding", all, err)
	}
	for folder, want := range map[string]int{"reports/a": 2, "percent_%": 1, "reports/missing": 0} {
		result, err := s.Catalog(ctx, admin, files.CatalogFilter{Page: 1, Directory: folder})
		if err != nil || result.Total != want {
			t.Fatalf("directory %q: total=%d want=%d err=%v", folder, result.Total, want, err)
		}
	}
	for folder := range map[string]bool{"Docs": true, "docs": true} {
		result, err := s.Catalog(ctx, admin, files.CatalogFilter{Page: 1, Directory: folder})
		if err != nil || result.Total != 1 || result.Items[0].Directory != folder {
			t.Fatalf("case-sensitive directory %q: total=%d items=%+v err=%v", folder, result.Total, result.Items, err)
		}
	}
	selection, err := s.MigrationSelection(ctx, admin, files.CatalogFilter{Directory: "reports/a", DirectorySet: true})
	if err != nil || len(selection.FileIds) != 2 {
		t.Fatal("migration selection must respect the same subtree filter", selection, err)
	}
	root, err := s.Catalog(ctx, admin, files.CatalogFilter{Page: 1, DirectorySet: true})
	if err != nil || root.Total != 0 {
		t.Fatal("empty directory must select the default folder, not all descendants", root, err)
	}
	result, err := s.Catalog(ctx, admin, files.CatalogFilter{Page: 1, Search: "different-user"})
	if err != nil || result.Total != 4 {
		t.Fatal("uploader search", result, err)
	}
	dirs, err := s.Directories(ctx, admin)
	if err != nil || len(dirs.Items) != 7 {
		t.Fatal("directory aggregation", dirs, err)
	}
	personal, err := s.List(ctx, files.Actor{ID: "different-user", Realm: "user"}, "", 1, files.ScopeFilter{})
	if err != nil || personal.Total != 3 {
		t.Fatal("business list crossed purpose or realm", personal, err)
	}
	member := files.Actor{ID: "different-user", Realm: "user"}
	if _, err = s.Catalog(ctx, member, files.CatalogFilter{Page: 1}); err != files.ErrNotFound {
		t.Fatal("member catalog access", err)
	}
	if _, err = s.CatalogAccess(ctx, member, brandID); err != files.ErrNotFound {
		t.Fatal("member brand signing", err)
	}
	if _, err = s.Catalog(ctx, admin, files.CatalogFilter{Page: 1, Directory: "../secret"}); err != files.ErrInvalid {
		t.Fatal("invalid directory", err)
	}
}

func TestCatalogMigrationRejectsCloudToCloudAndFiltersSelection(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	for _, item := range []struct{ id, provider string }{{"cloud-one", "minio"}, {"cloud-two", "oss"}} {
		if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: item.id, Name: item.id, Provider: item.provider, Tested: true}}, true, admin.ID); err != nil {
			t.Fatal(err)
		}
	}
	for _, item := range []struct{ id, location, provider string }{{"local-file", "local", "local"}, {"first-cloud-file", "cloud-one", "minio"}, {"second-cloud-file", "cloud-two", "oss"}} {
		if err := s.Repo.Create(ctx, files.Record{FileEntry: contracts.FileEntry{FileID: item.id, OriginalName: item.id, LocationID: item.location, StorageType: item.provider, State: "ready", CreatorRealm: "user"}, Key: "objects/" + item.id, Purpose: "user"}, nil); err != nil {
			t.Fatal(err)
		}
	}
	// Reject before constructing stores or touching a cloud object.
	s.Factory = func(files.Location, files.Credentials) (blob.Store, error) {
		t.Fatal("cloud-to-cloud touched storage")
		return nil, nil
	}
	if _, err := s.Migrate(ctx, admin, "first-cloud-file", "cloud-two"); err != files.ErrInvalid {
		t.Fatal("cloud migration accepted", err)
	}
	for _, item := range []struct {
		target string
		count  int
	}{{"cloud-two", 1}, {"local", 2}} {
		selection, err := s.MigrationSelection(ctx, admin, files.CatalogFilter{TargetLocationID: item.target})
		if err != nil || len(selection.FileIds) != item.count {
			t.Fatal("unsupported batch selection", item.target, selection, err)
		}
	}
	current, err := s.Repo.Get(ctx, "first-cloud-file")
	if err != nil || current.LocationID != "cloud-one" {
		t.Fatal("rejected migration changed original", current, err)
	}
}

func TestVendorLocalCloudRoundTrip(t *testing.T) {
	for _, provider := range []string{"minio", "oss", "cos"} {
		t.Run(provider, func(t *testing.T) {
			env := func(key string) string { return os.Getenv("UNICORE_TEST_" + strings.ToUpper(provider) + "_" + key) }
			if env("ENDPOINT") == "" {
				t.Skip("vendor environment not provided")
			}
			ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
			defer cancel()
			m, admin, _ := setup(t)
			s := m.Files()
			_, settings, _, _ := m.Services()
			payload := []byte("round trip must preserve business bytes")
			grant, err := s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "round-trip.txt", MimeType: "text/plain", Size: len(payload)})
			if err != nil {
				t.Fatal("local upload", err)
			}
			if err = s.Receive(ctx, admin, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
				t.Fatal(err)
			}
			if _, err = s.Complete(ctx, admin, grant.FileID); err != nil {
				t.Fatal(err)
			}
			link, err := s.CatalogAccess(ctx, admin, grant.FileID)
			if err != nil {
				t.Fatal(err)
			}
			brandInput := func(size int) string {
				img := image.NewNRGBA(image.Rect(0, 0, size, size))
				for y := 0; y < size; y++ {
					for x := 0; x < size; x++ {
						img.SetNRGBA(x, y, color.NRGBA{R: 20, G: 110, B: 90, A: 255})
					}
				}
				var data bytes.Buffer
				if err := png.Encode(&data, img); err != nil {
					t.Fatal(err)
				}
				return base64.StdEncoding.EncodeToString(data.Bytes())
			}
			brand, err := settings.Branding.Update(ctx, contracts.BrandingInput{Slot: "logo", Content: brandInput(32)}, admin.ID, false)
			if err != nil {
				t.Fatal("local branding", err)
			}
			brandID := path.Base(brand.Logo)
			location, err := s.SaveLocation(ctx, contracts.StorageLocationInput{Name: "Round trip", Provider: provider, Endpoint: env("ENDPOINT"), Bucket: env("BUCKET"), Region: env("REGION"), Prefix: fmt.Sprintf("unicore-acceptance-roundtrip-%d", time.Now().UnixNano()), PathStyle: provider == "minio", AccessKey: env("ACCESS_KEY"), SecretKey: env("SECRET_KEY")}, "", admin.ID)
			if err != nil {
				t.Fatal("save target", err)
			}
			cloud, err := s.Factory(files.Location{StorageLocation: location}, files.Credentials{AccessKey: env("ACCESS_KEY"), SecretKey: env("SECRET_KEY")})
			if err != nil {
				t.Fatal(err)
			}
			// Cleanup only exact keys registered by this isolated test, including queued orphans.
			defer func() {
				cleanup, finish := context.WithTimeout(context.Background(), 30*time.Second)
				defer finish()
				jobs, _ := s.Repo.Jobs(cleanup, time.Now().Add(48*time.Hour).Unix())
				for _, job := range jobs {
					if job.LocationID == location.ID {
						if err := cloud.Delete(cleanup, job.Key); err != nil {
							t.Error("cloud cleanup", err)
						}
					}
				}
				catalog, _ := s.Repo.(files.CatalogRepository).Catalog(cleanup, files.CatalogFilter{Page: 1, LocationID: location.ID})
				for _, item := range catalog.Items {
					record, e := s.Repo.Get(cleanup, item.File.FileID)
					if e == nil {
						if err := cloud.Delete(cleanup, record.Key); err != nil {
							t.Error("cloud cleanup", err)
						}
					}
				}
			}()
			if err = s.Test(ctx, location.ID, admin.ID); err != nil {
				t.Fatal("connection probe", err)
			}
			for _, id := range []string{grant.FileID, brandID} {
				if _, err = s.Migrate(ctx, admin, id, location.ID); err != nil {
					t.Fatal("local to cloud", err)
				}
			}
			if _, err = settings.Branding.Asset(ctx, brandID); err != nil {
				t.Fatal("brand read after cloud migration", err)
			}
			parsed, _ := url.Parse(link.Url)
			reader, _, err := s.Download(ctx, grant.FileID, parsed.Query().Get("signature"), int64(link.ExpiresAt))
			if err != nil {
				t.Fatal("old local link after cloud migration", err)
			}
			got, err := io.ReadAll(reader)
			reader.Close()
			if err != nil || !bytes.Equal(got, payload) {
				t.Fatal("cloud bytes differ", err)
			}
			if err = s.ActivateLocation(ctx, location.ID, admin.ID); err != nil {
				t.Fatal(err)
			}
			newBrand, err := settings.Branding.Update(ctx, contracts.BrandingInput{Slot: "logo_dark", Content: brandInput(40)}, admin.ID, false)
			if err != nil {
				t.Fatal("brand upload on active cloud", err)
			}
			newID := path.Base(newBrand.LogoDark)
			record, err := s.Repo.Get(ctx, newID)
			if err != nil || record.LocationID != location.ID {
				t.Fatal("new brand ignored active storage", err)
			}
			locations, err := s.Locations(ctx)
			activeCount := 0
			for _, item := range locations.Items {
				if item.Active {
					activeCount++
				}
			}
			if err != nil || activeCount != 1 || locations.ActiveID != location.ID {
				t.Fatal("global default is not singular", err)
			}
			for _, id := range []string{grant.FileID, brandID, newID} {
				if _, err = s.Migrate(ctx, admin, id, "local"); err != nil {
					t.Fatal("cloud to local", err)
				}
			}
			if err = s.ActivateLocation(ctx, "local", admin.ID); err != nil {
				t.Fatal(err)
			}
			for _, id := range []string{brandID, newID} {
				if _, err = settings.Branding.Asset(ctx, id); err != nil {
					t.Fatal("local brand after return", err)
				}
			}
		})
	}
}

type catalogCorruptPut struct{ blob.Store }

func (b catalogCorruptPut) Put(ctx context.Context, key string, _ io.Reader, size int64, mime string) (blob.Object, error) {
	return b.Store.Put(ctx, key, bytes.NewReader(bytes.Repeat([]byte{'x'}, int(size))), size, mime)
}

func TestCatalogMigrationRejectsCorruptCopy(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	data := []byte("original source bytes")
	id := fmt.Sprintf("%x.png", sha256.Sum256(data))
	if _, err := s.BrandStore().Put(ctx, id, bytes.NewReader(data), int64(len(data)), "image/png"); err != nil {
		t.Fatal(err)
	}
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "corrupt-target", Name: "Corrupt", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	original := s.Factory
	destination := bloblocal.New(t.TempDir())
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		if l.ID == "corrupt-target" {
			return catalogCorruptPut{Store: destination}, nil
		}
		return original(l, c)
	}
	if _, err := s.Migrate(ctx, admin, id, "corrupt-target"); err != files.ErrUnavailable {
		t.Fatal("corrupt destination passed digest verification", err)
	}
	f, err := s.Repo.Get(ctx, id)
	if err != nil || f.LocationID != "local" || f.State != "ready" {
		t.Fatal("failed migration switched the reference", f, err)
	}
	reader, _, err := s.BrandStore().Open(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(reader)
	reader.Close()
	if !bytes.Equal(got, data) {
		t.Fatal("failed migration changed original bytes")
	}
}

func TestCatalogMigrationRejectsChangedSource(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	payload := []byte("original immutable bytes")
	id := fmt.Sprintf("%x.png", sha256.Sum256(payload))
	if _, err := s.BrandStore().Put(ctx, id, bytes.NewReader(payload), int64(len(payload)), "image/png"); err != nil {
		t.Fatal(err)
	}
	f, err := s.Repo.Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	locations, err := s.Locations(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var source files.Location
	for _, location := range locations.Items {
		if location.ID == f.LocationID {
			source.StorageLocation = location
		}
	}
	store, err := s.Factory(source, files.Credentials{})
	if err != nil {
		t.Fatal(err)
	}
	// Simulate same-length corruption outside the file service. A successful
	// source-to-target digest comparison alone must not bless those bytes.
	if _, err = store.Put(ctx, f.Key, bytes.NewReader(bytes.Repeat([]byte{'x'}, len(payload))), int64(len(payload)), "image/png"); err != nil {
		t.Fatal(err)
	}
	if err = s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "fresh-target", Name: "Target", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Migrate(ctx, admin, id, "fresh-target"); err != files.ErrUnavailable {
		t.Fatal("changed source ETag was accepted", err)
	}
	after, err := s.Repo.Get(ctx, id)
	if err != nil || after.LocationID != f.LocationID || after.Key != f.Key {
		t.Fatal("changed source switched metadata", after, err)
	}
}

type catalogBlockingPut struct {
	blob.Store
	started chan struct{}
	release chan struct{}
}

func (b catalogBlockingPut) Put(ctx context.Context, key string, reader io.Reader, size int64, mime string) (blob.Object, error) {
	close(b.started)
	select {
	case <-b.release:
	case <-ctx.Done():
		return blob.Object{}, ctx.Err()
	}
	return b.Store.Put(ctx, key, reader, size, mime)
}

func TestCatalogMigrationDoesNotBlockReadsOrResurrectDeletedFile(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	payload := []byte("migration bytes")
	id := fmt.Sprintf("%x.png", sha256.Sum256(payload))
	if _, err := s.BrandStore().Put(ctx, id, bytes.NewReader(payload), int64(len(payload)), "image/png"); err != nil {
		t.Fatal(err)
	}
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "slow-target", Name: "Slow", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	original := s.Factory
	started, release := make(chan struct{}), make(chan struct{})
	var released bool
	defer func() {
		if !released {
			close(release)
		}
	}()
	destination := bloblocal.New(t.TempDir())
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		if l.ID == "slow-target" {
			return catalogBlockingPut{Store: destination, started: started, release: release}, nil
		}
		return original(l, c)
	}
	done := make(chan error, 1)
	go func() { _, err := s.Migrate(ctx, admin, id, "slow-target"); done <- err }()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("migration did not begin")
	}
	read := make(chan error, 1)
	go func() { _, err := s.CatalogAccess(ctx, admin, id); read <- err }()
	select {
	case err := <-read:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("slow migration blocked signed reads")
	}
	if err := s.CatalogDelete(ctx, admin, id); err != nil {
		t.Fatal(err)
	}
	close(release)
	released = true
	if err := <-done; err != files.ErrBusy {
		t.Fatal("concurrent deletion was not detected", err)
	}
	f, err := s.Repo.Get(ctx, id)
	if err != nil || f.State != "deleted" || f.LocationID != "local" {
		t.Fatal("migration resurrected deleted metadata", f, err)
	}
}

func TestCatalogBrandingAndBusinessMigrationPreservesReferences(t *testing.T) {
	ctx := t.Context()
	m, admin, _ := setup(t)
	s := m.Files()
	targetDir := t.TempDir()
	if err := s.Repo.SaveLocation(ctx, files.Location{StorageLocation: contracts.StorageLocation{ID: "target", Name: "Target", Provider: "local", Tested: true}}, true, admin.ID); err != nil {
		t.Fatal(err)
	}
	original := s.Factory
	s.Factory = func(l files.Location, c files.Credentials) (blob.Store, error) {
		if l.ID == "target" {
			return bloblocal.New(targetDir), nil
		}
		return original(l, c)
	}
	data := []byte("private migration content")
	grant, err := s.Upload(ctx, admin, contracts.FileUploadInput{OriginalName: "source.txt", MimeType: "text/plain", Size: len(data)})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Receive(ctx, admin, grant.FileID, bytes.NewReader(data), int64(len(data))); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Complete(ctx, admin, grant.FileID); err != nil {
		t.Fatal(err)
	}
	brandID := fmt.Sprintf("%x.png", sha256.Sum256(data))
	if _, err = s.BrandStore().Put(ctx, brandID, bytes.NewReader(data), int64(len(data)), "image/png"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{grant.FileID, brandID} {
		before, err := s.Repo.Get(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		moved, err := s.Migrate(ctx, admin, id, "target")
		if err != nil || moved.FileID != id || moved.LocationID != "target" {
			t.Fatal("migration reference", moved, err)
		}
		after, err := s.Repo.Get(ctx, id)
		if err != nil || path.Dir(after.Key) != path.Dir(before.Key) || after.Purpose != before.Purpose {
			t.Fatal("migration changed logical directory or purpose", before, after, err)
		}
		access, err := s.CatalogAccess(ctx, admin, id)
		if err != nil {
			t.Fatal(err)
		}
		u, _ := url.Parse(access.Url)
		reader, _, err := s.Download(ctx, id, u.Query().Get("signature"), int64(access.ExpiresAt))
		if err != nil {
			t.Fatal(err)
		}
		got, _ := io.ReadAll(reader)
		reader.Close()
		if !bytes.Equal(got, data) {
			t.Fatal("migrated bytes differ")
		}
		if !strings.HasPrefix(after.Key, path.Dir(before.Key)+"/") {
			t.Fatal("folder lost")
		}
	}
	reader, _, err := s.BrandStore().Open(ctx, brandID)
	if err != nil {
		t.Fatal("public brand lookup after migration", err)
	}
	reader.Close()
}
