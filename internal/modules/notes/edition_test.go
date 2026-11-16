// Author: yunnuo <ymz@ebox.vip>
// Description: The compiled edition must agree across capability and module contributions.
package notes_test

import (
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/edition"
	"github.com/yunnuo/unicore/internal/module"
	"github.com/yunnuo/unicore/internal/modules/notes"
	"github.com/yunnuo/unicore/internal/runtime"
	"strings"
	"testing"
)

func TestNotesEdition(t *testing.T) {
	module.Register(notes.Module)
	for _, profile := range []string{"web-platform", "web-standalone", "desktop", "cli"} {
		metadata := runtime.Metadata(contracts.Profile(profile), "test")
		if got := metadata.Capabilities.Features["notes"]; got != (edition.Notes && profile != "cli") {
			t.Fatalf("%s: notes=%v", profile, got)
		}
	}
	permissions := 0
	for _, p := range module.Permissions() {
		if strings.HasPrefix(p.ID, "notes:") {
			permissions++
		}
	}
	if (permissions != 0) != edition.Notes {
		t.Fatalf("notes permissions=%d", permissions)
	}
	pages := 0
	for _, page := range module.NavigationPages() {
		if page.ID == "notes" {
			pages++
		}
	}
	if (pages != 0) != edition.Notes {
		t.Fatalf("notes navigation=%d", pages)
	}
}
