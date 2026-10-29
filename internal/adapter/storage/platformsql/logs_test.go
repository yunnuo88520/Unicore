// Author: yunnuo <ymz@ebox.vip>
// Description: Audit snapshots, literal filtering, date boundaries and deterministic paging across supported SQL dialects.
package platformsql

import (
	"context"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailcontent"
	"github.com/yunnuo/unicore/internal/settings"
	"testing"
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
	q.Search = ""
	q.End = first.Items[0].CreatedAt
	none, e = repo.SystemLogs(ctx, q)
	if e != nil || none.Total != 0 {
		t.Fatal("exclusive date end", e)
	}
	// Retry after additive DDL succeeded but its ledger entry was not recorded.
	if _, e = store.Exec(ctx, store.DB, "DELETE FROM schema_migrations WHERE version=10"); e != nil {
		t.Fatal(e)
	}
	if e = store.Migrate(ctx, true); e != nil {
		t.Fatal("migration retry", e)
	}
}
