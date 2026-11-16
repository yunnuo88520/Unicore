// Author: yunnuo <ymz@ebox.vip>
// Description: Capability metadata, risk declarations and constrained schema rules for the frozen registry.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Kind classifies a capability. P1 registers tools only; the policy and call
// storage keep the kind column so resources and prompts (P4) reuse the same
// authorization model instead of growing parallel tables.
type Kind string

const KindTool Kind = "tool"

// Effect is the developer's declared business impact of one invocation. It is
// a review input and an execution gate, never a substitute for real business
// checks inside the handler.
type Effect string

const (
	EffectRead        Effect = "read"
	EffectWrite       Effect = "write"
	EffectDestructive Effect = "destructive"
)

// Confirmation states whether a human approval flow must guard execution.
// P1 never executes writes, so only read effects run; the field stays part of
// the definition so P3 cannot silently loosen a registered risk declaration.
type Confirmation string

const (
	ConfirmationNone     Confirmation = "none"
	ConfirmationRequired Confirmation = "required"
)

// Principal is the server-authenticated caller behind one request. The
// platform adapter builds it from the resolved credential; user input can
// never override it. It carries identifiers only — never raw bearer
// credentials, cookies or refresh tokens.
type Principal interface {
	ActorID() string
	CredentialID() string
	RoleID() string
	// AuthMethod is the credential family, "pat" for P1.
	AuthMethod() string
	// AuthVersion identifies the caller's authorization state so directory
	// cursors and caches cannot outlive permission or policy changes.
	AuthVersion() string
}

// ToolHandler executes one registered capability for an authenticated
// principal. The returned value must marshal to JSON within the configured
// result budget and expose a business projection only — never database rows,
// secrets or download URLs. Errors should be *Error values; anything else is
// treated as an internal failure.
type ToolHandler interface {
	Call(ctx context.Context, principal Principal, arguments json.RawMessage) (any, error)
}

// ToolHandlerFunc adapts a function to ToolHandler.
type ToolHandlerFunc func(ctx context.Context, principal Principal, arguments json.RawMessage) (any, error)

func (f ToolHandlerFunc) Call(ctx context.Context, principal Principal, arguments json.RawMessage) (any, error) {
	return f(ctx, principal, arguments)
}

// ToolDefinition is one explicitly registered capability. Definitions come
// from assembled business modules; the admin surface governs open policies
// and can never rebind operations, downgrade risk or alter schemas.
type ToolDefinition struct {
	// Name follows "<module>.<action>" with stable ASCII characters; the
	// 2026-07-28 revision allows letters, digits, underscore, hyphen and dot.
	Name string
	// Module names the contributing module; the composition root only wires
	// contributors from modules that are actually assembled.
	Module string
	// Version is the developer-maintained capability version; behavior or
	// field changes must bump it, not just the display copy.
	Version string
	// ImplVersion is the explicit implementation revision folded into the
	// review fingerprint, so a changed handler invalidates prior approval.
	ImplVersion string
	TitleZh     string
	TitleEn     string
	// DescriptionZh/DescriptionEn are client-facing model descriptions; the
	// transport serves one by language preference instead of registering
	// two executors per language.
	DescriptionZh string
	DescriptionEn string
	// InputSchema is a constrained object schema; OutputSchema is optional
	// and constrains the structured result.
	InputSchema  json.RawMessage
	OutputSchema json.RawMessage
	// OperationIDs lists every business operation this capability may
	// exercise. All must exist, be grantable and not super-admin-only.
	OperationIDs []string
	Effect       Effect
	Confirmation Confirmation
	// Handler is required: a missing implementation cannot be simulated
	// away by registering and then hiding the capability.
	Handler ToolHandler
}

// maxToolNameLength is the design bound; the protocol revision allows 128.
const maxToolNameLength = 96

var (
	modulePattern  = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,63}$`)
	versionPattern = regexp.MustCompile(`^[0-9A-Za-z][0-9A-Za-z.\-]{0,31}$`)
	// namePattern enforces "<module>.<action>" with the ASCII alphabet the
	// 2026-07-28 revision allows: letters, digits, underscore, hyphen, dot.
	namePattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,63}\.[a-z0-9][a-z0-9_.\-]{0,94}$`)
)

// ValidateDefinition checks the structural contract of one definition except
// for duplicate names, which only the registry can observe. Operation checks
// run through the injected resolver so the core package never imports the
// platform catalogue directly.
func ValidateDefinition(def ToolDefinition, resolver OperationResolver) error {
	if !modulePattern.MatchString(def.Module) {
		return fmt.Errorf("module %q is not a valid module slug", def.Module)
	}
	module, _, _ := strings.Cut(def.Name, ".")
	if module != def.Module || !namePattern.MatchString(def.Name) || len(def.Name) > maxToolNameLength {
		return fmt.Errorf("tool name %q must be \"<module>.<action>\" within %d ASCII characters", def.Name, maxToolNameLength)
	}
	if !versionPattern.MatchString(def.Version) {
		return fmt.Errorf("tool %q version %q is invalid", def.Name, def.Version)
	}
	if !versionPattern.MatchString(def.ImplVersion) {
		return fmt.Errorf("tool %q implementation version %q is invalid", def.Name, def.ImplVersion)
	}
	if strings.TrimSpace(def.TitleZh) == "" || strings.TrimSpace(def.TitleEn) == "" {
		return fmt.Errorf("tool %q needs bilingual titles", def.Name)
	}
	if len([]rune(def.TitleZh)) > 120 || len([]rune(def.TitleEn)) > 120 {
		return fmt.Errorf("tool %q titles exceed 120 characters", def.Name)
	}
	if strings.TrimSpace(def.DescriptionZh) == "" || strings.TrimSpace(def.DescriptionEn) == "" {
		return fmt.Errorf("tool %q needs bilingual client descriptions", def.Name)
	}
	if len([]rune(def.DescriptionZh)) > 2000 || len([]rune(def.DescriptionEn)) > 2000 {
		return fmt.Errorf("tool %q descriptions exceed 2000 characters", def.Name)
	}
	if def.Handler == nil {
		return fmt.Errorf("tool %q has no handler implementation", def.Name)
	}
	switch def.Effect {
	case EffectRead, EffectWrite, EffectDestructive:
	default:
		return fmt.Errorf("tool %q declares unknown effect %q", def.Name, def.Effect)
	}
	switch def.Confirmation {
	case ConfirmationNone, ConfirmationRequired:
	default:
		return fmt.Errorf("tool %q declares unknown confirmation %q", def.Name, def.Confirmation)
	}
	if def.Effect == EffectDestructive && def.Confirmation != ConfirmationRequired {
		return fmt.Errorf("tool %q is destructive and requires confirmation", def.Name)
	}
	if len(def.OperationIDs) == 0 {
		return fmt.Errorf("tool %q must bind at least one business operation", def.Name)
	}
	seen := map[string]bool{}
	for _, id := range def.OperationIDs {
		if seen[id] {
			return fmt.Errorf("tool %q binds operation %q twice", def.Name, id)
		}
		seen[id] = true
		info, ok := resolver.LookupOperation(id)
		if !ok {
			return fmt.Errorf("tool %q binds unknown operation %q", def.Name, id)
		}
		if !info.Grantable || info.SuperAdmin {
			return fmt.Errorf("tool %q binds operation %q which is not delegable business surface", def.Name, id)
		}
	}
	if err := validateSchema(def.InputSchema, true, 0); err != nil {
		return fmt.Errorf("tool %q input schema: %w", def.Name, err)
	}
	if len(def.OutputSchema) > 0 {
		if err := validateSchema(def.OutputSchema, true, 0); err != nil {
			return fmt.Errorf("tool %q output schema: %w", def.Name, err)
		}
	}
	return nil
}

// schemaPropertyBudget bounds one schema node so inputs cannot smuggle
// unbounded strings, arrays or nested objects past validation.
const (
	schemaMaxDepth        = 3
	schemaMaxStringLength = 16384
	schemaMaxItems        = 1000
	schemaMaxEnumValues   = 32
)

// schemaAllowedKeys is the fail-closed keyword whitelist. Unknown keywords
// are rejected: validation must understand every construct it permits.
var schemaAllowedKeys = map[string]bool{
	"type": true, "properties": true, "required": true, "additionalProperties": true,
	"items": true, "maxLength": true, "minLength": true, "minimum": true, "maximum": true,
	"minItems": true, "maxItems": true, "enum": true, "description": true, "default": true,
}

// validateSchema enforces one constrained schema node. The top level of an
// input schema must be an object; nested nodes follow the same property
// budget with a depth limit. Array item schemas and nested objects recurse.
func validateSchema(raw json.RawMessage, objectTop bool, depth int) error {
	if depth > schemaMaxDepth {
		return fmt.Errorf("schema nesting exceeds depth %d", schemaMaxDepth)
	}
	if len(raw) == 0 {
		return fmt.Errorf("schema is empty")
	}
	var node map[string]any
	if err := json.Unmarshal(raw, &node); err != nil {
		return fmt.Errorf("schema is not valid JSON: %w", err)
	}
	for key := range node {
		if !schemaAllowedKeys[key] {
			return fmt.Errorf("schema keyword %q is not allowed", key)
		}
	}
	typeValue, _, err := schemaString(node, "type")
	if err != nil {
		return err
	}
	if objectTop && typeValue != "object" {
		return fmt.Errorf("top-level schema must have type \"object\", got %q", typeValue)
	}
	switch typeValue {
	case "object":
		properties, ok := node["properties"].(map[string]any)
		if !ok {
			return fmt.Errorf("object schema requires a properties map")
		}
		if strict, ok := node["additionalProperties"]; !ok || strict != false {
			return fmt.Errorf("object schema must set additionalProperties to false")
		}
		if len(properties) > 64 {
			return fmt.Errorf("object schema exceeds 64 properties")
		}
		required, _ := node["required"].([]any)
		if len(required) > len(properties) {
			return fmt.Errorf("required list exceeds declared properties")
		}
		known := map[string]bool{}
		for name := range properties {
			if name == "" || len(name) > 64 || strings.ContainsAny(name, " \t\r\n\x00") {
				return fmt.Errorf("property name %q is invalid", name)
			}
			known[name] = true
			property, err := json.Marshal(properties[name])
			if err != nil {
				return fmt.Errorf("property %q is not valid JSON", name)
			}
			if err := validateSchema(property, false, depth+1); err != nil {
				return fmt.Errorf("property %q: %w", name, err)
			}
		}
		for _, entry := range required {
			name, ok := entry.(string)
			if !ok || !known[name] {
				return fmt.Errorf("required entry %q is not a declared property", name)
			}
		}
	case "string":
		maxLength, ok := node["maxLength"].(float64)
		if !ok || maxLength < 1 || maxLength > schemaMaxStringLength {
			return fmt.Errorf("string schema requires maxLength between 1 and %d", schemaMaxStringLength)
		}
		if minLength, ok := node["minLength"].(float64); ok && (minLength < 0 || minLength > maxLength) {
			return fmt.Errorf("string minLength must be within [0, maxLength]")
		}
		if values, ok := node["enum"].([]any); ok {
			if len(values) == 0 || len(values) > schemaMaxEnumValues {
				return fmt.Errorf("string enum must list 1 to %d values", schemaMaxEnumValues)
			}
			for _, value := range values {
				text, ok := value.(string)
				if !ok || float64(len(text)) > maxLength {
					return fmt.Errorf("string enum values must be strings within maxLength")
				}
			}
		}
	case "integer", "number":
		maximum, ok := node["maximum"].(float64)
		if !ok {
			return fmt.Errorf("%s schema requires a maximum bound", typeValue)
		}
		if minimum, ok := node["minimum"].(float64); ok && minimum > maximum {
			return fmt.Errorf("%s minimum exceeds maximum", typeValue)
		}
	case "boolean":
		// Fully constrained by type.
	case "array":
		maxItems, ok := node["maxItems"].(float64)
		if !ok || maxItems < 1 || maxItems > schemaMaxItems {
			return fmt.Errorf("array schema requires maxItems between 1 and %d", schemaMaxItems)
		}
		if minItems, ok := node["minItems"].(float64); ok && (minItems < 0 || minItems > maxItems) {
			return fmt.Errorf("array minItems must be within [0, maxItems]")
		}
		items, err := json.Marshal(node["items"])
		if err != nil || node["items"] == nil {
			return fmt.Errorf("array schema requires an items schema")
		}
		if err := validateSchema(items, false, depth+1); err != nil {
			return fmt.Errorf("array items: %w", err)
		}
	default:
		return fmt.Errorf("schema type %q is not allowed", typeValue)
	}
	return nil
}

func schemaString(node map[string]any, key string) (string, bool, error) {
	value, ok := node[key].(string)
	if !ok || value == "" {
		return "", false, fmt.Errorf("schema keyword %q must be a non-empty string", key)
	}
	return value, true, nil
}
