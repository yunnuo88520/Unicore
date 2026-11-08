// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded XLSX account imports and paginated management exports.
package httpadapter

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/xuri/excelize/v2"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/platform"
)

const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const maxImportBytes = 5 << 20
const maxImportRows = 1000
const maxExportRows = 10000

func sendWorkbook(w http.ResponseWriter, name string, file *excelize.File) {
	defer file.Close()
	buffer, err := file.WriteToBuffer()
	if err != nil {
		webError(w, err)
		return
	}
	w.Header().Set("Content-Type", xlsxMime)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(buffer.Bytes())
}

// readUserWorkbook validates the complete bounded sheet before any account writes.
func readUserWorkbook(reader io.Reader) ([][]string, error) {
	book, err := excelize.OpenReader(reader, excelize.Options{UnzipSizeLimit: 64 << 20, UnzipXMLSizeLimit: 8 << 20, RawCellValue: true})
	if err != nil {
		return nil, platform.ErrInput
	}
	defer book.Close()
	rows, err := book.Rows(book.GetSheetName(0))
	if err != nil {
		return nil, platform.ErrInput
	}
	defer rows.Close()
	result := [][]string{}
	for rows.Next() {
		if len(result) > maxImportRows {
			return nil, platform.ErrInput
		}
		row, err := rows.Columns(excelize.Options{RawCellValue: true})
		if err != nil || len(row) > 4 {
			return nil, platform.ErrInput
		}
		for _, value := range row {
			if len(value) > 1024 {
				return nil, platform.ErrInput
			}
		}
		result = append(result, row)
	}
	if rows.Error() != nil || len(result) < 2 {
		return nil, platform.ErrInput
	}
	header := result[0]
	if len(header) < 3 {
		return nil, platform.ErrInput
	}
	for i, names := range [][]string{{"username", "用户名"}, {"email", "邮箱"}, {"password", "初始密码"}} {
		value := strings.TrimSpace(strings.ToLower(header[i]))
		if value != names[0] && value != names[1] {
			return nil, platform.ErrInput
		}
	}
	return result, nil
}

func mountXlsx(api chi.Router, config Config) {
	manager := config.Install
	api.Get("/admin/users/export.xlsx", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "users:read")
		if !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		file := excelize.NewFile()
		defer file.Close()
		sheet := file.GetSheetName(0)
		if err := file.SetSheetRow(sheet, "A1", &[]any{"username", "email", "status", "roles", "created_at"}); err != nil {
			webError(w, err)
			return
		}
		count := 0
		for page := 1; ; page++ {
			list, err := identity.Store.ListUsersScoped(r.Context(), actor.User, r.URL.Query().Get("search"), page, 50)
			if err != nil {
				webError(w, err)
				return
			}
			if list.Total > maxExportRows || count+len(list.Items) > maxExportRows {
				webError(w, platform.ErrInput)
				return
			}
			for _, user := range list.Items {
				count++
				if err := file.SetSheetRow(sheet, fmt.Sprintf("A%d", count+1), &[]any{user.Username, user.Email, user.Status, strings.Join(user.Roles, ","), user.CreatedAt}); err != nil {
					webError(w, err)
					return
				}
			}
			if len(list.Items) < 50 || count >= list.Total {
				break
			}
		}
		sendWorkbook(w, "users.xlsx", file)
	})
	api.Get("/admin/users/import-template.xlsx", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "users:create"); !ok {
			return
		}
		file := excelize.NewFile()
		if err := file.SetSheetRow(file.GetSheetName(0), "A1", &[]any{"username", "email", "password", "role"}); err != nil {
			_ = file.Close()
			webError(w, err)
			return
		}
		sendWorkbook(w, "users-import-template.xlsx", file)
	})
	api.Post("/admin/users/import.xlsx", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "users:create")
		if !ok {
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxImportBytes)
		if err := r.ParseMultipartForm(maxImportBytes); err != nil {
			webError(w, platform.ErrInput)
			return
		}
		defer r.MultipartForm.RemoveAll()
		if len(r.MultipartForm.File) != 1 || len(r.MultipartForm.File["file"]) != 1 || len(r.MultipartForm.Value) != 0 {
			webError(w, platform.ErrInput)
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			webError(w, platform.ErrInput)
			return
		}
		defer file.Close()
		if !strings.HasSuffix(strings.ToLower(header.Filename), ".xlsx") {
			webError(w, platform.ErrInput)
			return
		}
		rows, err := readUserWorkbook(file)
		if err != nil {
			webError(w, err)
			return
		}
		_, _, identity, _ := manager.Services()
		// Bound expensive password hashing for imports independently of workbook size.
		if !identity.Limiter.Allow("user-import:"+actor.User.ID, 3, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		result := contracts.UserImportResult{Failed: []contracts.UserImportFailure{}}
		for index, row := range rows[1:] {
			blank := true
			for _, value := range row {
				if strings.TrimSpace(value) != "" {
					blank = false
					break
				}
			}
			if blank {
				continue
			}
			if err := r.Context().Err(); err != nil {
				webError(w, err)
				return
			}
			_, err := importOneUser(r.Context(), identity, row, actor.User.ID)
			if err != nil {
				message := importFailureMessage(err)
				if message == "" {
					webError(w, err)
					return
				}
				result.Failed = append(result.Failed, contracts.UserImportFailure{Row: index + 2, Error: message})
			} else {
				result.Created++
			}
		}
		success(w, result)
	})
	api.Get("/admin/files/export.xlsx", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "storage:read")
		if !ok {
			return
		}
		service := manager.Files()
		if service == nil {
			failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
			return
		}
		file := excelize.NewFile()
		defer file.Close()
		sheet := file.GetSheetName(0)
		if err := file.SetSheetRow(sheet, "A1", &[]any{"file_id", "name", "size", "state", "creator_id", "created_at"}); err != nil {
			webError(w, err)
			return
		}
		count := 0
		for page := 1; ; page++ {
			identity := manager.Identity(false)
			filter, err := identity.Store.DataScope(r.Context(), actor.User, "storage:read")
			if err != nil {
				webError(w, err)
				return
			}
			list, err := service.List(r.Context(), files.Actor{ID: actor.User.ID, Realm: "user", Admin: platform.IsSuper(actor.User)}, r.URL.Query().Get("search"), page, files.ScopeFilter{All: filter.All, CreatorIDs: filter.UserIDs})
			if err != nil {
				webError(w, err)
				return
			}
			if list.Total > maxExportRows || count+len(list.Items) > maxExportRows {
				webError(w, platform.ErrInput)
				return
			}
			for _, entry := range list.Items {
				count++
				if err := file.SetSheetRow(sheet, fmt.Sprintf("A%d", count+1), &[]any{entry.FileID, entry.OriginalName, entry.Size, entry.State, entry.CreatorID, entry.CreatedAt}); err != nil {
					webError(w, err)
					return
				}
			}
			if len(list.Items) == 0 || count >= list.Total {
				break
			}
		}
		sendWorkbook(w, "files.xlsx", file)
	})
}

func importFailureMessage(err error) string {
	var conflict *platform.AccountConflict
	switch {
	case errors.As(err, &conflict), errors.Is(err, platform.ErrConflict):
		return "用户名或邮箱已存在"
	case errors.Is(err, platform.ErrInput):
		return "用户名、邮箱、密码或角色不满足要求"
	}
	return ""
}

func importOneUser(ctx context.Context, identity *platform.Service, row []string, actor string) (contracts.User, error) {
	if len(row) < 3 {
		return contracts.User{}, platform.ErrInput
	}
	role := "user"
	if len(row) > 3 && strings.TrimSpace(row[3]) != "" {
		role = strings.TrimSpace(row[3])
	}
	input := contracts.UserCreate{Username: strings.TrimSpace(row[0]), Email: strings.TrimSpace(row[1]), Password: row[2], Role: role}
	// Invalid roles are ordinary row errors; revoked administrator authorization aborts the request.
	if role == "super_admin" {
		return contracts.User{}, platform.ErrInput
	}
	return identity.Create(ctx, input, actor)
}
