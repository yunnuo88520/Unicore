// Author: yunnuo <ymz@ebox.vip>
// Description: XLSX malformed-sheet bounds and safe account import failures.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"
	"github.com/yunnuo/unicore/internal/platform"
)

func TestUserWorkbookBounds(t *testing.T) {
	workbook := func(rows [][]any) []byte {
		t.Helper()
		book := excelize.NewFile()
		defer book.Close()
		for i, row := range rows {
			cell, _ := excelize.CoordinatesToCellName(1, i+1)
			if err := book.SetSheetRow("Sheet1", cell, &row); err != nil {
				t.Fatal(err)
			}
		}
		data, err := book.WriteToBuffer()
		if err != nil {
			t.Fatal(err)
		}
		return data.Bytes()
	}
	for _, tc := range []struct {
		name  string
		rows  [][]any
		valid bool
	}{
		{"short row", [][]any{{"username", "email", "password", "role"}, {"short"}}, true},
		{"bad header", [][]any{{"something", "else", "wrong"}, {"user"}}, false},
		{"extra column", [][]any{{"username", "email", "password", "role"}, {"user", "mail", "password", "user", "extra"}}, false},
		{"oversize cell", [][]any{{"username", "email", "password", "role"}, {strings.Repeat("x", 1025)}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows, err := readUserWorkbook(bytes.NewReader(workbook(tc.rows)))
			if (err == nil) != tc.valid {
				t.Fatalf("rows=%v err=%v", rows, err)
			}
		})
	}
	if _, err := readUserWorkbook(strings.NewReader("not a zip")); !errors.Is(err, platform.ErrInput) {
		t.Fatal(err)
	}
	if _, err := importOneUser(context.Background(), nil, []string{"short"}, "actor"); !errors.Is(err, platform.ErrInput) {
		t.Fatal(err)
	}
	if _, err := importOneUser(context.Background(), nil, []string{"member", "member@example.test", "secret", "super_admin"}, "actor"); !errors.Is(err, platform.ErrInput) {
		t.Fatal(err)
	}
	if message := importFailureMessage(errors.New("SQL: private-password")); message != "" {
		t.Fatal("raw internal error exposed", message)
	}
}

func TestScopedUserListAndExportShareVisibility(t *testing.T) {
	manager, request := actionRouter(t)
	actionInstall(t, request)
	actor := adminUser(t, manager)
	identity := manager.Identity(false)
	ctx := t.Context()
	department, err := identity.Store.CreateDepartment(ctx, contracts.DepartmentSaveInput{Name: "Visible department"}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	scope := "custom"
	departments := []string{department.ID}
	role, err := identity.Store.CreateRole(ctx, contracts.RoleSaveInput{Name: "Scoped reader", Permissions: []string{"users:read"}, DataScope: &scope, DepartmentIds: &departments}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	create := func(name string, roles []string, dep *string) contracts.User {
		user, e := identity.Create(ctx, contracts.UserCreate{Username: name, Email: name + "@example.test", Password: "test-password-strong", RoleIds: &roles, DepartmentID: dep}, actor.ID)
		if e != nil {
			t.Fatal(e)
		}
		return user
	}
	reader := create("scoped-reader", []string{role.ID}, nil)
	visible := create("scoped-visible", []string{"user"}, &department.ID)
	outside := create("scoped-hidden", []string{"user"}, nil)
	cookie, _ := issueSession(t, manager, false, reader)
	response := request("GET", "/api/v1/admin/users", nil, cookie, "")
	var list contracts.UserListResponse
	if err := json.Unmarshal(response.Body.Bytes(), &list); err != nil || response.Code != 200 || list.Data.Total != 2 {
		t.Fatal("scoped list", response.Code, response.Body.String(), err)
	}
	response = request("GET", "/api/v1/admin/users/export.xlsx", nil, cookie, "")
	if response.Code != 200 {
		t.Fatal("scoped export", response.Code, response.Body.String())
	}
	book, err := excelize.OpenReader(bytes.NewReader(response.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	defer book.Close()
	rows, err := book.GetRows(book.GetSheetName(0))
	if err != nil || len(rows) != 3 {
		t.Fatal("export scope", rows, err)
	}
	names := map[string]bool{}
	for _, row := range rows[1:] {
		names[row[0]] = true
	}
	if !names[reader.Username] || !names[visible.Username] || names[outside.Username] {
		t.Fatal("export leaked account", names)
	}
}
