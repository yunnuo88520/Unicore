// Author: yunnuo <ymz@ebox.vip>
// Description: Real native contributions follow the compiled notes edition without a Wails host.
package desktop

import (
	"context"
	bridge "github.com/yunnuo/unicore/internal/adapter/desktop"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/edition"
	"testing"
)

func TestNotesEditionDesktop(t *testing.T) {
	store, settings, err := local.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	b := bridge.NewLocal(bootstrap.Core(), settings, store)
	response := b.CreateNote(contracts.NoteInput{Title: "edition", Status: "open"})
	want := "NOT_AVAILABLE"
	if edition.Notes {
		want = "OK"
	}
	if response.Code != want {
		t.Fatalf("create: %s", response.Code)
	}
	list := b.ListNotes(contracts.NoteQuery{Page: 1, Sort: "updated_at", Direction: "desc"})
	if list.Code != want {
		t.Fatalf("list: %s", list.Code)
	}
	if !edition.Notes {
		if b.UpdateNote("id", contracts.NoteUpdate{}).Code != want || b.DeleteNote("id", contracts.NoteVersion{}).Code != want {
			t.Fatal("omitted native write available")
		}
	}
}
