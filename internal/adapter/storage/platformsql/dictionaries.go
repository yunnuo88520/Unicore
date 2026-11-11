// Author: yunnuo <ymz@ebox.vip>
// Description: Business data dictionaries: operator-managed type/item pairs for downstream forms.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

var dictionaryCode = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

func (r *Repository) ListDictionaries(ctx context.Context) (contracts.DictionaryList, error) {
	result := contracts.DictionaryList{Items: []contracts.DictionarySummary{}}
	rows, err := r.Store.Rows(ctx, r.Store.DB,
		"SELECT t.id,t.code,t.name,t.description,t.created_at,t.updated_at,(SELECT COUNT(*) FROM unicore_dict_items i WHERE i.type_code=t.code) FROM unicore_dict_types t ORDER BY t.code")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry contracts.DictionarySummary
		if err = rows.Scan(&entry.ID, &entry.Code, &entry.Name, &entry.Description, &entry.CreatedAt, &entry.UpdatedAt, &entry.ItemCount); err != nil {
			return result, err
		}
		result.Items = append(result.Items, entry)
	}
	return result, rows.Err()
}

// Dictionary resolves one type with its items; activeOnly serves the
// user-realm read endpoint, the management detail keeps every row.
func (r *Repository) Dictionary(ctx context.Context, id string, activeOnly bool) (contracts.DictionaryDetail, error) {
	result := contracts.DictionaryDetail{Items: []contracts.DictionaryItemEntry{}}
	err := r.Store.Row(ctx, r.Store.DB, "SELECT code,name,description FROM unicore_dict_types WHERE id=?", id).Scan(&result.Code, &result.Name, &result.Description)
	if errors.Is(err, sql.ErrNoRows) {
		return result, platform.ErrInput
	}
	if err != nil {
		return result, err
	}
	query := "SELECT id,value,label,remark,sort,status FROM unicore_dict_items WHERE type_code=?"
	if activeOnly {
		query += " AND status='active'"
	}
	query += " ORDER BY sort,value"
	rows, err := r.Store.Rows(ctx, r.Store.DB, query, result.Code)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry contracts.DictionaryItemEntry
		if err = rows.Scan(&entry.ID, &entry.Value, &entry.Label, &entry.Remark, &entry.Sort, &entry.Status); err != nil {
			return result, err
		}
		result.Items = append(result.Items, entry)
	}
	return result, rows.Err()
}

func (r *Repository) CreateDictionary(ctx context.Context, input contracts.DictionaryCreateInput, actor string) (contracts.DictionarySummary, error) {
	input.Code = strings.TrimSpace(input.Code)
	input.Name = strings.TrimSpace(input.Name)
	if !dictionaryCode.MatchString(input.Code) || input.Name == "" {
		return contracts.DictionarySummary{}, platform.ErrInput
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.DictionarySummary{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.DictionarySummary{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "dictionaries:write"); err != nil {
		return contracts.DictionarySummary{}, err
	}
	id := sqlstore.ID()
	now := time.Now().Unix()
	if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_dict_types(id,code,name,description,created_at,updated_at) VALUES(?,?,?,?,?,?)",
		id, input.Code, input.Name, input.Description, now, now); err != nil {
		return contracts.DictionarySummary{}, accountError(err)
	}
	if err = r.audit(audit.Target(ctx, "dictionary/"+id, "code="+input.Code), tx, actor, "dictionaries.created"); err != nil {
		return contracts.DictionarySummary{}, err
	}
	if err = tx.Commit(); err != nil {
		return contracts.DictionarySummary{}, err
	}
	return contracts.DictionarySummary{ID: id, Code: input.Code, Name: input.Name, Description: input.Description, CreatedAt: int(now), UpdatedAt: int(now)}, nil
}

func (r *Repository) UpdateDictionary(ctx context.Context, id string, input contracts.DictionaryUpdateInput, actor string) (contracts.DictionaryDetail, error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		return contracts.DictionaryDetail{}, platform.ErrInput
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.DictionaryDetail{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "dictionaries:write"); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	result, err := r.Store.Exec(ctx, tx, "UPDATE unicore_dict_types SET name=?,description=?,updated_at=? WHERE id=?", input.Name, input.Description, time.Now().Unix(), id)
	if err != nil {
		return contracts.DictionaryDetail{}, err
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return contracts.DictionaryDetail{}, platform.ErrInput
	}
	if err = r.audit(audit.Target(ctx, "dictionary/"+id, "updated"), tx, actor, "dictionaries.updated"); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	if err = tx.Commit(); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	return r.Dictionary(ctx, id, false)
}

func (r *Repository) DeleteDictionary(ctx context.Context, id string, actor string) (contracts.DictionaryDetail, error) {
	before, err := r.Dictionary(ctx, id, false)
	if err != nil {
		return contracts.DictionaryDetail{}, err
	}
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.DictionaryDetail{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "dictionaries:write"); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	// SQLite has no foreign keys at runtime; delete the items explicitly.
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_dict_items WHERE type_code=?", before.Code); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_dict_types WHERE id=?", id); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	if err = r.audit(audit.Target(ctx, "dictionary/"+id, "code="+before.Code), tx, actor, "dictionaries.deleted"); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	return before, tx.Commit()
}

// ReplaceDictionaryItems swaps the whole item list of one type; the payload is
// small and bounded, so delete-then-insert keeps unique constraints simple.
func (r *Repository) ReplaceDictionaryItems(ctx context.Context, id string, items []contracts.DictionaryItemEntry, actor string) (contracts.DictionaryDetail, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return contracts.DictionaryDetail{}, err
	}
	defer tx.Rollback()
	if err = r.Store.LockInstallation(ctx, tx); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	if err = r.AuthorizeAdministrator(ctx, tx, actor, "dictionaries:write"); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	var code string
	if err = r.Store.Row(ctx, tx, "SELECT code FROM unicore_dict_types WHERE id=?", id).Scan(&code); errors.Is(err, sql.ErrNoRows) {
		return contracts.DictionaryDetail{}, platform.ErrInput
	} else if err != nil {
		return contracts.DictionaryDetail{}, err
	}
	seen := map[string]bool{}
	for _, item := range items {
		value := strings.TrimSpace(item.Value)
		label := strings.TrimSpace(item.Label)
		if value == "" || label == "" || len(value) > 128 || len(label) > 80 || len(item.Remark) > 200 || item.Sort < 0 {
			return contracts.DictionaryDetail{}, platform.ErrInput
		}
		switch item.Status {
		case "active", "disabled":
		default:
			return contracts.DictionaryDetail{}, platform.ErrInput
		}
		if seen[value] {
			return contracts.DictionaryDetail{}, platform.ErrConflict
		}
		seen[value] = true
	}
	if _, err = r.Store.Exec(ctx, tx, "DELETE FROM unicore_dict_items WHERE type_code=?", code); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	now := time.Now().Unix()
	for _, item := range items {
		if _, err = r.Store.Exec(ctx, tx, "INSERT INTO unicore_dict_items(id,type_code,value,label,remark,sort,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
			sqlstore.ID(), code, strings.TrimSpace(item.Value), strings.TrimSpace(item.Label), item.Remark, item.Sort, item.Status, now, now); err != nil {
			return contracts.DictionaryDetail{}, err
		}
	}
	if _, err = r.Store.Exec(ctx, tx, "UPDATE unicore_dict_types SET updated_at=? WHERE id=?", now, id); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	if err = r.audit(audit.Target(ctx, "dictionary/"+id, "items="+strconv.Itoa(len(items))), tx, actor, "dictionaries.items_replaced"); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	if err = tx.Commit(); err != nil {
		return contracts.DictionaryDetail{}, err
	}
	return r.Dictionary(ctx, id, false)
}

// DictionaryByCode serves the user-realm read endpoint: active items only.
func (r *Repository) DictionaryByCode(ctx context.Context, code string, activeOnly bool) (contracts.DictionaryDetail, error) {
	result := contracts.DictionaryDetail{Items: []contracts.DictionaryItemEntry{}}
	if !dictionaryCode.MatchString(code) {
		return result, platform.ErrInput
	}
	err := r.Store.Row(ctx, r.Store.DB, "SELECT id,code,name,description FROM unicore_dict_types WHERE code=?", code).Scan(&result.ID, &result.Code, &result.Name, &result.Description)
	if errors.Is(err, sql.ErrNoRows) {
		return result, platform.ErrInput
	}
	if err != nil {
		return result, err
	}
	query := "SELECT id,value,label,remark,sort,status FROM unicore_dict_items WHERE type_code=?"
	if activeOnly {
		query += " AND status='active'"
	}
	query += " ORDER BY sort,value"
	rows, err := r.Store.Rows(ctx, r.Store.DB, query, code)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry contracts.DictionaryItemEntry
		if err = rows.Scan(&entry.ID, &entry.Value, &entry.Label, &entry.Remark, &entry.Sort, &entry.Status); err != nil {
			return result, err
		}
		result.Items = append(result.Items, entry)
	}
	return result, rows.Err()
}
