// Author: yunnuo <ymz@ebox.vip>
// Description: Regression cases for realm isolation, large scopes and corrupt department ancestry.
package platformsql

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/filesql"
	"github.com/yunnuo/unicore/internal/adapter/storage/notessql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/usecase"
	"github.com/yunnuo/unicore/migrations/runner"
)

func scopeSecurityStore(t *testing.T) (*sqlstore.Store, *Repository, contracts.User) {
	t.Helper()
	ctx := t.Context()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "scope.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: "sqlite", Profile: "web-platform"}); err != nil {
		t.Fatal(err)
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,?)", "web-platform", sqlstore.ID(), time.Now().Unix()); err != nil {
		t.Fatal(err)
	}
	admin, err := (&Repository{Store: store, Administrators: true}).Seed(ctx, tx, contracts.UserCreate{Username: "admin", Email: "admin@example.test", Role: "super_admin"}, "unused-test-hash")
	if err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return store, &Repository{Store: store}, admin
}

func TestNotesAllKeepsRealmAndPrivatePayloads(t *testing.T) {
	store, _, _ := scopeSecurityStore(t)
	ctx := t.Context()
	repo := &notessql.Repository{Store: store}
	for _, scope := range []string{"user/reader", "user/peer", "administrator/reader", "local"} {
		_, err := repo.Create(ctx, scope, contracts.NoteInput{Title: scope, Body: "secret:" + scope, Status: "open", AttachmentIds: &[]string{"attachment:" + scope}})
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, visibility := range []usecase.NoteVisibility{{All: true}, {Scopes: []string{"user/peer", "administrator/reader", "local"}}} {
		list, err := repo.List(ctx, "user/reader", contracts.NoteQuery{Page: 1, Sort: "title", Direction: "asc"}, visibility)
		if err != nil {
			t.Fatal(err)
		}
		if list.Total != 2 || len(list.Items) != 2 {
			t.Fatalf("mixed realm note payload leaked: %+v", list)
		}
		for _, n := range list.Items {
			if n.Body != "secret:user/reader" && n.Body != "secret:user/peer" {
				t.Fatalf("foreign body or attachments: %+v", n)
			}
		}
	}
}

func TestScopeBeyond500KeepsCountsPagesAndTies(t *testing.T) {
	store, repository, admin := scopeSecurityStore(t)
	ctx := t.Context()
	department, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "large"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	const count = 525
	for i := 0; i < count; i++ {
		id := fmt.Sprintf("member%04d", i)
		if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_users(id,username,email,password_hash,status,created_at,updated_at,last_login_at,department_id) VALUES(?,?,?,'unused','active',1,1,0,?)", id, id, id+"@example.test", department.ID); err != nil {
			t.Fatal(err)
		}
		if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_example_notes(scope_key,id,title,body,status,attachment_ids,version,created_at,updated_at,deleted_at) VALUES(?,?,?,'body','open','[]',1,1,1,0)", "user/"+id, id, "same title"); err != nil {
			t.Fatal(err)
		}
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	ids, err := repository.scopeUsers(ctx, "self", false, false, map[string]bool{department.ID: true})
	if err != nil || len(ids) != count+1 {
		t.Fatalf("large scope silently narrowed: %d %v", len(ids), err)
	}
	visibility := usecase.NoteVisibility{}
	for _, id := range ids {
		visibility.Scopes = append(visibility.Scopes, "user/"+id)
	}
	notes := &notessql.Repository{Store: store}
	filesRepo := &filesql.Repository{Store: store}
	for i := 0; i < count; i++ {
		id := fmt.Sprintf("member%04d", i)
		if err = filesRepo.Create(ctx, files.Record{FileEntry: contracts.FileEntry{FileID: id, OriginalName: "same.txt", StorageType: "local", LocationID: "local", MimeType: "text/plain", Size: 1, CreatorID: id, CreatorRealm: "user", CreatedAt: 1, State: "ready"}, Purpose: "user"}, nil); err != nil {
			t.Fatal(err)
		}
	}
	seenNotes, seenFiles := map[string]bool{}, map[string]bool{}
	for page := 1; page <= 27; page++ {
		list, err := notes.List(ctx, "user/self", contracts.NoteQuery{Page: page, Sort: "title", Direction: "asc"}, visibility)
		if err != nil || list.Total != count {
			t.Fatalf("notes count page %d: %d %v", page, list.Total, err)
		}
		listFiles, err := filesRepo.List(ctx, files.Actor{ID: "self", Realm: "user"}, "", page, files.ScopeFilter{CreatorIDs: ids})
		if err != nil || listFiles.Total != count {
			t.Fatalf("files count page %d: %d %v", page, listFiles.Total, err)
		}
		for _, n := range list.Items {
			if seenNotes[n.ID] {
				t.Fatal("duplicate note across pages", n.ID)
			}
			seenNotes[n.ID] = true
		}
		for _, f := range listFiles.Items {
			if seenFiles[f.FileID] {
				t.Fatal("duplicate file across pages", f.FileID)
			}
			seenFiles[f.FileID] = true
		}
	}
	if len(seenNotes) != count || len(seenFiles) != count {
		t.Fatal("missing rows", len(seenNotes), len(seenFiles))
	}
}

func TestDepartmentRejectsCorruptAndDeepParents(t *testing.T) {
	for _, kind := range []string{"cycle", "depth"} {
		t.Run(kind, func(t *testing.T) {
			store, repository, admin := scopeSecurityStore(t)
			ctx := t.Context()
			target, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "target"}, admin.ID)
			if err != nil {
				t.Fatal(err)
			}
			parent := ""
			for i := 0; i < 66; i++ {
				id := fmt.Sprintf("chain%02d", i)
				var p any
				if parent != "" {
					p = parent
				}
				if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_departments(id,name,parent_id,sort,created_at,updated_at) VALUES(?,?,?,0,1,1)", id, id, p); err != nil {
					t.Fatal(err)
				}
				parent = id
			}
			if kind == "cycle" {
				if _, err = store.Exec(ctx, store.DB, "UPDATE unicore_departments SET parent_id=? WHERE id='chain00'", parent); err != nil {
					t.Fatal(err)
				}
			}
			if _, err = repository.UpdateDepartment(ctx, target.ID, contracts.DepartmentSaveInput{Name: "target", ParentID: &parent}, admin.ID); err == nil {
				t.Fatal("corrupt/deep parent accepted")
			}
		})
	}
}

func TestDepartmentChangesRevokeUserSessions(t *testing.T) {
	store, repository, admin := scopeSecurityStore(t)
	ctx := t.Context()
	root, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "root"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	leaf, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "leaf", ParentID: &root.ID}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Revocation is deliberately conservative across user sessions; admin sessions stay independent.
	issue := func() {
		t.Helper()
		if _, err := store.Exec(ctx, store.DB, "INSERT INTO unicore_sessions(token_hash,user_id,expires_at) VALUES('scope-session','reader',?)", time.Now().Add(time.Hour).Unix()); err != nil {
			t.Fatal(err)
		}
	}
	check := func() {
		t.Helper()
		var count int
		if err := store.Row(ctx, store.DB, "SELECT COUNT(*) FROM unicore_sessions WHERE token_hash='scope-session'").Scan(&count); err != nil || count != 0 {
			t.Fatal("scope session survived", count, err)
		}
	}
	issue()
	if _, err = repository.UpdateDepartment(ctx, leaf.ID, contracts.DepartmentSaveInput{Name: "leaf"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	check()
	issue()
	if _, err = repository.DeleteDepartment(ctx, leaf.ID, admin.ID); err != nil {
		t.Fatal(err)
	}
	check()
}

func TestDataScopeDatabaseErrorIsReturned(t *testing.T) {
	store, repository, _ := scopeSecurityStore(t)
	store.DB.Close()
	if _, err := repository.DataScope(context.Background(), contracts.User{ID: "reader", Roles: []string{"user"}}); err == nil {
		t.Fatal("database failure swallowed")
	}
	_ = platform.ScopeSelf
}
