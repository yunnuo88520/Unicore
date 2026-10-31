// Author: yunnuo <ymz@ebox.vip>
// Description: Audit snapshots, literal filtering, date boundaries and deterministic paging across supported SQL dialects.
package platformsql

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlite"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailcontent"
	"github.com/yunnuo/unicore/internal/settings"
)

func exerciseLogs(t *testing.T, ctx context.Context, store *sqlstore.Store) {
	t.Helper()
	repo := &Repository{Store: store}
	config := &settings.Service{Store: store, Profile: "web-platform"}
	customized := mailcontent.Template{Subject: "{{site_name}} verification", Body: "<p>Code: <strong>{{code}}</strong></p>"}
	if err := config.SaveMailTemplate(ctx, "verify", &customized, "actor-test"); err != nil {
		t.Fatal("save template", err)
	}
	values, err := config.Raw(ctx)
	if err != nil {
		t.Fatal(err)
	}
	persisted, custom, err := mailcontent.Read(values, "verify")
	if err != nil || !custom || persisted != customized {
		t.Fatal("persistent template", persisted, err)
	}
	if err = config.SaveMailTemplate(ctx, "verify", nil, "actor-test"); err != nil {
		t.Fatal("reset template", err)
	}
	values, err = config.Raw(ctx)
	if err != nil {
		t.Fatal(err)
	}
	persisted, custom, err = mailcontent.Read(values, "verify")
	if err != nil || custom || persisted != mailcontent.Default("verify") {
		t.Fatal("reset default", persisted, err)
	}
	for i := 0; i < 25; i++ {
		tx, e := store.DB.BeginTx(ctx, nil)
		if e != nil {
			t.Fatal(e)
		}
		e = store.Audit(audit.With(ctx, audit.Metadata{ActorName: "operator%_!", Realm: "administrator", IP: "2001:db8::1", Target: "mail-template/login", Detail: "updated"}), tx, "actor-test", "test.filtered")
		if e != nil {
			t.Fatal(e)
		}
		if e = tx.Commit(); e != nil {
			t.Fatal(e)
		}
	}
	q := contracts.AuditLogQuery{Action: "test.filtered", Search: "%_!", Page: 1, PageSize: 20, Sort: "created_at", Direction: "desc"}
	first, e := repo.SystemLogs(ctx, q)
	if e != nil || first.Total != 25 || len(first.Items) != 20 || first.Items[0].IpAddress != "2001:db8::1" {
		t.Fatal(first, e)
	}
	q.Page = 2
	second, e := repo.SystemLogs(ctx, q)
	if e != nil || len(second.Items) != 5 {
		t.Fatal(second, e)
	}
	ids := map[string]bool{}
	for _, v := range first.Items {
		ids[v.ID] = true
	}
	for _, v := range second.Items {
		if ids[v.ID] {
			t.Fatal("unstable page")
		}
	}
	q.Page = 1
	q.Search = "' OR 1=1 --"
	none, e := repo.SystemLogs(ctx, q)
	if e != nil || none.Total != 0 {
		t.Fatal("search injection", none, e)
	}
	exerciseLogTimeBoundaries(t, ctx, store)
	// Retry after additive DDL succeeded but its ledger entry was not recorded.
	if _, e = store.Exec(ctx, store.DB, "DELETE FROM schema_migrations WHERE version=10"); e != nil {
		t.Fatal(e)
	}
	if e = store.Migrate(ctx, true); e != nil {
		t.Fatal("migration retry", e)
	}
}

func TestSystemLogTimeBoundariesSQLite(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "logs.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err = store.Migrate(ctx, true); err != nil {
		t.Fatal(err)
	}
	exerciseLogTimeBoundaries(t, ctx, store)
}

func exerciseLogTimeBoundaries(t *testing.T, ctx context.Context, store *sqlstore.Store) {
	t.Helper()
	// Fixed seconds exercise both sides and equality without depending on Audit's wall clock.
	const boundary = 1700000000
	const action = "test.time-boundary"
	fixtures := []struct {
		id      string
		created int
	}{
		{"time-before", boundary - 1},
		{"time-equal-a", boundary},
		{"time-equal-b", boundary},
		{"time-after", boundary + 1},
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	timestamps := make(map[string]int, len(fixtures))
	for _, fixture := range fixtures {
		if _, err = store.Exec(ctx, tx, "INSERT INTO audit_logs(id,actor_id,action,created_at) VALUES(?,?,?,?)", fixture.id, "boundary-actor", action, fixture.created); err != nil {
			t.Fatal(err)
		}
		timestamps[fixture.id] = fixture.created
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	repo := &Repository{Store: store}
	for _, tc := range []struct {
		name      string
		start     int
		end       int
		direction string
		want      []string
	}{
		{"unbounded ascending", 0, 0, "asc", []string{"time-before", "time-equal-a", "time-equal-b", "time-after"}},
		{"end excludes equal and after", 0, boundary, "asc", []string{"time-before"}},
		{"start includes equal and after", boundary, 0, "asc", []string{"time-equal-a", "time-equal-b", "time-after"}},
		{"bounded equality only", boundary, boundary + 1, "asc", []string{"time-equal-a", "time-equal-b"}},
		{"start after boundary", boundary + 1, 0, "asc", []string{"time-after"}},
		{"equal bounds empty", boundary, boundary, "asc", nil},
		{"unbounded descending", 0, 0, "desc", []string{"time-after", "time-equal-b", "time-equal-a", "time-before"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, err := repo.SystemLogs(ctx, contracts.AuditLogQuery{Action: action, Start: tc.start, End: tc.end, Page: 1, PageSize: 20, Sort: "created_at", Direction: tc.direction})
			if err != nil {
				t.Fatal(err)
			}
			if result.Total != len(tc.want) || len(result.Items) != len(tc.want) {
				t.Fatalf("total=%d items=%+v; want ordered IDs %v", result.Total, result.Items, tc.want)
			}
			for i, id := range tc.want {
				entry := result.Items[i]
				if entry.ID != id || entry.CreatedAt != timestamps[id] || entry.Action != action {
					t.Fatalf("item %d=%+v; want ID=%s created_at=%d action=%s", i, entry, id, timestamps[id], action)
				}
			}
		})
	}
}
