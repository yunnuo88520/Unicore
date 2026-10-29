// Author: yunnuo <ymz@ebox.vip>
// Description: Enforce embedded lifecycle on new domain aggregates, with documented value-object exceptions.
package domain

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"strings"
	"testing"
	"time"
)

func TestAggregateLifecycleConvention(t *testing.T) {
	// Value objects are immutable computed values, never database aggregates.
	exceptions := map[string]string{"BaseEntity": "the lifecycle base itself", "Analysis": "computed text analysis value object"}
	files, err := parser.ParseDir(token.NewFileSet(), ".", func(info fs.FileInfo) bool { return !strings.HasSuffix(info.Name(), "_test.go") }, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, pkg := range files {
		for _, file := range pkg.Files {
			ast.Inspect(file, func(node ast.Node) bool {
				spec, ok := node.(*ast.TypeSpec)
				if !ok {
					return true
				}
				body, ok := spec.Type.(*ast.StructType)
				if !ok || !spec.Name.IsExported() {
					return true
				}
				if exceptions[spec.Name.Name] != "" {
					return true
				}
				embedded := false
				for _, field := range body.Fields.List {
					if len(field.Names) == 0 {
						if id, ok := field.Type.(*ast.Ident); ok && id.Name == "BaseEntity" {
							embedded = true
						}
					}
				}
				if !embedded {
					t.Errorf("domain aggregate %s must embed BaseEntity or declare a reviewed value-object exception", spec.Name.Name)
				}
				return true
			})
		}
	}
}
func TestBaseEntityAndPublication(t *testing.T) {
	now := time.Unix(1234, 0)
	a := NewEntity(now)
	b := NewEntity(now)
	if a.ID == b.ID || len(a.ID) != 48 || a.Version != 1 || a.DeletedAt != 0 || a.CreatedAt != 1234 || a.UpdatedAt != 1234 {
		t.Fatal(a, b)
	}
	announcement := Announcement{BaseEntity: a, Content: "notice", Format: "markdown", Type: "info", Status: "published", PublishAt: 1234}
	if announcement.Validate() != nil || !announcement.Visible(true, 1234) || announcement.Visible(false, 1234) || announcement.Visible(true, 1233) {
		t.Fatal("publication boundary")
	}
	announcement.DeletedAt = 1234
	if announcement.Visible(true, 1234) {
		t.Fatal("deleted announcement visible")
	}
}
