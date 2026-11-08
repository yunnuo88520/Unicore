// Author: yunnuo <ymz@ebox.vip>
// Description: Post administration endpoints: anonymous/member refusal, CSRF, canonical code conflicts and the member delete guard.
package httpadapter

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/contracts"
)

// TestPostAdministration drives the four /admin/posts operations end to end:
// the permission matrix (anonymous 401, user-realm member 403, CSRF-gated
// writes), canonical code handling and the membership delete guard. The member
// projection of post_ids is exercised by the user wiring tests.
func TestPostAdministration(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	_, _, identity, _ := manager.Services()

	// Anonymous requests are refused before any business logic.
	if w := request("GET", "/api/v1/admin/posts", nil, nil, ""); w.Code != http.StatusUnauthorized {
		t.Fatal("anonymous list", w.Code, w.Body.String())
	}

	// A user-realm member never reaches post administration.
	member, err := identity.Create(t.Context(), contracts.UserCreate{Username: "postmember", Email: "postmember@example.test", Password: "test-password-strong", Role: "user"}, adminUser(t, manager).ID)
	if err != nil {
		t.Fatal(err)
	}
	memberCookie, memberCSRF := issueSession(t, manager, false, member)
	if w := request("GET", "/api/v1/admin/posts", nil, memberCookie, ""); w.Code != http.StatusForbidden {
		t.Fatal("member list", w.Code, w.Body.String())
	}
	if w := request("POST", "/api/v1/admin/posts", map[string]any{"code": "engineer", "name": "工程师"}, memberCookie, memberCSRF); w.Code != http.StatusForbidden {
		t.Fatal("member create", w.Code, w.Body.String())
	}

	// Writes require the session-bound CSRF token.
	if w := request("POST", "/api/v1/admin/posts", map[string]any{"code": "engineer", "name": "工程师"}, adminCookie, ""); w.Code != http.StatusForbidden {
		t.Fatal("missing csrf", w.Code, w.Body.String())
	}

	// Codes trim and fold to lowercase; the echo is canonical.
	w := request("POST", "/api/v1/admin/posts", map[string]any{"code": "  Engineer ", "name": "工程师"}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("create", w.Code, w.Body.String())
	}
	var created contracts.PostResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Data.ID == "" || created.Data.Code != "engineer" || !created.Data.Enabled {
		t.Fatal("create payload", w.Body.String(), err)
	}
	postID := created.Data.ID

	// The same canonical code conflicts regardless of casing or spacing.
	if w = request("POST", "/api/v1/admin/posts", map[string]any{"code": "ENGINEER ", "name": "重复"}, adminCookie, adminCSRF); w.Code != http.StatusConflict {
		t.Fatal("duplicate code", w.Code, w.Body.String())
	}

	// Contract-invalid input never reaches the store.
	if w = request("POST", "/api/v1/admin/posts", map[string]any{"code": "bad code", "name": "含空格"}, adminCookie, adminCSRF); w.Code != http.StatusBadRequest {
		t.Fatal("invalid code", w.Code, w.Body.String())
	}

	// Updates rename and disable; the echo reflects the saved state.
	w = request("PUT", "/api/v1/admin/posts/"+postID, map[string]any{"code": "engineer", "name": "高级工程师", "enabled": false}, adminCookie, adminCSRF)
	if w.Code != http.StatusOK {
		t.Fatal("update", w.Code, w.Body.String())
	}
	var updated contracts.PostResponse
	if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil || updated.Data.Enabled || updated.Data.Name != "高级工程师" {
		t.Fatal("update payload", w.Body.String(), err)
	}
	if w = request("PUT", "/api/v1/admin/posts/missing-post", map[string]any{"code": "ghost", "name": "幽灵"}, adminCookie, adminCSRF); w.Code != http.StatusBadRequest {
		t.Fatal("unknown post updated", w.Code, w.Body.String())
	}

	// A user membership blocks deletion until the reference is cleared.
	repo := identity.Store.(*platformsql.Repository)
	if _, err = repo.Store.Exec(t.Context(), repo.Store.DB, "INSERT INTO unicore_user_posts(user_id,post_id) VALUES(?,?)", member.ID, postID); err != nil {
		t.Fatal(err)
	}
	w = request("GET", "/api/v1/admin/posts", nil, adminCookie, "")
	if w.Code != http.StatusOK {
		t.Fatal("list", w.Code, w.Body.String())
	}
	var list contracts.PostListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || list.Data.Total != 1 || len(list.Data.Items) != 1 {
		t.Fatal("list payload", w.Body.String(), err)
	}
	if list.Data.Items[0].MemberCount != 1 {
		t.Fatal("member count echo", w.Body.String())
	}
	if w = request("DELETE", "/api/v1/admin/posts/"+postID, nil, adminCookie, adminCSRF); w.Code != http.StatusConflict {
		t.Fatal("referenced post deleted", w.Code, w.Body.String())
	}
	if _, err = repo.Store.Exec(t.Context(), repo.Store.DB, "DELETE FROM unicore_user_posts WHERE user_id=? AND post_id=?", member.ID, postID); err != nil {
		t.Fatal(err)
	}
	if w = request("DELETE", "/api/v1/admin/posts/"+postID, nil, adminCookie, adminCSRF); w.Code != http.StatusOK {
		t.Fatal("unreferenced post delete", w.Code, w.Body.String())
	}
	if w = request("GET", "/api/v1/admin/posts", nil, adminCookie, ""); w.Code != http.StatusOK {
		t.Fatal("list after delete", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || list.Data.Total != 0 {
		t.Fatal("empty list payload", w.Body.String(), err)
	}
}

// TestUserPostMembership pins the E2E finding: post_ids on user create/update
// must bind, validate and persist, and every user projection echoes them.
// The administrator realm refuses any non-empty set.
func TestUserPostMembership(t *testing.T) {
	manager, request := actionRouter(t)
	adminCookie, adminCSRF := actionInstall(t, request)
	_, _, identity, _ := manager.Services()

	w := request("POST", "/api/v1/admin/posts", map[string]any{"code": "engineer", "name": "工程师"}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("post create", w.Code, w.Body.String())
	}
	var engineer contracts.PostResponse
	if err := json.Unmarshal(w.Body.Bytes(), &engineer); err != nil || engineer.Data.ID == "" {
		t.Fatal("post payload", w.Body.String(), err)
	}
	w = request("POST", "/api/v1/admin/posts", map[string]any{"code": "reviewer", "name": "审核员"}, adminCookie, adminCSRF)
	if err := json.Unmarshal(w.Body.Bytes(), &contracts.PostResponse{}); err != nil {
		t.Fatal(err)
	}
	var reviewer contracts.PostResponse
	_ = json.Unmarshal(w.Body.Bytes(), &reviewer)

	// Create with two memberships echoes both, sorted.
	w = request("POST", "/api/v1/admin/users", map[string]any{"username": "wired", "email": "wired@example.test", "password": "test-password-strong", "role": "user", "post_ids": []string{reviewer.Data.ID, engineer.Data.ID}}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("user create", w.Code, w.Body.String())
	}
	var created contracts.UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Data.PostIds == nil || len(*created.Data.PostIds) != 2 {
		t.Fatal("create echo lost post_ids", w.Body.String())
	}
	// Memberships are stored and echoed in stable post-id order.
	for _, id := range *created.Data.PostIds {
		if id != engineer.Data.ID && id != reviewer.Data.ID {
			t.Fatal("unexpected membership", id)
		}
	}

	// The list projection and the post_id filter carry the field.
	w = request("GET", "/api/v1/admin/users?post_id="+engineer.Data.ID, nil, adminCookie, "")
	if w.Code != 200 {
		t.Fatal("filtered list", w.Code, w.Body.String())
	}
	var list contracts.UserListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || list.Data.Total != 1 {
		t.Fatal("post filter", w.Body.String(), err)
	}
	if list.Data.Items[0].PostIds == nil || len(*list.Data.Items[0].PostIds) != 2 {
		t.Fatal("list echo lost post_ids", w.Body.String())
	}

	// An explicit list replaces; a single disabled-post assignment is refused.
	w = request("PATCH", "/api/v1/admin/users/"+created.Data.ID, map[string]any{"status": "active", "post_ids": []string{}}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("clear posts", w.Code, w.Body.String())
	}
	var cleared contracts.UserResponse
	_ = json.Unmarshal(w.Body.Bytes(), &cleared)
	if cleared.Data.PostIds == nil || len(*cleared.Data.PostIds) != 0 {
		t.Fatal("clear echo", w.Body.String())
	}
	if w = request("PATCH", "/api/v1/admin/users/"+created.Data.ID, map[string]any{"status": "active", "post_ids": []string{engineer.Data.ID, "missing-post"}}, adminCookie, adminCSRF); w.Code != 400 {
		t.Fatal("unknown post accepted", w.Code, w.Body.String())
	}

	// The administrator realm refuses any non-empty membership set.
	w = request("POST", "/api/v1/admin/administrators", map[string]any{"username": "postadmin", "email": "postadmin@example.test", "password": "test-password-strong", "role": "super_admin", "post_ids": []string{engineer.Data.ID}}, adminCookie, adminCSRF)
	if w.Code != 200 {
		t.Fatal("administrator membership accepted", w.Code, w.Body.String())
	}
	_ = identity
}
