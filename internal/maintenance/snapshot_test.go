// Author: yunnuo <ymz@ebox.vip>
// Description: Restore real installed databases, private files, identities and business rows without touching the source instance.
package maintenance

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/adapter/storage/notessql"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/usecase"
)

const testPassphrase = "isolated-backup-test-passphrase"

func TestInstalledBackupRestore(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres", "mysql"} {
		t.Run(driver, func(t *testing.T) {
			suffix := strings.ToUpper(driver)
			dsn := os.Getenv("UNICORE_MAINTENANCE_" + suffix + "_DSN")
			targetDSN := os.Getenv("UNICORE_MAINTENANCE_" + suffix + "_TARGET_DSN")
			container := os.Getenv("UNICORE_MAINTENANCE_" + suffix + "_CONTAINER")
			if driver != "sqlite" && (dsn == "" || targetDSN == "") {
				t.Skip("dedicated source/target maintenance databases not supplied")
			}
			ctx := context.Background()
			root := t.TempDir()
			source := filepath.Join(root, "source")
			target := filepath.Join(root, "restored")
			external := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{17}, 32))
			manager, err := install.Open(ctx, install.Options{DataDir: source, SecretKey: external})
			if err != nil {
				t.Fatal(err)
			}
			defer manager.Close()
			token, _ := os.ReadFile(manager.TokenPath())
			_, admin, err := manager.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: driver, Dsn: dsn}, SiteName: "Restore fixture", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "restore-test-password-strong"})
			if err != nil {
				t.Fatal(err)
			}
			db, _, _, _ := manager.Services()
			fs := manager.Files()
			actor := files.Actor{ID: admin.ID, Realm: "administrator", Admin: true}
			payload := []byte("backup private file bytes")
			grant, err := fs.Upload(ctx, actor, contracts.FileUploadInput{OriginalName: "private.txt", MimeType: "text/plain", Size: len(payload)})
			if err != nil {
				t.Fatal(err)
			}
			if err = fs.Receive(ctx, actor, grant.FileID, bytes.NewReader(payload), int64(len(payload))); err != nil {
				t.Fatal(err)
			}
			if _, err = fs.Complete(ctx, actor, grant.FileID); err != nil {
				t.Fatal(err)
			}
			ids := []string{grant.FileID}
			// Optional real private MinIO object; the test owns a fresh prefix only.
			if endpoint := os.Getenv("UNICORE_TEST_MINIO_ENDPOINT"); driver == "sqlite" && endpoint != "" {
				u, _ := url.Parse(endpoint)
				bucket := os.Getenv("UNICORE_TEST_MINIO_BUCKET")
				ak, sk := os.Getenv("UNICORE_TEST_MINIO_ACCESS_KEY"), os.Getenv("UNICORE_TEST_MINIO_SECRET_KEY")
				mc, e := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(ak, sk, ""), Secure: u.Scheme == "https"})
				if e != nil {
					t.Fatal(e)
				}
				exists, e := mc.BucketExists(ctx, bucket)
				if e != nil {
					t.Fatal(e)
				}
				if !exists {
					if e = mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); e != nil {
						t.Fatal(e)
					}
				}
				prefix := "unicore-backup-" + time.Now().Format("20060102T150405.000000000")
				location, e := fs.SaveLocation(ctx, contracts.StorageLocationInput{Name: "Backup fixture", Provider: "minio", Endpoint: endpoint, Bucket: bucket, Prefix: prefix, PathStyle: true, AccessKey: ak, SecretKey: sk}, "", admin.ID)
				if e != nil {
					t.Fatal(e)
				}
				if e = fs.Test(ctx, location.ID, admin.ID); e != nil {
					t.Fatal(e)
				}
				if e = fs.ActivateLocation(ctx, location.ID, admin.ID); e != nil {
					t.Fatal(e)
				}
				cloud, e := fs.Upload(ctx, actor, contracts.FileUploadInput{OriginalName: "cloud.txt", MimeType: "text/plain", Size: len(payload)})
				if e != nil {
					t.Fatal(e)
				}
				if _, e = mc.PutObject(ctx, bucket, cloud.Fields["key"], bytes.NewReader(payload), int64(len(payload)), minio.PutObjectOptions{ContentType: "text/plain"}); e != nil {
					t.Fatal(e)
				}
				if _, e = fs.Complete(ctx, actor, cloud.FileID); e != nil {
					t.Fatal(e)
				}
				record, _ := fs.Repo.Get(ctx, cloud.FileID)
				ids = append(ids, cloud.FileID)
				t.Cleanup(func() {
					_ = mc.RemoveObject(ctx, bucket, prefix+"/"+record.Key, minio.RemoveObjectOptions{})
					_ = mc.RemoveObject(ctx, bucket, cloud.Fields["key"], minio.RemoveObjectOptions{})
				})
				t.Cleanup(func() {
					if _, e = mc.StatObject(ctx, bucket, prefix+"/"+record.Key, minio.StatObjectOptions{}); e != nil {
						t.Error("restore changed source object", e)
					}
				})
			}
			n := &usecase.Notes{Repo: &notessql.Repository{Store: db}, Attachments: func(ctx context.Context, _ string, id string) error { return fs.ValidateAttachment(ctx, actor, id) }}
			note, err := n.Create(ctx, "administrator/"+admin.ID, contracts.NoteInput{Title: "Persistent idea", Body: "backup body", Status: "open", AttachmentIds: ids})
			if err != nil {
				t.Fatal(err)
			}
			backup := filepath.Join(root, "snapshot.tar.gz.age")
			o := BackupOptions{DataDir: source, Output: backup, Password: testPassphrase, ExternalKey: external, ToolContainer: container}
			if _, err = Backup(ctx, o); err == nil {
				t.Fatal("running instance backed up")
			}
			if err = manager.Close(); err != nil {
				t.Fatal(err)
			}
			m, err := Backup(ctx, o)
			if err != nil {
				t.Fatal(err)
			}
			if m.Schema != 9 || m.BusinessSchema != 1 {
				t.Fatal(m)
			}
			if _, err = Verify(backup, testPassphrase, 1<<30); err != nil {
				t.Fatal(err)
			}
			if _, err = Verify(backup, "wrong-passphrase", 1<<30); err == nil {
				t.Fatal("wrong password accepted")
			}
			if _, err = Backup(ctx, o); err == nil {
				t.Fatal("overwrote backup")
			}
			confirm := ""
			if driver != "sqlite" {
				confirm, err = databaseName(driver, targetDSN)
				if err != nil {
					t.Fatal(err)
				}
			}
			restore := RestoreOptions{Input: backup, DataDir: target, Password: testPassphrase, DatabaseDSN: targetDSN, ConfirmDatabase: confirm, BaseURL: "http://127.0.0.1:18080", ToolContainer: container}
			if _, err = Restore(ctx, restore); err != nil {
				t.Fatal(err)
			}
			if _, err = Restore(ctx, restore); err == nil {
				t.Fatal("existing destination accepted")
			}
			restored, err := install.Open(ctx, install.Options{DataDir: target})
			if err != nil {
				t.Fatal("restart restored", err)
			}
			defer restored.Close()
			current, _, _, _ := restored.Services()
			rows, err := (&notessql.Repository{Store: current}).List(ctx, "administrator/"+admin.ID, contracts.NoteQuery{Page: 1, Sort: "title", Direction: "asc"})
			if err != nil || len(rows.Items) != 1 || rows.Items[0].ID != note.ID || rows.Items[0].Body != "backup body" {
				t.Fatal("business rows", rows, err)
			}
			if _, _, err = restored.Identity(true).Login(ctx, contracts.LoginInput{Username: "admin", Password: "restore-test-password-strong"}, "local", false, 1); err != nil {
				t.Fatal("restored identity/key", err)
			}
			locations, err := restored.Files().Locations(ctx)
			if err != nil || locations.ActiveID != "local" {
				t.Fatal("cloud config not isolated", locations, err)
			}
			for _, id := range ids {
				record, e := restored.Files().Repo.Get(ctx, id)
				if e != nil || record.StorageType != "local" {
					t.Fatal("restored metadata", e)
				}
				r, _, e := bloblocal.New(filepath.Join(target, "files")).Open(ctx, record.Key)
				if e != nil {
					t.Fatal(e)
				}
				got, _ := io.ReadAll(r)
				r.Close()
				if !bytes.Equal(got, payload) {
					t.Fatal("restored file differs")
				}
			}
			if driver != "sqlite" {
				restore.DataDir = filepath.Join(root, "nonempty")
				if _, err = Restore(ctx, restore); err == nil {
					t.Fatal("nonempty external database accepted")
				}
			}
		})
	}
}

func TestDesktopBackupRestore(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	source := filepath.Join(root, "source")
	db, _, err := local.Open(ctx, source)
	if err != nil {
		t.Fatal(err)
	}
	n := &usecase.Notes{Repo: &notessql.Repository{Store: db}}
	_, err = n.Create(ctx, "local", contracts.NoteInput{Title: "Offline", Status: "done"})
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	backup := filepath.Join(root, "desktop.age")
	if _, err = Backup(ctx, BackupOptions{DataDir: source, Output: backup, Password: testPassphrase}); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(root, "restored")
	if _, err = Restore(ctx, RestoreOptions{Input: backup, DataDir: target, Password: testPassphrase}); err != nil {
		t.Fatal(err)
	}
	reopened, _, err := local.Open(ctx, target)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	list, err := (&notessql.Repository{Store: reopened}).List(ctx, "local", contracts.NoteQuery{Page: 1, Sort: "title", Direction: "asc"})
	if err != nil || list.Total != 1 {
		t.Fatal(list, err)
	}
}
