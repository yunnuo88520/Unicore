// Author: yunnuo <ymz@ebox.vip>
// Description: Registry validation and fingerprint determinism tests for the capability base.
package mcp

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

type stubResolver struct{ known map[string]OperationInfo }

func (s stubResolver) LookupOperation(id string) (OperationInfo, bool) {
	info, ok := s.known[id]
	return info, ok
}

func testResolver() stubResolver {
	return stubResolver{known: map[string]OperationInfo{
		"listNotes":  {Grantable: true},
		"readNote":   {Grantable: true},
		"superOnly":  {Grantable: true, SuperAdmin: true},
		"notGrantable": {Grantable: false},
	}}
}

func validDefinition() ToolDefinition {
	return ToolDefinition{
		Name: "notes.search", Module: "notes", Version: "1.0", ImplVersion: "1",
		TitleZh: "搜索笔记", TitleEn: "Search notes",
		DescriptionZh: "按关键字搜索当前用户可见的笔记", DescriptionEn: "Search notes visible to the caller",
		InputSchema: json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"search":{"type":"string","maxLength":128},"page":{"type":"integer","minimum":1,"maximum":1000}},"required":["search"]}`),
		OutputSchema: json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"total":{"type":"integer","maximum":1000000}}}`),
		OperationIDs: []string{"listNotes"}, Effect: EffectRead, Confirmation: ConfirmationNone,
		Handler: ToolHandlerFunc(func(context.Context, Principal, json.RawMessage) (any, error) { return map[string]any{}, nil }),
	}
}

func TestRegistryAcceptsValidDefinition(t *testing.T) {
	registry := NewRegistry()
	if err := registry.Register(validDefinition(), testResolver()); err != nil {
		t.Fatalf("valid definition rejected: %v", err)
	}
	if registry.Count() != 1 {
		t.Fatalf("registry holds %d tools, want 1", registry.Count())
	}
	if _, ok := registry.Lookup("notes.search"); !ok {
		t.Fatal("registered tool is not found by name")
	}
}

func TestRegistryRejections(t *testing.T) {
	resolver := testResolver()
	// A duplicate name only fails on the second registration into the same registry.
	duplicated := NewRegistry()
	if err := duplicated.Register(validDefinition(), resolver); err != nil {
		t.Fatalf("first registration rejected: %v", err)
	}
	if err := duplicated.Register(validDefinition(), resolver); err == nil {
		t.Error("duplicate name: expected rejection, got none")
	}
	cases := map[string]func(*ToolDefinition){
		"unknown operation":    func(d *ToolDefinition) { d.OperationIDs = []string{"missing"} },
		"super-admin operation": func(d *ToolDefinition) { d.OperationIDs = []string{"superOnly"} },
		"non-grantable operation": func(d *ToolDefinition) { d.OperationIDs = []string{"notGrantable"} },
		"empty operations":     func(d *ToolDefinition) { d.OperationIDs = nil },
		"nil handler":          func(d *ToolDefinition) { d.Handler = nil },
		"destructive without confirmation": func(d *ToolDefinition) {
			d.Effect = EffectDestructive
			d.Confirmation = ConfirmationNone
		},
		"unknown effect":         func(d *ToolDefinition) { d.Effect = Effect("explode") },
		"missing bilingual copy": func(d *ToolDefinition) { d.DescriptionEn = "" },
		"name outside module":    func(d *ToolDefinition) { d.Name = "orders.search" },
		"name with spaces":       func(d *ToolDefinition) { d.Name = "notes.search item" },
		"name too long":          func(d *ToolDefinition) { d.Name = "notes." + strings.Repeat("a", 100) },
		"bad version":            func(d *ToolDefinition) { d.Version = "v 1" },
		"schema not object":      func(d *ToolDefinition) { d.InputSchema = json.RawMessage(`{"type":"string","maxLength":10}`) },
		"schema permissive object": func(d *ToolDefinition) {
			d.InputSchema = json.RawMessage(`{"type":"object","properties":{}}`)
		},
		"schema unbounded string": func(d *ToolDefinition) {
			d.InputSchema = json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"search":{"type":"string"}}}`)
		},
		"schema array without maxItems": func(d *ToolDefinition) {
			d.InputSchema = json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"ids":{"type":"array","items":{"type":"string","maxLength":8}}}}`)
		},
		"schema unknown keyword": func(d *ToolDefinition) {
			d.InputSchema = json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{},"patternProperties":{"^x$":{}}}`)
		},
		"schema unknown required": func(d *ToolDefinition) {
			d.InputSchema = json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{},"required":["ghost"]}`)
		},
	}
	for name, mutate := range cases {
		registry := NewRegistry()
		def := validDefinition()
		mutate(&def)
		if err := registry.Register(def, resolver); err == nil {
			t.Errorf("%s: expected rejection, got none", name)
		}
	}
}

func TestRegistryFreezeAndOrdering(t *testing.T) {
	registry := NewRegistry()
	resolver := testResolver()
	second := validDefinition()
	second.Name, second.Module = "notes.read", "notes"
	second.OperationIDs = []string{"readNote"}
	if err := registry.Register(second, resolver); err != nil {
		t.Fatalf("second definition rejected: %v", err)
	}
	if err := registry.Register(validDefinition(), resolver); err != nil {
		t.Fatalf("first definition rejected: %v", err)
	}
	if err := registry.Freeze(); err != nil {
		t.Fatalf("freeze failed: %v", err)
	}
	if err := registry.Freeze(); err != nil {
		t.Fatalf("second freeze failed: %v", err)
	}
	late := validDefinition()
	late.Name, late.Module = "notes.extra", "notes"
	if err := registry.Register(late, resolver); err == nil {
		t.Fatal("registration after freeze unexpectedly succeeded")
	}
	tools := registry.Tools()
	if len(tools) != 2 || tools[0].Name != "notes.read" || tools[1].Name != "notes.search" {
		t.Fatalf("registry order is %v, want deterministic name order", []string{tools[0].Name, tools[1].Name})
	}
	tools[0].Version = "mutated"
	fresh, _ := registry.Lookup("notes.read")
	if fresh.Version == "mutated" {
		t.Fatal("Tools() returned the internal storage by reference")
	}
}

func TestFingerprintDeterminism(t *testing.T) {
	resolver := testResolver()
	def := validDefinition()
	if err := NewRegistry().Register(def, resolver); err != nil {
		t.Fatalf("definition rejected: %v", err)
	}
	baseline, err := Fingerprint(def)
	if err != nil {
		t.Fatalf("fingerprint failed: %v", err)
	}
	// Whitespace and key order of the source schema must not matter.
	reordered := validDefinition()
	reordered.InputSchema = json.RawMessage(`{"required":["search"],"properties":{"page":{"maximum":1000,"minimum":1,"type":"integer"},"search":{"maxLength":128,"type":"string"}},"additionalProperties":false,"type":"object"}`)
	reorderedFingerprint, err := Fingerprint(reordered)
	if err != nil {
		t.Fatalf("reordered fingerprint failed: %v", err)
	}
	if reorderedFingerprint != baseline {
		t.Fatal("fingerprint changed for a semantically identical schema")
	}
	// Copy changes must not move the fingerprint; behavior changes must.
	copied := validDefinition()
	copied.TitleEn = "Search personal notes"
	copiedFingerprint, _ := Fingerprint(copied)
	if copiedFingerprint != baseline {
		t.Fatal("fingerprint moved for a copy-only change")
	}
	for name, mutate := range map[string]func(*ToolDefinition){
		"schema":     func(d *ToolDefinition) { d.InputSchema = json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"query":{"type":"string","maxLength":64}}}`) },
		"operations": func(d *ToolDefinition) { d.OperationIDs = []string{"readNote"} },
		"effect":     func(d *ToolDefinition) { d.Effect = EffectWrite },
		"version":    func(d *ToolDefinition) { d.Version = "2.0" },
		"impl":       func(d *ToolDefinition) { d.ImplVersion = "2" },
	} {
		changed := validDefinition()
		mutate(&changed)
		if changed.OperationIDs != nil && name == "operations" && changed.OperationIDs[0] == "readNote" {
			changed.Handler = ToolHandlerFunc(func(context.Context, Principal, json.RawMessage) (any, error) { return nil, nil })
		}
		fingerprint, err := Fingerprint(changed)
		if err != nil {
			t.Fatalf("%s fingerprint failed: %v", name, err)
		}
		if fingerprint == baseline {
			t.Errorf("fingerprint did not change for %s", name)
		}
	}
}
