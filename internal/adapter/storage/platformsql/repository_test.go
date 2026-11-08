// Author: yunnuo <ymz@ebox.vip>
// Description: Run the same migration/identity invariants against each explicitly configured dialect.
package platformsql

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	notesnotessql "github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
	notesusecase "github.com/yunnuo/unicore/internal/modules/notes/usecase"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/migrations/runner"
)

func TestDialectMigrationsAndIdentity(t *testing.T) {
	for _, dialect := range []string{"sqlite", "postgres", "mysql"} {
		t.Run(dialect, func(t *testing.T) {
			dsn := os.Getenv("UNICORE_TEST_" + map[string]string{"postgres": "POSTGRES_DSN", "mysql": "MYSQL_DSN"}[dialect])
			if dialect != "sqlite" && dsn == "" {
				t.Skip("isolated DB DSN not provided")
			}
			ctx := context.Background()
			store, err := webdb.Open(ctx, dialect, dsn, filepath.Join(t.TempDir(), "test.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			if count, err := store.TableCount(ctx); err != nil || count != 0 {
				t.Fatalf("test database must be empty: %d %v", count, err)
			}
			if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
				t.Fatal(err)
			}
			if exists, err := store.HasInstallationTable(ctx); err != nil || !exists {
				t.Fatal("installation catalog inspection failed", err)
			}
			if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
				t.Fatal("migration not idempotent", err)
			}
			tx, err := store.DB.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,?)", "web-platform", sqlstore.ID(), time.Now().Unix()); err != nil {
				t.Fatal(err)
			}
			repository := &Repository{Store: store}
			hash, err := platform.HashPassword("test-password-strong")
			if err != nil {
				t.Fatal(err)
			}
			admins := &Repository{Store: store, Administrators: true}
			admin, err := admins.Seed(ctx, tx, contracts.UserCreate{Username: "admin", Email: "admin@example.test", Role: "super_admin"}, hash)
			if err != nil {
				t.Fatal(err)
			}
			if err = tx.Commit(); err != nil {
				t.Fatal(err)
			}
			service := platform.New(repository)
			member, err := service.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
			if err != nil {
				t.Fatal(err)
			}
			if platform.Has(member, "users:read") || !platform.Has(admin, "users:read") {
				t.Fatal("RBAC grants incorrect")
			}
			if _, err = admins.UpdateUser(ctx, admin.ID, contracts.UserUpdate{Role: rolePtr("user"), Status: "active"}, admin.ID); err != platform.ErrForbidden {
				t.Fatal("cross-realm conversion allowed", err)
			}
			if _, err = admins.UpdateUser(ctx, admin.ID, contracts.UserUpdate{Role: rolePtr("super_admin"), Status: "disabled"}, admin.ID); err != platform.ErrLastAdmin {
				t.Fatal("last admin disabled", err)
			}
			session, token, err := service.Login(ctx, contracts.LoginInput{Username: "member", Password: "test-password-strong"}, "local", false, false, 1)
			if err != nil {
				t.Fatal(err)
			}
			if session.CsrfToken == "" {
				t.Fatal("missing csrf")
			}
			if _, err = service.Session(ctx, token); err != nil {
				t.Fatal(err)
			}
			if _, err = repository.UpdateUser(ctx, member.ID, contracts.UserUpdate{Role: rolePtr("user"), Status: "disabled"}, admin.ID); err != nil {
				t.Fatal(err)
			}
			if _, err = service.Session(ctx, token); err == nil {
				t.Fatal("disabled user retained session")
			}
			config := &settings.Service{Store: store, Profile: "web-platform"}
			if _, err = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.session_hours", Value: "9999"}}}, admin.ID); err == nil {
				t.Fatal("invalid setting accepted")
			}
			if _, err = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "site.name", Value: "Persistent"}}}, admin.ID); err != nil {
				t.Fatal(err)
			}
			if value, _ := config.Value(ctx, "site.name"); value != "Persistent" {
				t.Fatal(value)
			}
			dashboard, err := repository.Dashboard(ctx)
			if err != nil || dashboard.TotalUsers != 1 || dashboard.ActiveUsers7d != 1 {
				t.Fatalf("dashboard: %+v %v", dashboard, err)
			}
			list, err := repository.ListUsers(ctx, "member", 1, 20)
			if err != nil || list.Total != 1 {
				t.Fatalf("search: %+v %v", list, err)
			}
			exerciseLogs(t, ctx, store)
			exerciseMailLifecycle(t, ctx, store, repository, admin)
			exerciseRoles(t, ctx, store, repository, admin)
			exerciseUserRoles(t, ctx, store, repository, admin)
			exerciseAdministratorRoles(t, ctx, store, repository, admin)
			exerciseDepartments(t, ctx, store, repository, admin)
			exercisePosts(t, ctx, store, repository, admin)
			exerciseUserDepartments(t, ctx, repository, admin)
			exerciseDepartmentScopeValidation(t, ctx, repository, admin)
			exerciseDataScopes(t, ctx, store, repository, admin)
			exerciseOIDC(t, ctx, store, repository, admin)
			exerciseFiles(t, ctx, store, admin)
			exerciseNotes(t, ctx, store)
			exercisePersonal(t, ctx, store, admin)
			exerciseNotificationEvents(t, ctx, store, admin)
		})
	}
}

// exerciseNotes drives the cross-scope notes fixture shared by the platform
// repository tests; the module tree owns the full integration test.
func exerciseNotes(t *testing.T, ctx context.Context, store *sqlstore.Store) {
	t.Helper()
	notes := &notesusecase.Notes{Repo: &notesnotessql.Repository{Store: store}}
	query := contracts.NoteQuery{Page: 1, Sort: "title", Direction: "asc"}
	created, err := notes.Create(ctx, "user/example", contracts.NoteInput{Title: "fixture", Body: "body", Status: "open"})
	if err != nil {
		t.Fatal(err)
	}
	for _, scope := range []string{"user/other", "administrator/example", "local"} {
		list, e := notes.List(ctx, scope, query, notesusecase.NoteVisibility{})
		if e != nil || list.Total != 0 {
			t.Fatal("scope leaked", scope, list, e)
		}
	}
	_ = created
}
