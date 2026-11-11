// Author: yunnuo <ymz@ebox.vip>
// Description: Independent post catalogue and user-only membership with transactional administrator checks.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

var postCodePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]*$`)

func normalizePost(input contracts.PostSaveInput) (contracts.Post, error) {
	p := contracts.Post{Code: strings.ToLower(strings.TrimSpace(input.Code)), Name: strings.TrimSpace(input.Name), Enabled: true}
	if input.Sort != nil {
		p.Sort = *input.Sort
	}
	if input.Enabled != nil {
		p.Enabled = *input.Enabled
	}
	if input.Description != nil {
		p.Description = strings.TrimSpace(*input.Description)
	}
	if len(p.Code) > 64 || !postCodePattern.MatchString(p.Code) || p.Name == "" || utf8.RuneCountInString(p.Name) > 64 || utf8.RuneCountInString(p.Description) > 500 || p.Sort < 0 || int64(p.Sort) > 2147483647 {
		return contracts.Post{}, platform.ErrInput
	}
	return p, nil
}

func postEnabledInt(enabled bool) int {
	if enabled {
		return 1
	}
	return 0
}

func postError(err error) error {
	if err != nil {
		message := strings.ToLower(err.Error())
		if strings.Contains(message, "unique") || strings.Contains(message, "duplicate") {
			return platform.ErrPostConflict
		}
	}
	return err
}

func (r *Repository) post(ctx context.Context, q sqlstore.Runner, id string) (contracts.Post, error) {
	var p contracts.Post
	var enabled int
	err := r.Store.Row(ctx, q, "SELECT id,code,name,sort,enabled,description,created_at,updated_at,(SELECT COUNT(*) FROM unicore_user_posts up WHERE up.post_id=unicore_posts.id) FROM unicore_posts WHERE id=?", id).Scan(&p.ID, &p.Code, &p.Name, &p.Sort, &enabled, &p.Description, &p.CreatedAt, &p.UpdatedAt, &p.MemberCount)
	if errors.Is(err, sql.ErrNoRows) {
		return contracts.Post{}, platform.ErrInput
	}
	p.Enabled = enabled != 0
	return p, err
}

func (r *Repository) ListPosts(ctx context.Context) (contracts.PostList, error) {
	result := contracts.PostList{Items: []contracts.Post{}}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT id,code,name,sort,enabled,description,created_at,updated_at,(SELECT COUNT(*) FROM unicore_user_posts up WHERE up.post_id=unicore_posts.id) FROM unicore_posts ORDER BY sort,code,id")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var p contracts.Post
		var enabled int
		if err = rows.Scan(&p.ID, &p.Code, &p.Name, &p.Sort, &enabled, &p.Description, &p.CreatedAt, &p.UpdatedAt, &p.MemberCount); err != nil {
			return result, err
		}
		p.Enabled = enabled != 0
		result.Items = append(result.Items, p)
	}
	result.Total = len(result.Items)
	return result, rows.Err()
}

func (r *Repository) savePost(ctx context.Context, id string, input contracts.PostSaveInput, actor string) (contracts.Post, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Post{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Post{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "posts:write"); err != nil {
		return contracts.Post{}, err
	}
	p, err := normalizePost(input)
	if err != nil {
		return contracts.Post{}, err
	}
	var count int
	if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_posts WHERE code=? AND id<>?", p.Code, id).Scan(&count); err != nil {
		return contracts.Post{}, err
	}
	if count != 0 {
		return contracts.Post{}, platform.ErrPostConflict
	}
	now := time.Now().Unix()
	action := "posts.updated"
	if id == "" {
		id = sqlstore.ID()
		action = "posts.created"
		_, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_posts(id,code,name,sort,enabled,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", id, p.Code, p.Name, p.Sort, postEnabledInt(p.Enabled), p.Description, now, now)
	} else {
		if _, err = r.post(ctx, tx, id); err != nil {
			return contracts.Post{}, err
		}
		_, err = r.Store.Exec(ctx, tx, "UPDATE unicore_posts SET code=?,name=?,sort=?,enabled=?,description=?,updated_at=? WHERE id=?", p.Code, p.Name, p.Sort, postEnabledInt(p.Enabled), p.Description, now, id)
	}
	if err != nil {
		return contracts.Post{}, postError(err)
	}
	if err = r.audit(audit.Target(ctx, "post/"+id, "fields=code,name,sort,enabled,description"), tx, actor, action); err != nil {
		return contracts.Post{}, err
	}
	p, err = r.post(ctx, tx, id)
	if err != nil {
		return contracts.Post{}, err
	}
	return p, tx.Commit()
}

func (r *Repository) CreatePost(ctx context.Context, input contracts.PostSaveInput, actor string) (contracts.Post, error) {
	return r.savePost(ctx, "", input, actor)
}

func (r *Repository) UpdatePost(ctx context.Context, id string, input contracts.PostSaveInput, actor string) (contracts.Post, error) {
	if id == "" {
		return contracts.Post{}, platform.ErrInput
	}
	return r.savePost(ctx, id, input, actor)
}

// DeletePost protects user memberships even when the post or its members are disabled.
func (r *Repository) DeletePost(ctx context.Context, id, actor string) (contracts.Post, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.Post{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.Post{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "posts:write"); err != nil {
		return contracts.Post{}, err
	}
	p, err := r.post(ctx, tx, id)
	if err != nil {
		return contracts.Post{}, err
	}
	var count int
	if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_user_posts WHERE post_id=?", id).Scan(&count); err != nil {
		return contracts.Post{}, err
	}
	if count != 0 {
		return contracts.Post{}, platform.ErrPostInUse
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_posts WHERE id=?", id); err != nil {
		return contracts.Post{}, err
	}
	if err = r.audit(audit.Target(ctx, "post/"+id, "deleted"), tx, actor, "posts.deleted"); err != nil {
		return contracts.Post{}, err
	}
	return p, tx.Commit()
}

// userPostIDs always addresses the user identity table; posts never grant roles or permissions.
func (r *Repository) userPostIDs(ctx context.Context, q sqlstore.Runner, userID string) ([]string, error) {
	ids := []string{}
	rows, err := r.Store.Rows(ctx, q, "SELECT post_id FROM unicore_user_posts WHERE user_id=? ORDER BY post_id", userID)
	if err != nil {
		return ids, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// validateUserPosts permits retained disabled memberships but rejects newly assigned disabled posts.
// The caller holds LockInstallation and writes memberships in the same transaction.
func (r *Repository) validateUserPosts(ctx context.Context, q sqlstore.Runner, userID string, ids []string) ([]string, error) {
	result := []string{}
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		p, err := r.post(ctx, q, id)
		if err != nil {
			return nil, err
		}
		if !p.Enabled {
			var count int
			if userID == "" {
				return nil, platform.ErrInput
			}
			if err = r.Store.Row(ctx, q, "SELECT COUNT(*) FROM unicore_user_posts WHERE user_id=? AND post_id=?", userID, id).Scan(&count); err != nil {
				return nil, err
			}
			if count == 0 {
				return nil, platform.ErrInput
			}
		}
		result = append(result, id)
	}
	sort.Strings(result)
	return result, nil
}

func (r *Repository) writeUserPosts(ctx context.Context, tx *sql.Tx, userID string, ids []string) error {
	if _, err := r.Store.Exec(ctx, tx, "DELETE FROM unicore_user_posts WHERE user_id=?", userID); err != nil {
		return err
	}
	for _, id := range ids {
		if _, err := r.Store.Exec(ctx, tx, "INSERT INTO unicore_user_posts(user_id,post_id) VALUES(?,?)", userID, id); err != nil {
			return err
		}
	}
	return nil
}
