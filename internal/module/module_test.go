// Author: yunnuo <ymz@ebox.vip>
// Description: Registration guards, manifest gating and stable aggregation of module metadata.
package module

import (
	"context"
	"errors"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
)

func reset(t *testing.T) {
	t.Helper()
	original := map[string]Module{}
	for slug, item := range modules {
		original[slug] = item
	}
	t.Cleanup(func() {
		mu.Lock()
		modules = original
		mu.Unlock()
	})
	mu.Lock()
	modules = map[string]Module{}
	mu.Unlock()
}

func sample(slug string) Module {
	return Module{
		Slug: slug, Title: "标题", Icon: "NotebookPen", Enabled: true,
		Permissions: []contracts.PermissionDefinition{{ID: slug + ":access", Name: "访问", Group: "业务权限", Assignable: true}},
		Navigation:  []contracts.NavigationPage{{ID: slug, Surfaces: []string{"user"}, Permission: slug + ":access"}},
		Executors:   []Executor{{Key: slug + ".tick", Description: "演示", Fn: func(context.Context) error { return nil }}},
	}
}

func TestRegisterAndAggregate(t *testing.T) {
	reset(t)
	// Aggregate over injected modules; Register's manifest gate is covered below.
	mu.Lock()
	modules["zeta"] = sample("zeta")
	modules["alpha"] = Module{Slug: "alpha"}
	mu.Unlock()
	items := All()
	if len(items) != 2 || items[0].Slug != "alpha" || items[1].Slug != "zeta" {
		t.Fatalf("unstable order: %v", items)
	}
	permissions := Permissions()
	if len(permissions) != 1 || permissions[0].ID != "zeta:access" {
		t.Fatalf("permission aggregation: %v", permissions)
	}
	pages := NavigationPages()
	if len(pages) != 1 || pages[0].ID != "zeta" {
		t.Fatalf("navigation aggregation: %v", pages)
	}
	executor, ok := FindExecutor("zeta.tick")
	if !ok || executor.Key != "zeta.tick" {
		t.Fatalf("executor lookup: %v %v", executor, ok)
	}
	if _, ok = FindExecutor("missing.tick"); ok {
		t.Fatal("unknown executor resolved")
	}
}

func TestRegisterGuards(t *testing.T) {
	reset(t)
	item := sample("notes")
	item.Edition = "notes"
	Register(item)
	// Duplicate registration is idempotent, so fixture setups stay composable.
	Register(Module{Slug: "notes", Edition: "notes", Title: "我的笔记"})
	if items := All(); len(items) != 1 || items[0].Title != "标题" {
		t.Fatalf("duplicate registration changed state: %v", items)
	}
}

func TestRegisterRequiresManifest(t *testing.T) {
	reset(t)
	defer func() {
		if recovered := recover(); recovered == nil {
			t.Fatal("undeclared slug accepted")
		}
	}()
	Register(sample("license"))
}

func TestRegisterEditionMustMatchManifest(t *testing.T) {
	reset(t)
	defer func() {
		if recovered := recover(); recovered == nil {
			t.Fatal("edition mismatch accepted")
		}
	}()
	Register(Module{Slug: "notes", Edition: "wrong"})
}

func TestManifestDeclarations(t *testing.T) {
	if _, ok := manifest["notes"]; !ok {
		t.Fatal("reference module notes missing from manifest")
	}
	for slug, entry := range manifest {
		if slug != entry.Slug {
			t.Fatalf("manifest key mismatch: %q vs %q", slug, entry.Slug)
		}
	}
	if len(Manifest()) == 0 {
		t.Fatal("manifest order view is empty")
	}
	_ = errors.Is
}
