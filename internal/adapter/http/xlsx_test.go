// Author: yunnuo <ymz@ebox.vip>
// Description: XLSX malformed-sheet bounds and safe account import failures.
package httpadapter

import (
	"bytes"
	"context"
	"errors"
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
