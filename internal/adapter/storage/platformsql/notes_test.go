// Author: yunnuo <ymz@ebox.vip>
// Description: The business example exercises isolation, literal search, pagination and optimistic locking on each SQL dialect.
package platformsql

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/notessql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/usecase"
)

func exerciseNotes(t *testing.T, ctx context.Context, store *sqlstore.Store) {
	t.Helper()
	n := &usecase.Notes{Repo: &notessql.Repository{Store: store}}
	q := contracts.NoteQuery{Page: 1, Sort: "title", Direction: "asc"}
	created, err := n.Create(ctx, "user/example", contracts.NoteInput{Title: "  100%_!计划  ", Body: "private body", Status: "open"})
	if err != nil || created.Title != "100%_!计划" || created.Version != 1 {
		t.Fatal(created, err)
	}
	for _, scope := range []string{"user/other", "administrator/example", "local"} {
		list, e := n.List(ctx, scope, q)
		if e != nil || list.Total != 0 {
			t.Fatal("scope leaked", scope, list, e)
		}
		if _, e = n.Update(ctx, scope, created.ID, contracts.NoteUpdate{Title: "stolen", Status: "open", Version: 1}); !errors.Is(e, usecase.ErrNoteNotFound) {
			t.Fatal("cross-scope update", e)
		}
		if e = n.Delete(ctx, scope, created.ID, 1); !errors.Is(e, usecase.ErrNoteNotFound) {
			t.Fatal("cross-scope delete", e)
		}
	}
	for i := 0; i < 21; i++ {
		if _, err = n.Create(ctx, "user/example", contracts.NoteInput{Title: fmt.Sprintf("item %02d", i), Status: "open"}); err != nil {
			t.Fatal(err)
		}
	}
	list, err := n.List(ctx, "user/example", q)
	if err != nil || list.Total != 22 || len(list.Items) != 20 || list.Items[0].ID != created.ID {
		t.Fatal("page/order", list, err)
	}
	q.Page = 2
	list, err = n.List(ctx, "user/example", q)
	if err != nil || len(list.Items) != 2 {
		t.Fatal("second page", list, err)
	}
	q.Page = 1
	q.Search = "%_!"
	list, err = n.List(ctx, "user/example", q)
	if err != nil || list.Total != 1 {
		t.Fatal("wildcards were not literal", list, err)
	}
	q.Search = "' OR 1=1 --"
	list, err = n.List(ctx, "user/example", q)
	if err != nil || list.Total != 0 {
		t.Fatal("search injection", list, err)
	}
	q.Sort = "title; DROP TABLE example_notes"
	if _, err = n.List(ctx, "user/example", q); !errors.Is(err, domain.ErrNoteInvalid) {
		t.Fatal("sort accepted", err)
	}
	update := contracts.NoteUpdate{Title: created.Title, Body: "revised", Status: "done", Version: 1}
	revised, err := n.Update(ctx, "user/example", created.ID, update)
	if err != nil || revised.Version != 2 {
		t.Fatal("update", revised, err)
	}
	if _, err = n.Update(ctx, "user/example", created.ID, update); !errors.Is(err, usecase.ErrNoteConflict) {
		t.Fatal("lost update", err)
	}
	if err = n.Delete(ctx, "user/example", created.ID, 1); !errors.Is(err, usecase.ErrNoteConflict) {
		t.Fatal("stale delete", err)
	}
	if _, err = n.Create(ctx, "user/example", contracts.NoteInput{Title: "attachment", Status: "open", AttachmentIds: []string{"foreign-file"}}); !errors.Is(err, domain.ErrNoteInvalid) {
		t.Fatal("unvalidated attachment", err)
	}
	if err = store.Migrate(ctx, true); err != nil {
		t.Fatal("business migration retry", err)
	}
	q = contracts.NoteQuery{Page: 1, Sort: "updated_at", Direction: "desc", Status: "done"}
	list, err = n.List(ctx, "user/example", q)
	if err != nil || list.Total != 1 || list.Items[0].Body != "revised" {
		t.Fatal("migration/filter", list, err)
	}
	if err = n.Delete(ctx, "user/example", created.ID, 2); err != nil {
		t.Fatal(err)
	}
	var removedAt, version int
	if err = store.Row(ctx, store.DB, "SELECT deleted_at,version FROM example_notes WHERE scope_key=? AND id=?", "user/example", created.ID).Scan(&removedAt, &version); err != nil || removedAt == 0 || version != 3 {
		t.Fatal("soft deletion", removedAt, version, err)
	}
	if _, err = n.Update(ctx, "user/example", created.ID, update); !errors.Is(err, usecase.ErrNoteNotFound) {
		t.Fatal("deleted note update", err)
	}
	list, err = n.List(ctx, "user/example", q)
	if err != nil || list.Total != 0 {
		t.Fatal("deleted note listed", list, err)
	}
	var audit int
	if err = store.Row(ctx, store.DB, "SELECT COUNT(*) FROM audit_logs WHERE actor_id=? AND action IN ('notes.created','notes.updated','notes.deleted')", "user/example").Scan(&audit); err != nil || audit != 24 {
		t.Fatal("audit", audit, err)
	}
}
