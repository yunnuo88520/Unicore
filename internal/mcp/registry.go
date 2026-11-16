// Author: yunnuo <ymz@ebox.vip>
// Description: Immutable capability registry: structural validation, duplicate rejection and deterministic ordering.
package mcp

import (
	"fmt"
	"sort"
	"sync"
)

// Registry holds the capability definitions contributed by assembled
// business modules. The composition root registers every contributor, then
// freezes the registry before the transport starts serving; after Freeze the
// set is immutable and any late registration fails.
type Registry struct {
	mu           sync.RWMutex
	tools        map[string]ToolDefinition
	fingerprints map[string]string
	frozen       bool
}

func NewRegistry() *Registry {
	return &Registry{tools: map[string]ToolDefinition{}, fingerprints: map[string]string{}}
}

// Register validates one definition and stores it. Duplicate names, unknown
// operations, super-admin bindings and missing handlers fail here so a bad
// contribution fails startup instead of serving a broken capability.
func (r *Registry) Register(def ToolDefinition, resolver OperationResolver) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.frozen {
		return fmt.Errorf("registry is frozen; tool %q cannot register", def.Name)
	}
	if _, exists := r.tools[def.Name]; exists {
		return fmt.Errorf("tool %q is registered twice", def.Name)
	}
	if err := ValidateDefinition(def, resolver); err != nil {
		return err
	}
	fingerprint, err := Fingerprint(def)
	if err != nil {
		return fmt.Errorf("tool %q fingerprint: %w", def.Name, err)
	}
	r.tools[def.Name] = def
	r.fingerprints[def.Name] = fingerprint
	return nil
}

// Freeze seals the registry for serving. Freeze is idempotent.
func (r *Registry) Freeze() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.frozen = true
	return nil
}

// Lookup returns one frozen definition. Reads are safe concurrently with
// Freeze because entries are written before freezing and never mutated.
func (r *Registry) Lookup(name string) (ToolDefinition, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	def, ok := r.tools[name]
	return def, ok
}

// Tools returns the definitions sorted by stable name. The slice is a copy;
// callers must not mutate definitions.
func (r *Registry) Tools() []ToolDefinition {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]ToolDefinition, 0, len(r.tools))
	for _, def := range r.tools {
		items = append(items, def)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
	return items
}

// Count reports the registered tool count.
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.tools)
}

// Fingerprint returns the review fingerprint captured at registration time.
func (r *Registry) Fingerprint(name string) (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	fingerprint, ok := r.fingerprints[name]
	return fingerprint, ok
}
