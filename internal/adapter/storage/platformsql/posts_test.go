// Author: yunnuo <ymz@ebox.vip>
// Description: Post catalogue invariants: code normalization, uniqueness, membership retention and realm isolation.
package platformsql

import (
	"context"
	"errors"
	"sort"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func postPtrBool(v bool) *bool { return &v }

// exercisePosts covers the independent post catalogue: normalized unique codes,
// stable ordering, enable/disable, the member-count echo, the user-only
// membership helpers and the delete guard for referenced posts. Posts never
// grant roles or permissions; the administrator realm stays post-free.
func exercisePosts(t *testing.T, ctx context.Context, store *sqlstore.Store, r *Repository, admin contracts.User) {
	t.Helper()
	hash, err := platform.HashPassword("test-password-strong")
	if err != nil {
		t.Fatal(err)
	}
	member, err := r.CreateUser(ctx, contracts.UserCreate{Username: "postmember", Email: "postmember@example.test", Password: "test-password-strong", Role: "user"}, hash, admin.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Codes and names trim, codes fold to lowercase, enabled defaults on.
	engineer, err := r.CreatePost(ctx, contracts.PostSaveInput{Code: "  Engineer ", Name: " 工程师 "}, admin.ID)
	if err != nil || engineer.Code != "engineer" || engineer.Name != "工程师" || !engineer.Enabled || engineer.Sort != 0 || engineer.Description != "" {
		t.Fatal("create normalization", engineer, err)
	}
	sortValue := 2
	description := "负责复核与质检"
	reviewer, err := r.CreatePost(ctx, contracts.PostSaveInput{Code: "REVIEWER", Name: "审核员", Sort: &sortValue, Enabled: postPtrBool(false), Description: &description}, admin.ID)
	if err != nil || reviewer.Enabled || reviewer.Sort != 2 || reviewer.Description != description {
		t.Fatal("create explicit", reviewer, err)
	}
	archived, err := r.CreatePost(ctx, contracts.PostSaveInput{Code: "archived", Name: "已归档岗", Enabled: postPtrBool(false)}, admin.ID)
	if err != nil || archived.Enabled {
		t.Fatal("create disabled", archived, err)
	}

	// Input invariants: blank names, malformed codes, oversized fields and
	// out-of-range sorts never reach the database.
	invalid := []contracts.PostSaveInput{
		{Code: "engineer", Name: "   "},
		{Code: "", Name: "空代码"},
		{Code: "bad code", Name: "含空格"},
		{Code: "-lead", Name: "首字符"},
		{Code: "岗位", Name: "非ASCII"},
		{Code: "engineer", Name: strings.Repeat("长", 65)},
		{Code: "engineer", Name: "超长描述", Description: ptrString(strings.Repeat("述", 501))},
		{Code: "engineer", Name: "负排序", Sort: ptrInt(-1)},
		{Code: "engineer", Name: "大排序", Sort: ptrInt(2147483648)},
	}
	for _, input := range invalid {
		if _, err = r.CreatePost(ctx, input, admin.ID); !errors.Is(err, platform.ErrInput) {
			t.Fatal("invalid input accepted", input.Name, err)
		}
	}

	// Canonical uniqueness: the same code after normalization conflicts.
	if _, err = r.CreatePost(ctx, contracts.PostSaveInput{Code: " ENGINEER ", Name: "重复"}, admin.ID); !errors.Is(err, platform.ErrPostConflict) {
		t.Fatal("duplicate code accepted", err)
	}

	// Stable list ordering: sort, then code, then id.
	list, err := r.ListPosts(ctx)
	if err != nil || list.Total != 3 || list.Items[0].ID != archived.ID || list.Items[1].ID != engineer.ID || list.Items[2].ID != reviewer.ID {
		t.Fatal("list order", list, err)
	}

	// Updates rename, re-enable and re-sort; a code colliding with another
	// post conflicts and unknown ids stay input errors.
	reEnable := true
	updated, err := r.UpdatePost(ctx, reviewer.ID, contracts.PostSaveInput{Code: "reviewer", Name: "复核员", Sort: &sortValue, Enabled: &reEnable, Description: &description}, admin.ID)
	if err != nil || !updated.Enabled || updated.Name != "复核员" || updated.Sort != 2 {
		t.Fatal("update", updated, err)
	}
	if _, err = r.UpdatePost(ctx, reviewer.ID, contracts.PostSaveInput{Code: "engineer", Name: "复核员"}, admin.ID); !errors.Is(err, platform.ErrPostConflict) {
		t.Fatal("code collision accepted", err)
	}
	if _, err = r.UpdatePost(ctx, "missing-post", contracts.PostSaveInput{Code: "ghost", Name: "幽灵"}, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("unknown post updated", err)
	}

	// User-realm membership validation: duplicates collapse, the result is
	// stable, unknown and newly assigned disabled posts are refused.
	ids, err := r.validateUserPosts(ctx, store.DB, "", []string{engineer.ID, engineer.ID, reviewer.ID})
	expected := []string{engineer.ID, reviewer.ID}
	sort.Strings(expected)
	if err != nil || len(ids) != 2 || ids[0] != expected[0] || ids[1] != expected[1] {
		t.Fatal("validate create", ids, err)
	}
	if _, err = r.validateUserPosts(ctx, store.DB, "", []string{"missing-post"}); !errors.Is(err, platform.ErrInput) {
		t.Fatal("unknown post assigned", err)
	}
	if _, err = r.validateUserPosts(ctx, store.DB, "", []string{archived.ID}); !errors.Is(err, platform.ErrInput) {
		t.Fatal("disabled post newly assigned", err)
	}

	// A membership that already exists may keep its disabled post on later
	// saves of the same user; removal stays an explicit choice.
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_user_posts(user_id,post_id) VALUES(?,?)", member.ID, archived.ID); err != nil {
		t.Fatal(err)
	}
	ids, err = r.validateUserPosts(ctx, store.DB, member.ID, []string{archived.ID, engineer.ID})
	if err != nil || len(ids) != 2 {
		t.Fatal("retained disabled membership", ids, err)
	}

	// The administrator realm never carries posts: validation and writes
	// refuse any non-empty set, an empty set stays a no-op.
	admins := &Repository{Store: store, Administrators: true}
	if _, err = admins.validateUserPosts(ctx, store.DB, admin.ID, []string{engineer.ID}); err != nil {
		t.Fatal("privileged user posts validation", err)
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = admins.writeUserPosts(ctx, tx, admin.ID, []string{engineer.ID}); err != nil {
		t.Fatal("privileged user posts write", err)
	}
	if err = admins.writeUserPosts(ctx, tx, admin.ID, nil); err != nil {
		t.Fatal("administrator empty posts", err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}

	// Membership writes echo back in stable order for the user realm only.
	tx, err = store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = r.writeUserPosts(ctx, tx, member.ID, []string{reviewer.ID, engineer.ID}); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	echo, err := r.userPostIDs(ctx, store.DB, member.ID)
	if err != nil || len(echo) != 2 || echo[0] != expected[0] || echo[1] != expected[1] {
		t.Fatal("membership echo", echo, err)
	}

	// Member counts mirror the membership table.
	if _, err = store.Exec(ctx, store.DB, "DELETE FROM unicore_user_posts WHERE user_id=? AND post_id=?", member.ID, archived.ID); err != nil {
		t.Fatal(err)
	}
	list, err = r.ListPosts(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, post := range list.Items {
		switch post.ID {
		case engineer.ID, reviewer.ID:
			if post.MemberCount != 1 {
				t.Fatal("member count", post.Code, post.MemberCount)
			}
		case archived.ID:
			if post.MemberCount != 0 {
				t.Fatal("cleared member count", post.Code, post.MemberCount)
			}
		}
	}

	// A referenced post cannot be deleted; clearing the membership unlocks it.
	if _, err = r.DeletePost(ctx, engineer.ID, admin.ID); !errors.Is(err, platform.ErrPostInUse) {
		t.Fatal("referenced post deleted", err)
	}
	tx, err = store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = r.writeUserPosts(ctx, tx, member.ID, []string{reviewer.ID}); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if _, err = r.DeletePost(ctx, engineer.ID, admin.ID); err != nil {
		t.Fatal("unreferenced post delete", err)
	}
	if _, err = r.DeletePost(ctx, engineer.ID, admin.ID); !errors.Is(err, platform.ErrInput) {
		t.Fatal("missing post deleted", err)
	}
	echo, err = r.userPostIDs(ctx, store.DB, member.ID)
	if err != nil || len(echo) != 1 || echo[0] != reviewer.ID {
		t.Fatal("echo after delete", echo, err)
	}

	// User-realm accounts never administer the catalogue.
	if _, err = r.CreatePost(ctx, contracts.PostSaveInput{Code: "sneak", Name: "越权"}, member.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("member created post", err)
	}
	if _, err = r.CreatePost(ctx, contracts.PostSaveInput{Code: "sneak", Name: "空操作"}, ""); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("empty actor created post", err)
	}
	if _, err = r.UpdatePost(ctx, reviewer.ID, contracts.PostSaveInput{Code: "reviewer", Name: "越权"}, member.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("member updated post", err)
	}
	if _, err = r.DeletePost(ctx, reviewer.ID, member.ID); !errors.Is(err, platform.ErrForbidden) {
		t.Fatal("member deleted post", err)
	}
}
