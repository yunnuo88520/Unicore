// Author: yunnuo <ymz@ebox.vip>
// Description: Object key layout stays traversal-proof: cleaned folders, monthly tiers, generated names.
package files

import (
	"strings"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
)

func TestCleanRelativeDir(t *testing.T) {
	for _, good := range []string{"", "avatars", "notes/attachments", "团队/资料-2026"} {
		if _, err := cleanRelativeDir(good); err != nil {
			t.Fatalf("cleanRelativeDir(%q) rejected: %v", good, err)
		}
	}
	for _, bad := range []string{
		"../etc", "a/../b", "..", ".", "a/./b",          // traversal and dot segments
		"/abs", "lead/", "a//b",                        // absolute or malformed separators
		`a\b`, `..\x`,                                  // backslash forms
		strings.Repeat("a", 65), "a/" + strings.Repeat("b", 65), // oversized segments
		strings.Repeat("a/", 130) + "end",              // oversized total length
	} {
		if _, err := cleanRelativeDir(bad); err == nil {
			t.Fatalf("cleanRelativeDir(%q) accepted", bad)
		}
	}
}

func TestObjectExtension(t *testing.T) {
	for name, want := range map[string]string{
		"report.PDF": "pdf", "a.b.c.png": "png", "archive.tar.gz": "gz",
		"noext": "", "trailing.": "", ".hidden": "hidden", "we!rd.x#y": "",
		strings.Repeat("a", 13): "", "doc.x": "x",
	} {
		if got := objectExtension(name); got != want {
			t.Fatalf("objectExtension(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestBuildObjectKey(t *testing.T) {
	now := time.Date(2026, 11, 26, 10, 0, 0, 0, time.UTC)
	key := buildObjectKey("default", "ggy_school.SQL", "abc123", now)
	if key != "objects/default/2026/11/abc123.sql" {
		t.Fatalf("buildObjectKey default = %q", key)
	}
	if key := buildObjectKey("notes/attachments", "notes-file", "id9", now); key != "objects/notes/attachments/2026/11/id9" {
		t.Fatalf("buildObjectKey extensionless = %q", key)
	}
	if buildObjectKey("default", "same.pdf", "id", now) == buildObjectKey("default", "same.pdf", "id", now.AddDate(0, 1, 0)) {
		t.Fatal("monthly tier did not separate keys")
	}
}

func TestStoragePath(t *testing.T) {
	local := StoragePath(contracts.StorageLocation{Provider: "local"}, "objects/default/2026/11/a.pdf")
	if local != "files/objects/default/2026/11/a.pdf" {
		t.Fatalf("local storage path = %q", local)
	}
	cloud := StoragePath(contracts.StorageLocation{Provider: "s3", Bucket: "unicore-dev", Prefix: "/prefix/"}, "objects/2026/11/b.png")
	if cloud != "unicore-dev/prefix/objects/2026/11/b.png" {
		t.Fatalf("cloud storage path = %q", cloud)
	}
	if bare := StoragePath(contracts.StorageLocation{Provider: "oss"}, "objects/c.txt"); bare != "objects/c.txt" {
		t.Fatalf("cloud without bucket = %q", bare)
	}
}
