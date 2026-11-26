// Author: yunnuo <ymz@ebox.vip>
// Description: Paginated instance catalog with location, purpose and MIME-category filters; never scans buckets.
package filesql

import (
	"context"
	"database/sql"
	"strings"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
)

func literalLike(value string) string {
	return strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(value)
}

// categoryPrefixes mirrors the catalog MIME categories with portable LIKE
// prefixes. Values are internal constants, never user input, so no escaping.
var categoryPrefixes = map[string][]string{
	files.CategoryImage: {"image/"},
	files.CategoryDocument: {
		"text/", "application/pdf", "application/msword", "application/rtf",
		"application/json", "application/xml", "application/vnd.openxml",
		"application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/vnd.oasis",
	},
	files.CategoryArchive: {
		"application/zip", "application/x-zip", "application/gzip", "application/x-gzip",
		"application/x-tar", "application/x-7z", "application/x-rar", "application/vnd.rar",
		"application/x-bzip2", "application/x-xz", "application/vnd.android.package-archive",
	},
}

func allCategoryPrefixes() []string {
	known := []string{}
	for _, category := range []string{files.CategoryImage, files.CategoryDocument, files.CategoryArchive} {
		known = append(known, categoryPrefixes[category]...)
	}
	return known
}

// catalogWhere assembles the shared filter clause; every value is either an
// internal constant or length-bounded input bound as a parameter.
func catalogWhere(filter files.CatalogFilter) (string, []any) {
	where := "state<>'deleted'"
	args := []any{}
	if filter.LocationID != "" {
		where += " AND location_id=?"
		args = append(args, filter.LocationID)
	}
	if filter.Purpose != "" {
		where += " AND purpose=?"
		args = append(args, filter.Purpose)
	}
	if filter.Search != "" {
		where += " AND (LOWER(original_name) LIKE ? ESCAPE '!' OR LOWER(creator_id) LIKE ? ESCAPE '!' OR LOWER(id) LIKE ? ESCAPE '!')"
		search := "%" + literalLike(strings.ToLower(filter.Search)) + "%"
		args = append(args, search, search, search)
	}
	switch filter.TypeCategory {
	case files.CategoryOther:
		where += " AND NOT (1=0"
		for _, prefix := range allCategoryPrefixes() {
			where += " OR mime_type LIKE ?"
			args = append(args, prefix+"%")
		}
		where += ")"
	case files.CategoryImage, files.CategoryDocument, files.CategoryArchive:
		where += " AND (1=0"
		for _, prefix := range categoryPrefixes[filter.TypeCategory] {
			where += " OR mime_type LIKE ?"
			args = append(args, prefix+"%")
		}
		where += ")"
	}
	return where, args
}

func (r *Repository) Catalog(ctx context.Context, filter files.CatalogFilter) (contracts.FileCatalogList, error) {
	list := contracts.FileCatalogList{Items: []contracts.FileCatalogEntry{}, Page: filter.Page, PageSize: 20}
	where, args := catalogWhere(filter)
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
		list.Items = append(list.Items, contracts.FileCatalogEntry{File: f.FileEntry, Purpose: f.Purpose, Directory: files.Directory(f), FileKey: f.Key, Etag: f.ETag})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return list, err
	}
	return list, tx.Commit()
}
