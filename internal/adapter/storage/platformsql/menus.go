// Author: yunnuo <ymz@ebox.vip>
// Description: Operator-editable workspace menu configuration; route facts stay in the frontend.
package platformsql

import (
	"context"
	"database/sql"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// menuLinkPrefix marks operator-created link rows; registered route pages never
// use it, so the prefix decides how the frontend and this adapter treat a row.
const menuLinkPrefix = "link:"

// maxMenuDepth bounds parent_key nesting: a top-level node is depth 1.
const maxMenuDepth = 5

// ListMenuConfig returns every configured row: page overrides plus operator
// created link rows. Pages without a row fall back to their route defaults on
// the frontend, so the table starts empty and upgrades never need seeding.
func (r *Repository) listLegacyMenuConfig(ctx context.Context) (contracts.MenuList, error) {
	result := contracts.MenuList{Items: []contracts.MenuEntry{}}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT menu_key,label,group_key,sort,visible,parent_key,type,url FROM unicore_menus ORDER BY sort,menu_key")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry contracts.MenuEntry
		var visible int64
		var parentKey, entryType, entryURL sql.NullString
		if err = rows.Scan(&entry.MenuKey, &entry.Label, &entry.GroupKey, &entry.Sort, &visible, &parentKey, &entryType, &entryURL); err != nil {
			return result, err
		}
		entry.Visible = visible != 0
		if parentKey.Valid && parentKey.String != "" {
			entry.ParentKey = &parentKey.String
		}
		entry.Type = entryType.String
		if entry.Type == "" {
			entry.Type = "page"
		}
		if entryURL.Valid && entryURL.String != "" {
			entry.Url = &entryURL.String
		}
		result.Items = append(result.Items, entry)
	}
	return result, rows.Err()
}

// validateMenuTree checks a complete replacement payload as one tree before any
// row is written: bounded fields, link-row constraints, parent existence,
// acyclic nesting and the depth limit. Registered page keys are frontend facts,
// so parents must be part of the submitted rows; link keys are the only
// server-validated namespace.
func validateMenuTree(items []contracts.MenuEntry) error {
	index := make(map[string]int, len(items))
	for position, entry := range items {
		if strings.TrimSpace(entry.MenuKey) == "" || len(entry.MenuKey) > 64 || len(entry.GroupKey) > 32 || entry.Sort < 0 || utf8.RuneCountInString(entry.Label) > 80 {
			return platform.ErrInput
		}
		if _, taken := index[entry.MenuKey]; taken {
			return platform.ErrInput
		}
		index[entry.MenuKey] = position
		switch entry.Type {
		case "page":
			// Page rows override a registered route and never carry a link target.
			if entry.Url != nil && *entry.Url != "" {
				return platform.ErrInput
			}
			if strings.HasPrefix(entry.MenuKey, menuLinkPrefix) {
				return platform.ErrInput
			}
		case "link":
			// Link rows are operator-created nodes: reserved prefix, bounded
			// label and a required http(s) or site-relative target.
			if !strings.HasPrefix(entry.MenuKey, menuLinkPrefix) || entry.MenuKey == menuLinkPrefix {
				return platform.ErrInput
			}
			if utf8.RuneCountInString(entry.Label) > 64 {
				return platform.ErrInput
			}
			if entry.Url == nil || !validMenuURL(*entry.Url) {
				return platform.ErrInput
			}
		default:
			return platform.ErrInput
		}
	}
	for _, entry := range items {
		if entry.ParentKey == nil || *entry.ParentKey == "" {
			continue
		}
		if *entry.ParentKey == entry.MenuKey {
			return platform.ErrInput
		}
		if _, ok := index[*entry.ParentKey]; !ok {
			return platform.ErrInput
		}
	}
	// Walk every chain towards the root: returning to the chain start means a
	// cycle, and any other cycle exceeds the depth limit first because the walk
	// is bounded by maxMenuDepth.
	for _, entry := range items {
		depth := 1
		current := entry
		for current.ParentKey != nil && *current.ParentKey != "" {
			depth++
			if depth > maxMenuDepth {
				return platform.ErrInput
			}
			next := items[index[*current.ParentKey]]
			if next.MenuKey == entry.MenuKey {
				return platform.ErrInput
			}
			current = next
		}
	}
	return nil
}

// validMenuURL accepts absolute http(s) URLs and in-site relative paths
// starting with a single slash; anything else (other schemes, protocol-relative
// hosts, whitespace or control characters) is refused.
func validMenuURL(raw string) bool {
	if raw == "" || len(raw) > 2048 || strings.ContainsFunc(raw, func(r rune) bool { return r <= ' ' || r == '\x7f' }) {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil {
		return false
	}
	if strings.HasPrefix(raw, "/") {
		// A double slash is a protocol-relative host reference, not a path.
		return !strings.HasPrefix(raw, "//") && parsed.Scheme == "" && parsed.Host == ""
	}
	return (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}

// SaveMenuConfig replaces the override rows wholesale; the payload is bounded by
// the contract (256 entries) and validated as one tree before the transaction.
func (r *Repository) SaveMenuConfig(ctx context.Context, items []contracts.MenuEntry, actor string) (contracts.MenuList, error) {
	return r.saveLegacyMenuConfig(ctx,items,actor)
}
func (r *Repository) saveLegacyMenuConfig(ctx context.Context, items []contracts.MenuEntry, actor string) (contracts.MenuList, error) {
	if err := validateMenuTree(items); err != nil {
		return contracts.MenuList{}, err
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.MenuList{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.MenuList{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "menus:write"); err != nil {
		return contracts.MenuList{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_menus"); err != nil {
		return contracts.MenuList{}, err
	}
	for _, entry := range items {
		visible := 0
		if entry.Visible {
			visible = 1
		}
		var parentKey, entryURL any
		if entry.ParentKey != nil && *entry.ParentKey != "" {
			parentKey = *entry.ParentKey
		}
		if entry.Url != nil && *entry.Url != "" {
			entryURL = *entry.Url
		}
		entryType := entry.Type
		if entryType == "" {
			entryType = "page"
		}
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_menus(menu_key,label,group_key,sort,visible,parent_key,type,url,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
			entry.MenuKey, entry.Label, entry.GroupKey, entry.Sort, visible, parentKey, entryType, entryURL, time.Now().Unix()); err != nil {
			return contracts.MenuList{}, err
		}
	}
	if err = r.audit(audit.Target(ctx, "menus/", "entries="+strconv.Itoa(len(items))), tx, actor, "menus.updated"); err != nil {
		return contracts.MenuList{}, err
	}
	if err = tx.Commit(); err != nil {
		return contracts.MenuList{}, err
	}
	return r.ListMenuConfig(ctx)
}
