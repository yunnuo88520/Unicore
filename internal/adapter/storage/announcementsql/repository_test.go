// Author: yunnuo <ymz@ebox.vip>
// Description: Real SQL publication, privilege recheck, atomic batch concurrency, persistence and soft-deletion tests.
package announcementsql_test

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"github.com/yunnuo/unicore/internal/adapter/content"
	"github.com/yunnuo/unicore/internal/adapter/storage/announcementsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/internal/usecase"
	"github.com/yunnuo/unicore/migrations"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAnnouncementDialects(t *testing.T) {
	for _, dialect := range []string{"sqlite", "postgres", "mysql"} {
		t.Run(dialect, func(t *testing.T) {
			dsn := os.Getenv("UNICORE_ANNOUNCEMENT_" + map[string]string{"postgres": "POSTGRES_DSN", "mysql": "MYSQL_DSN"}[dialect])
			if dialect != "sqlite" && dsn == "" {
				t.Skip("dedicated announcement DB not configured")
			}
			ctx := context.Background()
			store, err := webdb.Open(ctx, dialect, dsn, filepath.Join(t.TempDir(), "test.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			if count, e := store.TableCount(ctx); e != nil || count != 0 {
				t.Fatal("requires empty dedicated DB", count, e)
			}
			// Authentic business v1 data is upgraded rather than reset.
			body, e := migrations.Files.ReadFile(dialect + "/business/0001_notes.sql")
			if e != nil {
				t.Fatal(e)
			}
			lines := []string{}
			for _, line := range strings.Split(string(body), "\n") {
				if !strings.HasPrefix(strings.TrimSpace(line), "--") {
					lines = append(lines, line)
				}
			}
			for _, statement := range strings.Split(strings.Join(lines, "\n"), ";") {
				if strings.TrimSpace(statement) != "" {
					if _, e = store.Exec(ctx, store.DB, statement); e != nil {
						t.Fatal(e)
					}
				}
			}
			if _, e = store.Exec(ctx, store.DB, "CREATE TABLE business_migrations(version INTEGER PRIMARY KEY,checksum VARCHAR(64) NOT NULL)"); e != nil {
				t.Fatal(e)
			}
			if _, e = store.Exec(ctx, store.DB, "INSERT INTO business_migrations(version,checksum) VALUES(1,?)", fmt.Sprintf("%x", sha256.Sum256(body))); e != nil {
				t.Fatal(e)
			}
			if _, e = store.Exec(ctx, store.DB, "INSERT INTO example_notes(scope_key,id,title,body,status,attachment_ids,version,created_at,updated_at) VALUES('local','legacy-note','preserved','old body','open','[]',4,1,2)"); e != nil {
				t.Fatal(e)
			}
			if err = store.Migrate(ctx, true); err != nil {
				t.Fatal(err)
			}
			var oldDeleted, oldVersion int
			var oldBody string
			if e := store.Row(ctx, store.DB, "SELECT deleted_at,version,body FROM example_notes WHERE id='legacy-note'").Scan(&oldDeleted, &oldVersion, &oldBody); e != nil || oldDeleted != 0 || oldVersion != 4 || oldBody != "old body" {
				t.Fatal("legacy business data changed", oldDeleted, oldVersion, oldBody, e)
			}
			if dialect == "mysql" {
				// MySQL DDL can commit before the migration ledger is written.
				if _, e := store.Exec(ctx, store.DB, "DELETE FROM business_migrations WHERE version=2"); e != nil {
					t.Fatal(e)
				}
				if e := store.MigrateBusiness(ctx); e != nil {
					t.Fatal("implicit DDL retry", e)
				}
			}
			tx, err := store.DB.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = store.Exec(ctx, tx, "INSERT INTO install_state(id,profile,instance_id,installed_at) VALUES(1,'web-platform',?,?)", sqlstore.ID(), time.Now().Unix()); err != nil {
				t.Fatal(err)
			}
			admins := &platformsql.Repository{Store: store, Administrators: true}
			admin, err := admins.Seed(ctx, tx, contracts.UserCreate{Username: "admin", Email: "admin@example.test", Role: "super_admin"}, "unused-test-hash")
			if err != nil {
				t.Fatal(err)
			}
			if err = tx.Commit(); err != nil {
				t.Fatal(err)
			}
			member, err := (&platformsql.Repository{Store: store}).CreateUser(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Role: "user"}, "unused", admin.ID)
			if err != nil {
				t.Fatal(err)
			}
			now := time.Now().Truncate(time.Second)
			repo := &announcementsql.Repository{Store: store}
			service := &usecase.Announcements{Repo: repo, Render: content.Announcement, Now: func() time.Time { return now }}
			input := contracts.AnnouncementInput{Content: "## Public news", Format: "markdown", Type: "info", Status: "published", PublishAt: int(now.Unix()), Note: "internal-only"}
			if _, err = service.Create(ctx, input, member.ID); !errors.Is(err, platform.ErrForbidden) {
				t.Fatal("member wrote", err)
			}
			a, err := service.Create(ctx, input, admin.ID)
			if err != nil {
				t.Fatal(err)
			}
			input.Status = "draft"
			draft, err := service.Create(ctx, input, admin.ID)
			if err != nil {
				t.Fatal(err)
			}
			input.Status = "published"
			input.PublishAt++
			future, err := service.Create(ctx, input, admin.ID)
			if err != nil {
				t.Fatal(err)
			}
			feed, err := service.Feed(ctx, 1, 10)
			if err != nil || !feed.Enabled || feed.Total != 1 || feed.Items[0].ID != a.ID {
				t.Fatal(feed, err)
			}
			for _, id := range []string{draft.ID, future.ID, "absent"} {
				if _, e := service.Published(ctx, id); !errors.Is(e, usecase.ErrEntityNotFound) {
					t.Fatal("unpublished leaked", id, e)
				}
			}
			service.Now = func() time.Time { return now.Add(time.Second) }
			feed, err = service.Feed(ctx, 1, 10)
			if err != nil || feed.Total != 2 {
				t.Fatal("schedule boundary", feed, err)
			}
			if err = service.SetEnabled(ctx, contracts.AnnouncementSetting{Enabled: false}, admin.ID); err != nil {
				t.Fatal(err)
			}
			feed, err = service.Feed(ctx, 1, 10)
			if err != nil || feed.Enabled || feed.Total != 0 {
				t.Fatal("disabled leaked", feed, err)
			}
			if _, err = service.Published(ctx, a.ID); !errors.Is(err, usecase.ErrEntityNotFound) {
				t.Fatal("disabled detail leaked", err)
			}
			if err = store.Migrate(ctx, true); err != nil {
				t.Fatal("restart migration", err)
			}
			if enabled, e := service.Enabled(ctx); e != nil || enabled.Enabled {
				t.Fatal("switch not persisted", enabled, e)
			}
			if err = service.SetEnabled(ctx, contracts.AnnouncementSetting{Enabled: true}, member.ID); !errors.Is(err, platform.ErrForbidden) {
				t.Fatal("member toggled", err)
			}
			if err = service.SetEnabled(ctx, contracts.AnnouncementSetting{Enabled: true}, admin.ID); err != nil {
				t.Fatal(err)
			}
			update := contracts.AnnouncementUpdate{Content: "Revised", Format: "markdown", Type: "warning", Status: "draft", PublishAt: a.PublishAt, Version: 1}
			revised, err := service.Update(ctx, a.ID, update, admin.ID)
			if err != nil || revised.Version != 2 || revised.CreatedAt != a.CreatedAt {
				t.Fatal(revised, err)
			}
			if _, err = service.Update(ctx, a.ID, update, admin.ID); !errors.Is(err, usecase.ErrEntityConflict) {
				t.Fatal("stale update", err)
			}
			if err = service.Delete(ctx, contracts.AnnouncementDelete{Items: []contracts.AnnouncementSelection{{ID: draft.ID, Version: 1}, {ID: a.ID, Version: 1}}}, admin.ID); !errors.Is(err, usecase.ErrEntityConflict) {
				t.Fatal("stale batch", err)
			}
			var deleted int
			if err = store.Row(ctx, store.DB, "SELECT deleted_at FROM platform_announcements WHERE id=?", draft.ID).Scan(&deleted); err != nil || deleted != 0 {
				t.Fatal("partial delete", deleted, err)
			}
			if err = service.Delete(ctx, contracts.AnnouncementDelete{Items: []contracts.AnnouncementSelection{{ID: a.ID, Version: 2}, {ID: draft.ID, Version: 1}}}, admin.ID); err != nil {
				t.Fatal(err)
			}
			var version int
			if err = store.Row(ctx, store.DB, "SELECT deleted_at,version FROM platform_announcements WHERE id=?", a.ID).Scan(&deleted, &version); err != nil || deleted == 0 || version != 3 {
				t.Fatal("not soft deleted", deleted, version, err)
			}
			if _, err = service.Update(ctx, a.ID, update, admin.ID); !errors.Is(err, usecase.ErrEntityNotFound) {
				t.Fatal("resurrected deleted row", err)
			}
			settingsService := &settings.Service{Store: store, Profile: "web-platform"}
			if _, err = settingsService.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "announcements.enabled", Value: "false"}}}, admin.ID); err == nil {
				t.Fatal("bypassed dedicated setting endpoint")
			}
			// Revocation is checked again in the mutation transaction, even with a previously accepted actor ID.
			if _, err = store.Exec(ctx, store.DB, "UPDATE administrators SET status='disabled' WHERE id=?", admin.ID); err != nil {
				t.Fatal(err)
			}
			input.PublishAt = int(now.Unix())
			if _, err = service.Create(ctx, input, admin.ID); !errors.Is(err, platform.ErrForbidden) {
				t.Fatal("revoked actor wrote", err)
			}
		})
	}
}
