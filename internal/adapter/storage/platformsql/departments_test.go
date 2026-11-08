// Author: yunnuo <ymz@ebox.vip>
// Description: Department tree invariants and the role data-scope visibility matrix, per dialect.
package platformsql

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/filesql"
	"github.com/yunnuo/unicore/internal/adapter/storage/notessql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/usecase"
)

func ptrString(v string) *string   { return &v }
func ptrInt(v int) *int            { return &v }
func scopeString(v string) *string { return &v }

// mustUser re-reads one identity row; same-package tests reach the lowercase reader.
func mustUser(t *testing.T, ctx context.Context, repository *Repository, id string) contracts.User {
	t.Helper()
	user, err := repository.user(ctx, repository.Store.DB, id)
	if err != nil {
		t.Fatal("reload user", id, err)
	}
	return user
}

// exerciseDepartments covers the department tree: stable flat list, sibling-name
// uniqueness, parent validation, cycle rejection and the delete guards.
func exerciseDepartments(t *testing.T, ctx context.Context, store *sqlstore.Store, repository *Repository, admin contracts.User) {
	t.Helper()
	root, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "研发部", Sort: ptrInt(1)}, admin.ID)
	if err != nil || root.ParentID != nil {
		t.Fatal("create root", root, err)
	}
	other, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "市场部"}, admin.ID)
	if err != nil {
		t.Fatal("create second root", err)
	}
	child, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "后端组", ParentID: &root.ID}, admin.ID)
	if err != nil || child.ParentID == nil || *child.ParentID != root.ID {
		t.Fatal("create child", child, err)
	}
	grandchild, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "平台组", ParentID: &child.ID}, admin.ID)
	if err != nil {
		t.Fatal("create grandchild", err)
	}
	// Same-parent uniqueness: the root name repeats only under another parent.
	if _, err = repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "研发部"}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("duplicate sibling accepted", err)
	}
	duplicated, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "后端组", ParentID: &other.ID}, admin.ID)
	if err != nil {
		t.Fatal("same name under different parent", err)
	}
	if _, err = repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "   "}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("blank name accepted", err)
	}
	missing := "missing-department"
	if _, err = repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "孤儿组", ParentID: &missing}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("unknown parent accepted", err)
	}
	// Cycle guards: a department can never move under itself or a descendant.
	if _, err = repository.UpdateDepartment(ctx, root.ID, contracts.DepartmentSaveInput{Name: "研发部", ParentID: &root.ID}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("self parent accepted", err)
	}
	if _, err = repository.UpdateDepartment(ctx, root.ID, contracts.DepartmentSaveInput{Name: "研发部", ParentID: &grandchild.ID}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("descendant parent accepted", err)
	}
	// The earlier same-name fixture under 市场部 must go first: it occupies the
	// sibling slot the move below needs.
	if _, err = repository.DeleteDepartment(ctx, duplicated.ID, admin.ID); err != nil {
		t.Fatal("delete leaf", err)
	}
	if _, err = repository.UpdateDepartment(ctx, child.ID, contracts.DepartmentSaveInput{Name: "后端组", ParentID: &other.ID, Sort: ptrInt(5)}, admin.ID); err != nil {
		t.Fatal("move under other root", err)
	}
	list, err := repository.ListDepartments(ctx)
	if err != nil || list.Total != 4 || len(list.Items) != 4 {
		t.Fatal("list", list.Total, err)
	}
	// Flat ordering is global (sort, name, id): the two sort-0 rows come first,
	// 研发部 (sort 1) follows, the moved 后端组 (sort 5) is last.
	if list.Items[0].Name != "市场部" || list.Items[1].Name != "平台组" || list.Items[2].ID != root.ID || list.Items[3].Sort != 5 {
		t.Fatal("sort order", list.Items)
	}
	// Delete guards: children block the removal; empty leaves go through.
	if _, err = repository.DeleteDepartment(ctx, child.ID, admin.ID); !errors.Is(err, platform.ErrDepartmentInUse) {
		t.Fatal("delete with children", err)
	}
	if _, err = repository.DeleteDepartment(ctx, grandchild.ID, admin.ID); err != nil {
		t.Fatal("delete leaf", err)
	}
	if _, err = repository.DeleteDepartment(ctx, child.ID, admin.ID); err != nil {
		t.Fatal("delete emptied parent", err)
	}
}

// exerciseDataScopes runs the five-scope visibility matrix over notes and files:
// all, self, dept, dept_and_below and custom, plus the fail-closed paths.
func exerciseDataScopes(t *testing.T, ctx context.Context, store *sqlstore.Store, repository *Repository, admin contracts.User) {
	t.Helper()
	hash, err := platform.HashPassword("test-password-strong")
	if err != nil {
		t.Fatal(err)
	}
	newUser := func(name string, department *string) contracts.User {
		input := contracts.UserCreate{Username: name, Email: name + "@example.test", Password: "test-password-strong", Role: "user", DepartmentID: department}
		user, err := repository.CreateUser(ctx, input, hash, admin.ID)
		if err != nil {
			t.Fatal(name, err)
		}
		return user
	}
	// Departments: root -> A, B; A -> A1.
	root, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "范围根部门"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	deptA, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "范围A组", ParentID: &root.ID}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	deptB, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "范围B组", ParentID: &root.ID}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	deptA1, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "范围A1组", ParentID: &deptA.ID}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	memberA := newUser("scopea", &deptA.ID)
	memberA1 := newUser("scopea1", &deptA1.ID)
	memberB := newUser("scopeb", &deptB.ID)

	notes := &usecase.Notes{Repo: &notessql.Repository{Store: store}}
	filesRepo := &filesql.Repository{Store: store}
	now := int(time.Now().Unix())
	newNote := func(user contracts.User) {
		if _, err = notes.Create(ctx, "user/"+user.ID, contracts.NoteInput{Title: "note of " + user.Username, Body: "body", Status: "open", AttachmentIds: &[]string{}}); err != nil {
			t.Fatal("note", user.Username, err)
		}
		if err = filesRepo.Create(ctx, files.Record{
			FileEntry: contracts.FileEntry{FileID: "file-" + user.ID, OriginalName: user.Username + ".txt", StorageType: "local", LocationID: "local", MimeType: "text/plain", Size: 8, CreatorID: user.ID, CreatorRealm: "user", CreatedAt: now, State: "ready"},
			Purpose:   "user",
		}, nil); err != nil {
			t.Fatal("file", user.Username, err)
		}
	}
	newNote(memberA)
	newNote(memberA1)
	newNote(memberB)

	newRole := func(name, scope string, departments []string) contracts.Role {
		role, err := repository.CreateRole(ctx, contracts.RoleSaveInput{Name: name, Permissions: []string{"notes:access", "files:access"}, DataScope: scopeString(scope), DepartmentIds: &departments}, admin.ID)
		if err != nil {
			t.Fatal(name, err)
		}
		return role
	}
	holder := func(name string, department *string, roleID string) contracts.User {
		user := newUser(name, department)
		if _, err = repository.UpdateUser(ctx, user.ID, contracts.UserUpdate{Role: &roleID, Status: "active"}, admin.ID); err != nil {
			t.Fatal(name, err)
		}
		return mustUser(t, ctx, repository, user.ID)
	}
	resolve := func(user contracts.User) platform.ScopeFilter {
		filter, err := repository.DataScope(ctx, user)
		if err != nil {
			t.Fatal("resolve", user.Username, err)
		}
		return filter
	}
	userIDs := func(filter platform.ScopeFilter) map[string]bool {
		set := map[string]bool{}
		for _, id := range filter.UserIDs {
			set[id] = true
		}
		return set
	}
	expectUserSet := func(label string, filter platform.ScopeFilter, expected ...string) {
		if filter.All || len(filter.UserIDs) != len(expected) {
			t.Fatal(label, filter, expected)
		}
		want := map[string]bool{}
		for _, id := range expected {
			want[id] = true
		}
		for id := range want {
			if !userIDs(filter)[id] {
				t.Fatal(label, "missing", id, filter.UserIDs)
			}
		}
	}
	noteVisibility := func(filter platform.ScopeFilter) usecase.NoteVisibility {
		visibility := usecase.NoteVisibility{}
		if filter.All {
			visibility.All = true
			return visibility
		}
		for _, id := range filter.UserIDs {
			visibility.Scopes = append(visibility.Scopes, "user/"+id)
		}
		return visibility
	}
	countNotes := func(self string, filter platform.ScopeFilter) int {
		list, err := notes.List(ctx, "user/"+self, contracts.NoteQuery{Page: 1, Sort: "title", Direction: "asc"}, noteVisibility(filter))
		if err != nil {
			t.Fatal("notes list", err)
		}
		return list.Total
	}
	countFiles := func(self string, filter platform.ScopeFilter) int {
		list, err := filesRepo.List(ctx, files.Actor{ID: self, Realm: "user"}, "", 1, files.ScopeFilter{All: filter.All, CreatorIDs: filter.UserIDs})
		if err != nil {
			t.Fatal("files list", err)
		}
		return list.Total
	}
	// all: the holder sees every user-realm row; the filter carries no set.
	roleAll := newRole("全量范围角色", platform.ScopeAll, nil)
	holderAll := holder("scopeall", nil, roleAll.ID)
	self := holderAll.ID
	filter := resolve(holderAll)
	if !filter.All {
		t.Fatal("all scope", filter)
	}
	if countNotes(holderAll.ID, filter) != 3 || countFiles(holderAll.ID, filter) != 3 {
		t.Fatal("all visibility", countNotes(self, filter), countFiles(self, filter))
	}

	// self: the builtin behaviour - only the session user.
	roleSelf := newRole("本人范围角色", platform.ScopeSelf, nil)
	holderSelf := holder("scopeself", nil, roleSelf.ID)
	self = holderSelf.ID
	filter = resolve(holderSelf)
	expectUserSet("self", filter, holderSelf.ID)
	if countNotes(holderSelf.ID, filter) != 0 || countFiles(holderSelf.ID, filter) != 0 {
		t.Fatal("self visibility", countNotes(self, filter), countFiles(self, filter))
	}

	// Holders create no personal rows; the counts below come from the members.
	roleDept := newRole("本部门范围角色", platform.ScopeDept, nil)
	holderDept := holder("scopedept", &deptA.ID, roleDept.ID)
	self = holderDept.ID
	filter = resolve(holderDept)
	expectUserSet("dept", filter, holderDept.ID, memberA.ID)
	if countNotes(holderDept.ID, filter) != 1 || countFiles(holderDept.ID, filter) != 1 {
		t.Fatal("dept visibility", countNotes(self, filter), countFiles(self, filter))
	}

	// dept_and_below: the own department plus its subtree. holderDept also sits
	// in deptA from the previous block, so it is part of the visible set.
	roleBelow := newRole("部门及以下范围角色", platform.ScopeDeptBelow, nil)
	holderBelow := holder("scopebelow", &deptA.ID, roleBelow.ID)
	self = holderBelow.ID
	filter = resolve(holderBelow)
	expectUserSet("dept_and_below", filter, holderBelow.ID, holderDept.ID, memberA.ID, memberA1.ID)
	if countNotes(holderBelow.ID, filter) != 2 || countFiles(holderBelow.ID, filter) != 2 {
		t.Fatal("dept_and_below visibility", countNotes(self, filter), countFiles(self, filter))
	}

	// custom: exactly the configured departments, no subtree expansion.
	roleCustom := newRole("自定义范围角色", platform.ScopeCustom, []string{deptB.ID, deptA1.ID})
	holderCustom := holder("scopecustom", nil, roleCustom.ID)
	self = holderCustom.ID
	filter = resolve(holderCustom)
	expectUserSet("custom", filter, holderCustom.ID, memberB.ID, memberA1.ID)
	if countNotes(holderCustom.ID, filter) != 2 || countFiles(holderCustom.ID, filter) != 2 {
		t.Fatal("custom visibility", countNotes(self, filter), countFiles(self, filter))
	}
	echoed, err := repository.ListRoles(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, role := range echoed.Items {
		switch role.ID {
		case roleCustom.ID:
			if role.DataScope != platform.ScopeCustom || len(role.DepartmentIds) != 2 {
				t.Fatal("custom echo", role)
			}
		case roleAll.ID:
			if role.DataScope != platform.ScopeAll || len(role.DepartmentIds) != 0 {
				t.Fatal("all echo", role)
			}
		case roleDept.ID:
			if role.DataScope != platform.ScopeDept || len(role.DepartmentIds) != 0 {
				t.Fatal("dept echo", role)
			}
		}
	}

	// Fail-closed: an unknown persisted scope value must degrade to self. The
	// sqlite CHECK refuses the row outright; dialects without the CHECK rely on
	// the resolver default branch, which the assertion below exercises.
	unknown := sqlstore.ID()
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES(?,?,?,?)", unknown, "未知范围", "user", "weird"); err == nil {
		unknownHolder := holder("scopeunknown", &deptA.ID, unknown)
		filter = resolve(unknownHolder)
		expectUserSet("unknown fail-closed", filter, unknownHolder.ID)
		if countNotes(unknownHolder.ID, filter) != 0 {
			t.Fatal("unknown scope visibility", countNotes(unknownHolder.ID, filter))
		}
	}

	// Administrator repositories never resolve department scopes.
	adminFilter, err := (&Repository{Store: store, Administrators: true}).DataScope(ctx, admin)
	if err != nil || adminFilter.All || len(adminFilter.UserIDs) != 1 || adminFilter.UserIDs[0] != admin.ID {
		t.Fatal("administrator scope", adminFilter, err)
	}

	// Multi-role union: all swallows every restriction, custom adds members.
	both := holder("scopeunion", &deptB.ID, roleSelf.ID)
	if _, err = repository.UpdateUser(ctx, both.ID, contracts.UserUpdate{Role: &roleCustom.ID, Status: "active"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	filter = resolve(mustUser(t, ctx, repository, both.ID))
	expectUserSet("custom after reassign", filter, both.ID, memberB.ID, memberA1.ID)
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_user_roles(user_id,role_id) VALUES(?,?)", both.ID, roleAll.ID); err != nil {
		t.Fatal(err)
	}
	filter = resolve(mustUser(t, ctx, repository, both.ID))
	if !filter.All {
		t.Fatal("all swallows union", filter)
	}
}

// exerciseDepartmentScopeValidation covers the role-side data-scope guards that
// do not need the visibility matrix.
func exerciseDepartmentScopeValidation(t *testing.T, ctx context.Context, repository *Repository, admin contracts.User) {
	t.Helper()
	userRealm := "user"
	administratorRealm := "administrator"
	if _, err := repository.CreateRole(ctx, contracts.RoleSaveInput{Name: "非法范围", Realm: &userRealm, DataScope: scopeString("department")}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("invalid scope accepted", err)
	}
	if _, err := repository.CreateRole(ctx, contracts.RoleSaveInput{Name: "管理员越权范围", Realm: &administratorRealm, DataScope: scopeString(platform.ScopeDept)}, admin.ID); err != nil {
		t.Fatal("management role department scope rejected", err)
	}
	missing := contracts.RoleSaveInput{Name: "未知部门范围", Realm: &userRealm, DataScope: scopeString(platform.ScopeCustom), DepartmentIds: &[]string{"missing-department"}}
	if _, err := repository.CreateRole(ctx, missing, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("unknown custom department accepted", err)
	}
	// The builtin user role keeps its personal-only scope.
	if _, err := repository.UpdateRole(ctx, "user", contracts.RoleSaveInput{Name: "user", Permissions: []string{"notes:access"}, DataScope: scopeString(platform.ScopeAll)}, admin.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("builtin scope widening accepted", err)
	}
	// Non-custom scopes clear the configured departments.
	role, err := repository.CreateRole(ctx, contracts.RoleSaveInput{Name: "切换范围", Realm: &userRealm, DataScope: scopeString(platform.ScopeCustom), DepartmentIds: &[]string{}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if role.DataScope != platform.ScopeCustom || len(role.DepartmentIds) != 0 {
		t.Fatal("empty custom", role)
	}
	if _, err = repository.UpdateRole(ctx, role.ID, contracts.RoleSaveInput{Name: "切换范围", Permissions: []string{}, DataScope: scopeString(platform.ScopeSelf), DepartmentIds: &[]string{}}, admin.ID); err != nil {
		t.Fatal("switch to self", err)
	}
	after, err := repository.role(ctx, repository.Store.DB, role.ID)
	if err != nil || after.DataScope != platform.ScopeSelf || len(after.DepartmentIds) != 0 {
		t.Fatal("cleared custom departments", after, err)
	}
}

// exerciseUserDepartments covers the department projection on user payloads.
func exerciseUserDepartments(t *testing.T, ctx context.Context, repository *Repository, admin contracts.User) {
	t.Helper()
	hash, err := platform.HashPassword("test-password-strong")
	if err != nil {
		t.Fatal(err)
	}
	root, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "归属部门"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	other, err := repository.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "其他部门"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	user, err := repository.CreateUser(ctx, contracts.UserCreate{Username: "deptuser", Email: "deptuser@example.test", Password: "test-password-strong", Role: "user", DepartmentID: &root.ID}, hash, admin.ID)
	if err != nil || user.DepartmentID == nil || *user.DepartmentID != root.ID {
		t.Fatal("create with department", user, err)
	}
	if _, err = repository.CreateUser(ctx, contracts.UserCreate{Username: "deptbad", Email: "deptbad@example.test", Password: "test-password-strong", Role: "user", DepartmentID: ptrString("missing-department")}, hash, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("unknown department accepted", err)
	}
	// Omit keeps, empty clears, another id moves.
	if _, err = repository.UpdateUser(ctx, user.ID, contracts.UserUpdate{Status: "active"}, admin.ID); err != nil {
		t.Fatal(err)
	}
	kept := mustUser(t, ctx, repository, user.ID)
	if kept.DepartmentID == nil || *kept.DepartmentID != root.ID {
		t.Fatal("department not kept", kept)
	}
	if _, err = repository.UpdateUser(ctx, user.ID, contracts.UserUpdate{Status: "active", DepartmentID: &other.ID}, admin.ID); err != nil {
		t.Fatal("move department", err)
	}
	if _, err = repository.UpdateUser(ctx, user.ID, contracts.UserUpdate{Status: "active", DepartmentID: ptrString("")}, admin.ID); err != nil {
		t.Fatal("clear department", err)
	}
	cleared := mustUser(t, ctx, repository, user.ID)
	if cleared.DepartmentID != nil {
		t.Fatal("department not cleared", cleared)
	}
	list, err := repository.ListUsers(ctx, "deptuser", 1, 20)
	if err != nil || list.Total != 1 || list.Items[0].DepartmentID != nil {
		t.Fatal("list projection", list, err)
	}
	// Administrator accounts ignore departments entirely.
	admins := &Repository{Store: repository.Store, Administrators: true}
	created, err := admins.CreateUser(ctx, contracts.UserCreate{Username: "admindept", Email: "admindept@example.test", Password: "test-password-strong", Role: "super_admin", DepartmentID: &root.ID}, hash, admin.ID)
	if err != nil || created.DepartmentID == nil || *created.DepartmentID != root.ID {
		t.Fatal("administrator department", created, err)
	}
}
