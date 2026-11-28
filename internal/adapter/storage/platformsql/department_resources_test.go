// Author: yunnuo <ymz@ebox.vip>
// Description: Department-owned scope and transactional transfer invariants on every configured SQL dialect.
package platformsql

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/secret"
)

func exerciseDepartmentResources(t *testing.T, ctx context.Context, store *sqlstore.Store, repo *Repository, admin contracts.User) {
	t.Helper()
	department := func(name string, parent *string) string {
		t.Helper()
		d, err := repo.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: name, ParentID: parent}, admin.ID)
		if err != nil {
			t.Fatal(err)
		}
		return d.ID
	}
	a := department("Resource A", nil)
	child := department("Resource A child", &a)
	b := department("Resource empty B", nil)
	role := func(name, scope string, deps []string, points ...string) string {
		t.Helper()
		ops := platform.DefaultOperations("user", points)
		r, err := repo.CreateRole(ctx, contracts.RoleSaveInput{Name: name, Permissions: points, OperationIds: &ops, DataScope: &scope, DepartmentIds: &deps}, admin.ID)
		if err != nil {
			t.Fatal(err)
		}
		return r.ID
	}
	self := role("Resource self", platform.ScopeSelf, nil, "notes:access", "notes:update")
	dept := role("Resource department", platform.ScopeDept, nil, "notes:access", "notes:update")
	below := role("Resource subtree", platform.ScopeDeptBelow, nil, "notes:access", "notes:update")
	custom := role("Resource custom", platform.ScopeCustom, []string{b}, "notes:access", "notes:update")
	all := role("Resource all", platform.ScopeAll, nil, "notes:access", "notes:update")
	unrelated := role("Resource unrelated all", platform.ScopeAll, nil, "files:access")
	readAll := role("Resource read all", platform.ScopeAll, nil, "notes:access")
	writeAll := role("Resource write all", platform.ScopeAll, nil, "notes:update")
	user := func(name string, department *string, roles ...string) contracts.User {
		t.Helper()
		u, err := repo.CreateUser(ctx, contracts.UserCreate{Username: name, Email: name + "@example.test", RoleIds: &roles, DepartmentID: department}, "synthetic-hash", admin.ID)
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	actor := user("resource-actor", &a, dept, custom, unrelated)
	none := user("resource-no-department", nil, dept)
	for _, tc := range []struct {
		name, role   string
		deps         []string
		unrestricted bool
	}{
		{"self", self, nil, false}, {"dept", dept, []string{a}, false},
		{"subtree", below, []string{a, child}, false}, {"custom empty", custom, []string{b}, false},
		{"all", all, nil, true}, {"irrelevant permission", unrelated, nil, false},
	} {
		t.Run("department resources "+tc.name, func(t *testing.T) {
			principal := actor
			principal.Roles = []string{tc.role}
			f, err := repo.DataScope(ctx, principal, "notes:access")
			if err != nil || f.All != tc.unrestricted {
				t.Fatal(f, err)
			}
			want := slices.Clone(tc.deps)
			slices.Sort(want)
			if !slices.Equal(f.DepartmentIDs, want) {
				t.Fatalf("departments: %+v want %v", f, want)
			}
			for _, d := range []string{a, child, b} {
				if f.ContainsDepartment(d) != (tc.unrestricted || slices.Contains(want, d)) {
					t.Fatal("wrong department", d, f)
				}
			}
			if !f.Contains(actor.ID) || f.ContainsDepartment("") {
				t.Fatal("self user / unassigned department", f)
			}
			fast, err := repo.DepartmentScope(ctx, principal, "notes:access")
			if err != nil || fast.All != f.All || !slices.Equal(fast.DepartmentIDs, f.DepartmentIDs) {
				t.Fatal("department-only resolver drift", fast, err)
			}
			if !fast.All && !slices.Equal(fast.UserIDs, []string{actor.ID}) {
				t.Fatal("department resolver expanded users", fast)
			}
		})
	}
	f, err := repo.DepartmentScope(ctx, actor, "notes:access")
	if err != nil || f.All || !f.ContainsDepartment(a) || !f.ContainsDepartment(b) || f.ContainsDepartment(child) {
		t.Fatal("permission-specific union", f, err)
	}
	if f, err = repo.DepartmentScope(ctx, none, "notes:access"); err != nil || len(f.DepartmentIDs) != 0 {
		t.Fatal("no department widened", f, err)
	}
	if _, err = repo.DepartmentScope(ctx, admin, ""); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("all bypassed missing permission", err)
	}
	// Passing a full account resource must still honor the request's bound role.
	limited := platform.WithTokenRole(ctx, actor.ID, dept)
	if f, err = repo.DataScope(limited, actor, "notes:access"); err != nil || f.All || !f.ContainsDepartment(a) || f.ContainsDepartment(b) {
		t.Fatal("PAT widened", f, err)
	}
	if _, err = repo.DepartmentScope(platform.WithTokenRole(ctx, actor.ID, "missing-role"), actor, "notes:access"); err == nil {
		t.Fatal("invalid PAT role accepted")
	}
	// Audit creators can move or disappear without moving a department resource.
	creator := user("resource-creator", &a, "user")
	if _, err = store.Exec(ctx, store.DB, "UPDATE unicore_users SET department_id=? WHERE id=?", b, creator.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, store.DB, "DELETE FROM unicore_user_roles WHERE user_id=?", creator.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, store.DB, "DELETE FROM unicore_users WHERE id=?", creator.ID); err != nil {
		t.Fatal(err)
	}
	if f, err = repo.DepartmentScope(limited, actor, "notes:access"); err != nil || !f.ContainsDepartment(a) || f.ContainsDepartment(b) {
		t.Fatal("creator move/delete changed ownership", f, err)
	}

	// One test-only mutable resource proves rejected writes roll back and the
	// persisted source (not a client-supplied creator) controls transfer access.
	if _, err = store.Exec(ctx, store.DB, "CREATE TABLE unicore_test_department_resources (id VARCHAR(64) PRIMARY KEY,department_id VARCHAR(64) NOT NULL,version BIGINT NOT NULL)"); err != nil {
		t.Fatal(err)
	}
	defer store.DB.ExecContext(context.Background(), "DROP TABLE unicore_test_department_resources")
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_test_department_resources(id,department_id,version) VALUES('asset',?,1)", a); err != nil {
		t.Fatal(err)
	}
	readWide := user("resource-read-wide", &a, dept, readAll)
	writeWide := user("resource-write-wide", &a, dept, writeAll)
	for _, tc := range []struct {
		name         string
		principal    contracts.User
		ctx          context.Context
		source, dest string
		allowed      bool
	}{
		{"cookie union covers both", actor, ctx, a, b, true},
		{"PAT source only", actor, limited, a, b, false},
		{"PAT outside source", actor, limited, b, a, false},
		{"read/write intersection", readWide, ctx, a, b, false},
		{"write/read intersection", writeWide, ctx, a, b, false},
		{"unassigned destination", admin, ctx, a, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tx, err := store.DB.BeginTx(tc.ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			if err = store.LockInstallation(tc.ctx, tx); err != nil {
				t.Fatal(err)
			}
			if _, err = store.Exec(tc.ctx, tx, "UPDATE unicore_test_department_resources SET version=version+1 WHERE id='asset'"); err != nil {
				t.Fatal(err)
			}
			err = repo.AuthorizeDepartmentTransfer(tc.ctx, tx, tc.principal.ID, tc.source, tc.dest, "notes:update", "updateNote", "notes:access")
			if (err == nil) != tc.allowed {
				t.Fatalf("allowed=%v error=%v", tc.allowed, err)
			}
			if err = tx.Rollback(); err != nil {
				t.Fatal(err)
			}
			var version int
			if err = store.Row(ctx, store.DB, "SELECT version FROM unicore_test_department_resources WHERE id='asset'").Scan(&version); err != nil || version != 1 {
				t.Fatal("denial leaked mutation", version, err)
			}
		})
	}
	// Connect actual private bytes to this database-backed resource. Both SQL
	// dialect fixtures and the local SQLite case consume grants after transfer.
	private := bloblocal.New(t.TempDir())
	key, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	file := files.ResourceFile{FileID: "artifact", Key: "artifacts/private", Name: "artifact.txt", MIME: "text/plain", Size: 7}
	if _, err = private.Put(ctx, file.Key, bytes.NewBufferString("private"), file.Size, file.MIME); err != nil {
		t.Fatal(err)
	}
	downloads := &files.ControlledStore{Store: private, Secrets: key, Authorizer: &sqlResourceAuthorizer{repo: repo, actorID: actor.ID, file: file}}
	patGrant, err := downloads.Sign(limited, "asset", []string{file.FileID}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	cookieGrant, err := downloads.Sign(ctx, "asset", []string{file.FileID}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	stream, _, err := downloads.Open(limited, patGrant.Token)
	if err != nil {
		t.Fatal(err)
	}
	stream.Close()

	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err = store.LockInstallation(ctx, tx); err != nil {
		t.Fatal(err)
	}
	if err = repo.AuthorizeDepartmentMutation(limited, tx, actor.ID, a, "notes:update", "updateNote", "notes:access"); err != nil {
		t.Fatal(err)
	}
	if err = repo.AuthorizeDepartmentMutation(limited, tx, actor.ID, b, "notes:update", "updateNote", "notes:access"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("foreign resource detail/mutation allowed", err)
	}
	if err = repo.AuthorizeDepartmentTransfer(ctx, tx, actor.ID, a, b, "notes:update", "updateNote", "notes:access"); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, tx, "UPDATE unicore_test_department_resources SET department_id=?,version=version+1 WHERE id='asset'", b); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	for _, request := range []struct {
		ctx   context.Context
		token string
	}{{limited, patGrant.Token}, {ctx, cookieGrant.Token}} {
		if _, _, err = downloads.Open(request.ctx, request.token); err == nil {
			t.Fatal("database transfer did not revoke old download")
		}
	}
	freshGrant, err := downloads.Sign(ctx, "asset", []string{file.FileID}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	stream, _, err = downloads.Open(ctx, freshGrant.Token)
	if err != nil {
		t.Fatal(err)
	}
	stream.Close()
	if err = repo.AuthorizeDepartmentMutation(ctx, tx, actor.ID, a, "notes:update", "updateNote"); !errors.Is(err, sql.ErrTxDone) {
		t.Fatal("closed transaction succeeded", err)
	}
	if err = repo.AuthorizeDepartmentMutation(ctx, nil, actor.ID, a, "notes:update", "updateNote"); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("nil transaction succeeded", err)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err = repo.DepartmentScope(cancelled, actor, "notes:access"); err == nil {
		t.Fatal("database failure widened department scope")
	}
}

func TestDepartmentResources(t *testing.T) {
	store, repo, admin := scopeSecurityStore(t)
	exerciseDepartmentResources(t, t.Context(), store, repo, admin)
}

// sqlResourceAuthorizer is a synthetic module with real SQL ownership and
// revision checks. Its immutable fixture artifact belongs only to asset.
type sqlResourceAuthorizer struct {
	repo    *Repository
	actorID string
	file    files.ResourceFile
}

func (a *sqlResourceAuthorizer) WithResourceFiles(ctx context.Context, resource string, ids []string, visit func(files.ResourceSnapshot) error) error {
	tx, err := a.repo.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = a.repo.Store.LockInstallation(ctx, tx); err != nil {
		return err
	}
	actor, err := a.repo.actor(ctx, tx, a.actorID, "notes:access")
	if err != nil {
		return err
	}
	if !platform.OperationAllowed(actor, "listNotes") {
		return platform.ErrForbidden
	}
	scope, err := a.repo.resolveDataScope(ctx, tx, actor, "notes:access", false)
	if err != nil {
		return err
	}
	var department string
	var version int64
	if err = a.repo.Store.Row(ctx, tx, "SELECT department_id,version FROM unicore_test_department_resources WHERE id=?", resource).Scan(&department, &version); err != nil {
		return err
	}
	if !scope.ContainsDepartment(department) || resource != "asset" || len(ids) != 1 || ids[0] != a.file.FileID {
		return files.ErrNotFound
	}
	if err = visit(files.ResourceSnapshot{Subject: actor.ID + "/" + platform.TokenRole(ctx, actor.ID), Revision: strconv.FormatInt(version, 10), Files: []files.ResourceFile{a.file}}); err != nil {
		return err
	}
	return tx.Commit()
}
