// Author: yunnuo <ymz@ebox.vip>
// Description: Business module registry: metadata, permissions, navigation, executors and assembly state in one place.
package module

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"sort"
	"sync"

	"github.com/yunnuo/unicore/internal/contracts"
)

//go:embed manifest.json
var manifestFS embed.FS

// manifestEntry is one declared module; entries without an edition are part
// of every build, entries with one assemble only when that tag is set.
type manifestEntry struct {
	Slug    string `json:"slug"`
	Edition string `json:"edition"`
	Title   string `json:"title"`
}

var manifest = func() map[string]manifestEntry {
	data, err := manifestFS.ReadFile("manifest.json")
	if err != nil {
		panic(fmt.Sprintf("module manifest unavailable: %v", err))
	}
	var parsed struct {
		Modules []manifestEntry `json:"modules"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		panic(fmt.Sprintf("module manifest invalid: %v", err))
	}
	entries := map[string]manifestEntry{}
	for _, entry := range parsed.Modules {
		if entry.Slug == "" {
			panic("module manifest contains an empty slug")
		}
		if _, ok := entries[entry.Slug]; ok {
			panic(fmt.Sprintf("module manifest lists %q twice", entry.Slug))
		}
		entries[entry.Slug] = entry
	}
	return entries
}()

// Manifest returns the declared modules in manifest order, for build tooling mirrors.
func Manifest() []manifestEntry {
	order := make([]manifestEntry, 0, len(manifest))
	for _, entry := range manifestOrder {
		order = append(order, entry)
	}
	return order
}

var manifestOrder = func() []manifestEntry {
	data, _ := manifestFS.ReadFile("manifest.json")
	var parsed struct {
		Modules []manifestEntry `json:"modules"`
	}
	_ = json.Unmarshal(data, &parsed)
	return parsed.Modules
}()

// Executor is a named function a custom scheduled task may reference.
type Executor struct {
	Key         string
	Description string
	Fn          func(context.Context) error
}

// Module is one self-contained business unit living under internal/modules/<slug>.
// Metadata (permissions, navigation) aggregates into the platform registries;
// assembly hooks (HTTP mount, desktop bridge) register with their own adapters.
type Module struct {
	Slug        string
	Title       string
	Description string
	Icon        string
	// Order sorts the module pages after the built-in defaults in shared navigation.
	Order       int
	Permissions []contracts.PermissionDefinition
	Navigation  []contracts.NavigationPage
	Executors   []Executor
	// Migrations is the module.<slug> namespace that must exist in migrations/catalog.json.
	Migrations string
	// Edition names the Go build tag controlling assembly; empty means always assembled.
	Edition string
	// Enabled reflects the edition tag; assemble_on/off files set it explicitly.
	Enabled bool
}

var (
	mu      sync.Mutex
	modules = map[string]Module{}
)

// Register adds a module; the slug must be declared in manifest.json and must
// not be registered twice. Registration happens from composition roots only.
func Register(items ...Module) {
	mu.Lock()
	defer mu.Unlock()
	for _, item := range items {
		entry, ok := manifest[item.Slug]
		if !ok {
			panic(fmt.Sprintf("module %q is not declared in internal/module/manifest.json", item.Slug))
		}
		if item.Edition != entry.Edition {
			panic(fmt.Sprintf("module %q declares edition %q but the manifest pins %q", item.Slug, item.Edition, entry.Edition))
		}
		if _, exists := modules[item.Slug]; exists {
			// Idempotent: composition roots and test fixtures may both register.
			continue
		}
		if item.Title == "" {
			item.Title = entry.Title
		}
		modules[item.Slug] = item
	}
}

// All returns the registered modules sorted by slug for stable aggregation.
func All() []Module {
	mu.Lock()
	defer mu.Unlock()
	items := make([]Module, 0, len(modules))
	for _, item := range modules {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Slug < items[j].Slug })
	return items
}

// Permissions aggregates module permission points for the platform catalog.
func Permissions() []contracts.PermissionDefinition {
	mu.Lock()
	defer mu.Unlock()
	items := []contracts.PermissionDefinition{}
	for _, item := range sorted() {
		items = append(items, item.Permissions...)
	}
	return items
}

// NavigationPages aggregates module navigation contributions.
func NavigationPages() []contracts.NavigationPage {
	mu.Lock()
	defer mu.Unlock()
	items := []contracts.NavigationPage{}
	for _, item := range sorted() {
		items = append(items, item.Navigation...)
	}
	return items
}

// FindExecutor resolves a module-provided task executor by key.
func FindExecutor(key string) (Executor, bool) {
	mu.Lock()
	defer mu.Unlock()
	for _, item := range modules {
		for _, executor := range item.Executors {
			if executor.Key == key {
				return executor, true
			}
		}
	}
	return Executor{}, false
}

func sorted() []Module {
	items := make([]Module, 0, len(modules))
	for _, item := range modules {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Slug < items[j].Slug })
	return items
}
