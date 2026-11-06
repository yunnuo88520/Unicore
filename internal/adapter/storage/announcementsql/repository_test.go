// Author: yunnuo <ymz@ebox.vip>
// Description: Real SQL publication, privilege recheck, atomic batch concurrency, persistence and soft-deletion tests.
package announcementsql_test

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/content"
	"github.com/yunnuo/unicore/internal/adapter/storage/announcementsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/internal/usecase"
	"github.com/yunnuo/unicore/migrations/runner"
	"os"
	"path/filepath"
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
			// Fresh catalog world: apply the single-version baselines directly.
			if e := runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); e != nil {
				t.Fatal(e)
			}
			// Pre-existing rows survive later restarts and read back unchanged.
			if _, e := store.Exec(ctx, store.DB, "INSERT INTO unicore_example_notes(scope_key,id,title,body,status,attachment_ids,version,created_at,updated_at,deleted_at) VALUES('local','legacy-note','preserved','old body','open','[]',4,1,2,0)"); e != nil {
				t.Fatal(e)
			}
			if _, e := store.Exec(ctx, store.DB, "INSERT INTO unicore_platform_announcements(id,content,content_html,format,type,note,status,publish_at,created_by,updated_by,created_at,updated_at,deleted_at,version,title,notify_mode,ends_at,audience) VALUES('legacy-announcement','preserved text','<p>preserved text</p>','markdown','info','','draft',1,'old-admin','old-admin',1,1,0,7,'Announcement','silent',0,'all')"); e != nil {
				t.Fatal(e)
			}
			var oldText, oldTitle string
			if e := store.Row(ctx, store.DB, "SELECT content,title FROM unicore_platform_announcements WHERE id='legacy-announcement'").Scan(&oldText, &oldTitle); e != nil || oldText != "preserved text" || oldTitle != "Announcement" {
				t.Fatal("legacy announcement changed", e, oldText, oldTitle)
			}
			var oldBody string
			if e := store.Row(ctx, store.DB, "SELECT body FROM unicore_example_notes WHERE id='legacy-note'").Scan(&oldBody); e != nil || oldBody != "old body" {
				t.Fatal("legacy business data changed", oldBody, e)
			}
			tx, err := store.DB.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,'web-platform',?,?)", sqlstore.ID(), time.Now().Unix()); err != nil {
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
			input := contracts.AnnouncementInput{Title: "Test announcement", NotifyMode: "silent", Audience: "all", RecipientIds: []string{}, Content: "## Public news", Format: "markdown", Type: "info", Status: "published", PublishAt: int(now.Unix()), Note: "internal-only"}
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
			feed, err := service.Feed(ctx, 1, 10, member.ID, false)
			if err != nil || !feed.Enabled || feed.Total != 1 || feed.Items[0].ID != a.ID {
				t.Fatal(feed, err)
			}
			for _, id := range []string{draft.ID, future.ID, "absent"} {
				if _, e := service.Published(ctx, id, member.ID); !errors.Is(e, usecase.ErrEntityNotFound) {
					t.Fatal("unpublished leaked", id, e)
				}
			}
			service.Now = func() time.Time { return now.Add(time.Second) }
			feed, err = service.Feed(ctx, 1, 10, member.ID, false)
			if err != nil || feed.Total != 2 {
				t.Fatal("schedule boundary", feed, err)
			}
			if err = service.SetEnabled(ctx, contracts.AnnouncementSetting{Enabled: false}, admin.ID); err != nil {
				t.Fatal(err)
			}
			feed, err = service.Feed(ctx, 1, 10, member.ID, false)
			if err != nil || feed.Enabled || feed.Total != 0 {
				t.Fatal("disabled leaked", feed, err)
			}
			if _, err = service.Published(ctx, a.ID, member.ID); !errors.Is(err, usecase.ErrEntityNotFound) {
				t.Fatal("disabled detail leaked", err)
			}
			if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
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
			update := contracts.AnnouncementUpdate{Title: "Test announcement", NotifyMode: "silent", Audience: "all", RecipientIds: []string{}, Content: "Revised", Format: "markdown", Type: "warning", Status: "draft", PublishAt: a.PublishAt, Version: 1}
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
			if err = store.Row(ctx, store.DB, "SELECT deleted_at FROM unicore_platform_announcements WHERE id=?", draft.ID).Scan(&deleted); err != nil || deleted != 0 {
				t.Fatal("partial delete", deleted, err)
			}
			if err = service.Delete(ctx, contracts.AnnouncementDelete{Items: []contracts.AnnouncementSelection{{ID: a.ID, Version: 2}, {ID: draft.ID, Version: 1}}}, admin.ID); err != nil {
				t.Fatal(err)
			}
			var version int
			if err = store.Row(ctx, store.DB, "SELECT deleted_at,version FROM unicore_platform_announcements WHERE id=?", a.ID).Scan(&deleted, &version); err != nil || deleted == 0 || version != 3 {
				t.Fatal("not soft deleted", deleted, version, err)
			}
			if _, err = service.Update(ctx, a.ID, update, admin.ID); !errors.Is(err, usecase.ErrEntityNotFound) {
				t.Fatal("resurrected deleted row", err)
			}
			settingsService := &settings.Service{Store: store, Profile: "web-platform"}
			if _, err = settingsService.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "announcements.enabled", Value: "false"}}}, admin.ID); err == nil {
				t.Fatal("bypassed dedicated setting endpoint")
			}
			// Notifications paginate before display but unread counts and mark-all cover the entire audience.
			input.Status = "published"
			input.PublishAt = int(now.Unix())
			input.NotifyMode = "popup"
			input.Audience = "selected"
			input.RecipientIds = []string{member.ID}
			input.EndsAt = int(now.Add(10 * time.Second).Unix())
			targeted, err := service.Create(ctx, input, admin.ID)
			if err != nil {
				t.Fatal(err)
			}
			other, err := (&platformsql.Repository{Store: store}).CreateUser(ctx, contracts.UserCreate{Username: "other", Email: "other@example.test", Role: "user"}, "unused", admin.ID)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = service.Published(ctx, targeted.ID, other.ID); !errors.Is(err, usecase.ErrEntityNotFound) {
				t.Fatal("targeting detail leaked", err)
			}
			if err = service.MarkRead(ctx, targeted.ID, other.ID); !errors.Is(err, usecase.ErrEntityNotFound) {
				t.Fatal("targeting receipt accepted", err)
			}
			popupFeed, err := service.Feed(ctx, 1, 1, member.ID, true)
			if err != nil || popupFeed.Total != 1 || popupFeed.Items[0].ID != targeted.ID {
				t.Fatal("popup feed", popupFeed, err)
			}
			if err = service.MarkRead(ctx, targeted.ID, member.ID); err != nil {
				t.Fatal(err)
			}
			first, err := service.Published(ctx, targeted.ID, member.ID)
			if err != nil || first.ReadAt == 0 {
				t.Fatal("receipt missing", first, err)
			}
			service.Now = func() time.Time { return now.Add(2 * time.Second) }
			if err = service.MarkRead(ctx, targeted.ID, member.ID); err != nil {
				t.Fatal(err)
			}
			firstAgain, err := service.Published(ctx, targeted.ID, member.ID)
			if err != nil || firstAgain.ReadAt != first.ReadAt {
				t.Fatal("first receipt overwritten", err)
			}
			revisedTarget, err := service.Update(ctx, targeted.ID, contracts.AnnouncementUpdate{Title: input.Title, Content: input.Content, Format: input.Format, Type: input.Type, Note: input.Note, Status: input.Status, PublishAt: input.PublishAt, NotifyMode: input.NotifyMode, EndsAt: input.EndsAt, Audience: input.Audience, RecipientIds: input.RecipientIds, Version: 1}, admin.ID)
			if err != nil || revisedTarget.Version != 2 {
				t.Fatal(err)
			}
			popupFeed, err = service.Feed(ctx, 1, 1, member.ID, true)
			if err != nil || popupFeed.Total != 0 {
				t.Fatal("edit repeated popup", popupFeed, err)
			}
			input.NotifyMode = "silent"
			input.Audience = "all"
			input.RecipientIds = []string{}
			input.EndsAt = 0
			for i := 0; i < 12; i++ {
				if _, err = service.Create(ctx, input, admin.ID); err != nil {
					t.Fatal(err)
				}
			}
			all, err := service.Feed(ctx, 1, 5, member.ID, false)
			if err != nil || len(all.Items) != 5 || all.UnreadCount < 12 {
				t.Fatal("global unread count", all, err)
			}
			if err = service.MarkAllRead(ctx, member.ID); err != nil {
				t.Fatal(err)
			}
			all, err = service.Feed(ctx, 1, 5, member.ID, false)
			if err != nil || all.UnreadCount != 0 {
				t.Fatal("mark-all truncated", all, err)
			}
			otherFeed, err := service.Feed(ctx, 1, 5, other.ID, false)
			if err != nil || otherFeed.UnreadCount < 12 {
				t.Fatal("receipt crossed users", otherFeed, err)
			}
			status, err := service.ReadStatus(ctx, targeted.ID, "member", 1, 10)
			if err != nil || status.Total != 1 || !status.Items[0].Eligible || status.Items[0].ReadAt != first.ReadAt {
				t.Fatal("admin receipts", status, err)
			}
			service.Now = func() time.Time { return now.Add(10 * time.Second) }
			if _, err = service.Published(ctx, targeted.ID, member.ID); !errors.Is(err, usecase.ErrEntityNotFound) {
				t.Fatal("end boundary leaked", err)
			}
			if err = service.MarkRead(ctx, targeted.ID, member.ID); !errors.Is(err, usecase.ErrEntityNotFound) {
				t.Fatal("expired receipt accepted", err)
			}
			input.Status = "archived"
			archived, err := service.Create(ctx, input, admin.ID)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = service.Published(ctx, archived.ID, member.ID); !errors.Is(err, usecase.ErrEntityNotFound) {
				t.Fatal("archived leaked", err)
			}
			input.Status = "published"
			input.EndsAt = input.PublishAt
			if _, err = service.Create(ctx, input, admin.ID); !errors.Is(err, domain.ErrAnnouncementInvalid) {
				t.Fatal("invalid interval accepted", err)
			}

			input.EndsAt = 0
			// Revocation is checked again in the mutation transaction, even with a previously accepted actor ID.
			if _, err = store.Exec(ctx, store.DB, "UPDATE unicore_administrators SET status='disabled' WHERE id=?", admin.ID); err != nil {
				t.Fatal(err)
			}
			input.PublishAt = int(now.Unix())
			if _, err = service.Create(ctx, input, admin.ID); !errors.Is(err, platform.ErrForbidden) {
				t.Fatal("revoked actor wrote", err)
			}
		})
	}
}
