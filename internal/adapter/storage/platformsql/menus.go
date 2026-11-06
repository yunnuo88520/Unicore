// Author: yunnuo <ymz@ebox.vip>
// Description: Operator-editable workspace menu configuration; route facts stay in the frontend.
package platformsql

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// ListMenuConfig returns the saved overrides. Pages without a row fall back to
// their route defaults on the frontend, so the table starts empty and upgrades
// never need seeding.
func (r *Repository) ListMenuConfig(ctx context.Context) (contracts.MenuList, error) {
	result := contracts.MenuList{Items: []contracts.MenuEntry{}}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT menu_key,label,group_key,sort,visible FROM unicore_menus ORDER BY sort,menu_key")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry contracts.MenuEntry
		var visible int64
		if err = rows.Scan(&entry.MenuKey, &entry.Label, &entry.GroupKey, &entry.Sort, &visible); err != nil {
			return result, err
		}
		entry.Visible = visible != 0
		result.Items = append(result.Items, entry)
	}
	return result, rows.Err()
}

// SaveMenuConfig replaces the override rows wholesale; the payload is bounded by
// the contract (256 entries) and every field is bounded by its column.
func (r *Repository) SaveMenuConfig(ctx context.Context, items []contracts.MenuEntry, actor string) (contracts.MenuList, error) {
	for _, entry := range items {
		if strings.TrimSpace(entry.MenuKey) == "" || len(entry.MenuKey) > 64 || len(entry.Label) > 80 || len(entry.GroupKey) > 32 || entry.Sort < 0 {
			return contracts.MenuList{}, platform.ErrInput
		}
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
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_menus(menu_key,label,group_key,sort,visible,updated_at) VALUES(?,?,?,?,?,?)",
			entry.MenuKey, entry.Label, entry.GroupKey, entry.Sort, visible, time.Now().Unix()); err != nil {
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
