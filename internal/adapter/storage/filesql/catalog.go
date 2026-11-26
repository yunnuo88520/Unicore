// Author: yunnuo <ymz@ebox.vip>
// Description: Paginated instance catalog and logical directory aggregation without bucket scans.
package filesql

import (
	"context"
	"database/sql"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
)

func literalLike(value string) string {
	return strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(value)
}

func catalogWhere(filter files.CatalogFilter, dialect string) (string, []any) {
	where := "state<>'deleted'"
	args := []any{}
	if filter.LocationID != "" {
		where += " AND location_id=?"
		args = append(args, filter.LocationID)
	}
	if filter.Search != "" {
		where += " AND (LOWER(original_name) LIKE ? ESCAPE '!' OR LOWER(creator_id) LIKE ? ESCAPE '!' OR LOWER(id) LIKE ? ESCAPE '!')"
		search := "%" + literalLike(strings.ToLower(filter.Search)) + "%"
		args = append(args, search, search, search)
	}
	if filter.DirectorySet && filter.Directory == "" {
		where += " AND (file_key NOT LIKE '%/%' OR (file_key LIKE 'objects/%' AND file_key NOT LIKE 'objects/%/%'))"
	}
	if filter.Directory != "" {
		prefix := filter.Directory + "/"
		objectPrefix := "objects/" + prefix
		match := "(SUBSTR(file_key,1,?)=? OR (purpose='branding' AND SUBSTR(file_key,1,?)=?))"
		if dialect == "mysql" {
			match = "(CAST(SUBSTR(file_key,1,?) AS BINARY)=CAST(? AS BINARY) OR (purpose='branding' AND CAST(SUBSTR(file_key,1,?) AS BINARY)=CAST(? AS BINARY)))"
		}
		where += " AND " + match
		args = append(args, utf8.RuneCountInString(objectPrefix), objectPrefix, utf8.RuneCountInString(prefix), prefix)
	}
	return where, args
}

func (r *Repository) Catalog(ctx context.Context, filter files.CatalogFilter) (contracts.FileCatalogList, error) {
	list := contracts.FileCatalogList{Items: []contracts.FileCatalogEntry{}, Page: filter.Page, PageSize: 20}
	where, args := catalogWhere(filter, r.Store.Dialect)
	var options *sql.TxOptions
	if r.Store.Dialect != "sqlite" {
		options = &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true}
	}
	tx, err := r.Store.DB.BeginTx(ctx, options)
	if err != nil {
		return list, err
	}
	defer tx.Rollback()
	if err = r.Store.Row(ctx, tx, "SELECT COUNT(*) FROM unicore_file_metadata WHERE "+where, args...).Scan(&list.Total); err != nil {
		return list, err
	}
	pageArgs := append(append([]any{}, args...), list.PageSize, (filter.Page-1)*list.PageSize)
	rows, err := r.Store.Rows(ctx, tx, "SELECT "+columns+" FROM unicore_file_metadata WHERE "+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?", pageArgs...)
	if err != nil {
		return list, err
	}
	for rows.Next() {
		f, err := scan(rows)
		if err != nil {
			rows.Close()
			return list, err
		}
		list.Items = append(list.Items, contracts.FileCatalogEntry{File: f.FileEntry, Purpose: f.Purpose, Directory: files.Directory(f)})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return list, err
	}
	return list, tx.Commit()
}

func (r *Repository) Directories(ctx context.Context) (contracts.FileDirectoryList, error) {
	result := contracts.FileDirectoryList{Items: []contracts.FileDirectory{}}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT location_id,file_key,size FROM unicore_file_metadata WHERE state<>'deleted'")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	groups := map[string]*contracts.FileDirectory{}
	for rows.Next() {
		var f files.Record
		if err = rows.Scan(&f.LocationID, &f.Key, &f.Size); err != nil {
			return result, err
		}
		dir := files.Directory(f)
		key := f.LocationID + "\x00" + dir
		if groups[key] == nil {
			groups[key] = &contracts.FileDirectory{LocationID: f.LocationID, Path: dir}
		}
		groups[key].FileCount++
		groups[key].TotalSize += f.Size
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	for _, group := range groups {
		result.Items = append(result.Items, *group)
	}
	sort.Slice(result.Items, func(i, j int) bool {
		a, b := result.Items[i], result.Items[j]
		if a.LocationID != b.LocationID {
			return a.LocationID < b.LocationID
		}
		return a.Path < b.Path
	})
	return result, nil
}

func (r *Repository) MigrationSelection(ctx context.Context, filter files.CatalogFilter) (contracts.FileMigrationSelection, error) {
	result := contracts.FileMigrationSelection{FileIds: []string{}}
	where, args := catalogWhere(filter, r.Store.Dialect)
	if filter.TargetLocationID != "" {
		where += " AND location_id<>?"
		args = append(args, filter.TargetLocationID)
	}
	if filter.LocalSourcesOnly {
		where += " AND storage_type='local'"
	}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT id FROM unicore_file_metadata WHERE "+where+" AND state='ready' AND (expires_at=0 OR expires_at>?) ORDER BY created_at DESC,id LIMIT 100001", append(args, time.Now().Unix())...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return result, err
		}
		result.FileIds = append(result.FileIds, id)
		if len(result.FileIds) > 100000 {
			return contracts.FileMigrationSelection{}, files.ErrInvalid
		}
	}
	return result, rows.Err()
}
