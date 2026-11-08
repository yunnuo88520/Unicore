// Author: yunnuo <ymz@ebox.vip>
// Description: Menu tree validation and link-row round trips: cycles, depth, parents and dialect storage.
package platformsql

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/migrations/runner"
)

func menuPtr(v string) *string { return &v }

func menuPage(key string) contracts.MenuEntry {
	return contracts.MenuEntry{MenuKey: key, Label: key, GroupKey: "一级导航", Sort: 100, Visible: true, Type: "page"}
}

func menuLink(key, target string) contracts.MenuEntry {
	return contracts.MenuEntry{MenuKey: key, Label: "外部链接", GroupKey: "业务入口", Sort: 200, Visible: true, Type: "link", Url: &target}
}

func TestValidateMenuTree(t *testing.T) {
	cases := []struct {
		name  string
		items []contracts.MenuEntry
		valid bool
	}{
		{"flat pages", []contracts.MenuEntry{menuPage("notes"), menuPage("files")}, true},
		{"link row", []contracts.MenuEntry{menuLink("link:docs1", "https://docs.example.test")}, true},
		{"relative link", []contracts.MenuEntry{menuLink("link:docs2", "/help/index")}, true},
		{"nested under page", []contracts.MenuEntry{menuPage("files"), func() contracts.MenuEntry { e := menuLink("link:docs3", "https://docs.example.test"); e.ParentKey = menuPtr("files"); return e }()}, true},
		{"nested under link", []contracts.MenuEntry{menuLink("link:docs4", "https://docs.example.test"), func() contracts.MenuEntry { e := menuLink("link:docs5", "/help"); e.ParentKey = menuPtr("link:docs4"); return e }()}, true},
		{"page row with url", []contracts.MenuEntry{func() contracts.MenuEntry { e := menuPage("notes"); e.Url = menuPtr("https://evil.test"); return e }()}, false},
		{"page takes link prefix", []contracts.MenuEntry{menuPage("link:pages")}, false},
		{"link misses prefix", []contracts.MenuEntry{menuLink("docs", "https://docs.example.test")}, false},
		{"bare prefix", []contracts.MenuEntry{menuLink("link:", "https://docs.example.test")}, false},
		{"link without url", []contracts.MenuEntry{func() contracts.MenuEntry { e := menuLink("link:docs6", "https://docs.example.test"); e.Url = nil; return e }()}, false},
		{"javascript url", []contracts.MenuEntry{menuLink("link:docs7", "javascript:alert(1)")}, false},
		{"protocol relative url", []contracts.MenuEntry{menuLink("link:docs8", "//evil.test/x")}, false},
		{"ftp url", []contracts.MenuEntry{menuLink("link:docs9", "ftp://files.example.test")}, false},
		{"url with control character", []contracts.MenuEntry{menuLink("link:docs10", "https://docs.example.test/\x0b")}, false},
		{"long link label", []contracts.MenuEntry{func() contracts.MenuEntry { e := menuLink("link:docs11", "https://docs.example.test"); e.Label = string(make([]rune, 65)); return e }()}, false},
		{"unknown type", []contracts.MenuEntry{func() contracts.MenuEntry { e := menuPage("notes"); e.Type = "widget"; return e }()}, false},
		{"missing parent", []contracts.MenuEntry{func() contracts.MenuEntry { e := menuPage("notes"); e.ParentKey = menuPtr("files"); return e }()}, false},
		{"self parent", []contracts.MenuEntry{func() contracts.MenuEntry { e := menuPage("notes"); e.ParentKey = menuPtr("notes"); return e }()}, false},
		{"duplicate keys", []contracts.MenuEntry{menuPage("notes"), menuPage("notes")}, false},
		{"two node cycle", []contracts.MenuEntry{
			func() contracts.MenuEntry { e := menuPage("a"); e.ParentKey = menuPtr("b"); return e }(),
			func() contracts.MenuEntry { e := menuPage("b"); e.ParentKey = menuPtr("a"); return e }(),
		}, false},
		{"depth five", func() []contracts.MenuEntry {
			items := []contracts.MenuEntry{menuPage("n1")}
			for i := 2; i <= 5; i++ {
				e := menuPage("n" + string(rune('0'+i)))
				e.ParentKey = menuPtr("n" + string(rune('0'+i-1)))
				items = append(items, e)
			}
			return items
		}(), true},
		{"depth six", func() []contracts.MenuEntry {
			items := []contracts.MenuEntry{menuPage("n1")}
			for i := 2; i <= 6; i++ {
				e := menuPage("n" + string(rune('0'+i)))
				e.ParentKey = menuPtr("n" + string(rune('0'+i-1)))
				items = append(items, e)
			}
			return items
		}(), false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateMenuTree(testCase.items)
			if testCase.valid && err != nil {
				t.Fatalf("valid tree refused: %v", err)
			}
			if !testCase.valid && err == nil {
				t.Fatal("invalid tree accepted")
			}
		})
	}
}

func TestMenuConfigStorage(t *testing.T) {
	ctx := context.Background()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "menus.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
		t.Fatal(err)
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.Exec(ctx, tx, "INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,?)", "web-platform", "menus-test", time.Now().Unix()); err != nil {
		t.Fatal(err)
	}
	hash, err := platform.HashPassword("test-password-strong")
	if err != nil {
		t.Fatal(err)
	}
	admins := &Repository{Store: store, Administrators: true}
	admin, err := admins.Seed(ctx, tx, contracts.UserCreate{Username: "admin", Email: "admin@example.test", Role: "super_admin"}, hash)
	if err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	repo := &Repository{Store: store}

	// A page override, a link row and a link nested under the page survive the
	// round trip with their type, parent and target intact.
	tree := []contracts.MenuEntry{menuPage("notes"), menuLink("link:docs", "https://docs.example.test/guide")}
	nested := menuLink("link:status", "/status")
	nested.ParentKey = menuPtr("notes")
	tree = append(tree, nested)
	saved, err := repo.SaveMenuConfig(ctx, tree, admin.ID)
	if err != nil {
		t.Fatal("save tree", err)
	}
	if len(saved.Items) != 3 {
		t.Fatal("saved rows", saved.Items)
	}
	for _, entry := range saved.Items {
		switch entry.MenuKey {
		case "notes":
			if entry.Type != "page" || entry.Url != nil || entry.ParentKey != nil {
				t.Fatal("page row echo", entry)
			}
		case "link:docs":
			if entry.Type != "link" || entry.Url == nil || *entry.Url != "https://docs.example.test/guide" {
				t.Fatal("link row echo", entry)
			}
		case "link:status":
			if entry.ParentKey == nil || *entry.ParentKey != "notes" {
				t.Fatal("nested link echo", entry)
			}
		default:
			t.Fatal("unknown row", entry)
		}
	}
	listed, err := repo.ListMenuConfig(ctx)
	if err != nil || len(listed.Items) != 3 {
		t.Fatal("list rows", listed, err)
	}

	// An invalid replacement is refused whole: the previous tree stays active.
	broken := []contracts.MenuEntry{menuPage("notes"), func() contracts.MenuEntry { e := menuPage("files"); e.ParentKey = menuPtr("link:docs"); return e }()}
	if _, err = repo.SaveMenuConfig(ctx, broken, admin.ID); err == nil {
		t.Fatal("dangling parent accepted")
	}
	if listed, err = repo.ListMenuConfig(ctx); err != nil || len(listed.Items) != 3 {
		t.Fatal("failed save mutated rows", listed, err)
	}

	// Deleting a link row means omitting it; its child must be dropped or
	// re-parented in the same save, otherwise the parent check refuses.
	next := []contracts.MenuEntry{menuPage("notes")}
	if _, err = repo.SaveMenuConfig(ctx, next, admin.ID); err != nil {
		t.Fatal("omit link row", err)
	}
	if listed, err = repo.ListMenuConfig(ctx); err != nil || len(listed.Items) != 1 || listed.Items[0].MenuKey != "notes" {
		t.Fatal("rows after omission", listed, err)
	}

	// Empty payload clears every row, including link rows.
	if _, err = repo.SaveMenuConfig(ctx, []contracts.MenuEntry{}, admin.ID); err != nil {
		t.Fatal("clear rows", err)
	}
	if listed, err = repo.ListMenuConfig(ctx); err != nil || len(listed.Items) != 0 {
		t.Fatal("rows after clear", listed, err)
	}
}
