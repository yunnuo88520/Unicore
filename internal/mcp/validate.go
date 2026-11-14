// Author: yunnuo <ymz@ebox.vip>
// Description: Runtime validation of tool arguments and results against the constrained capability schema.
package mcp

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

// validateInstance checks one JSON value against a constrained schema node
// before execution. It mirrors the registration-time keyword budget, so a
// schema that passed ValidateDefinition cannot admit values the runtime
// cannot bound. Unknown fields fail closed.
func validateInstance(raw json.RawMessage, schema json.RawMessage) error {
	var node map[string]any
	if err := json.Unmarshal(schema, &node); err != nil {
		return fmt.Errorf("capability schema is invalid")
	}
	var value any
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		return fmt.Errorf("arguments are not valid JSON")
	}
	if decoder.More() {
		return fmt.Errorf("arguments must be a single JSON value")
	}
	return validateValue(value, node, 0)
}

func validateValue(value any, node map[string]any, depth int) error {
	if depth > schemaMaxDepth+1 {
		return fmt.Errorf("arguments nest too deeply")
	}
	typeValue, _, _ := schemaString(node, "type")
	switch typeValue {
	case "object":
		object, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("expected an object")
		}
		properties, _ := node["properties"].(map[string]any)
		for name := range object {
			if _, declared := properties[name]; !declared {
				return fmt.Errorf("unknown field %q", name)
			}
		}
		for _, entry := range requiredOf(node) {
			if _, present := object[entry]; !present {
				return fmt.Errorf("missing required field %q", entry)
			}
		}
		for name, rawProperty := range properties {
			present, hasValue := object[name]
			if !hasValue {
				continue
			}
			property, ok := rawProperty.(map[string]any)
			if !ok {
				return fmt.Errorf("field %q has an invalid schema", name)
			}
			if err := validateValue(present, property, depth+1); err != nil {
				return fmt.Errorf("field %q: %w", name, err)
			}
		}
	case "array":
		items, ok := value.([]any)
		if !ok {
			return fmt.Errorf("expected an array")
		}
		if maxItems, ok := node["maxItems"].(float64); ok && len(items) > int(maxItems) {
			return fmt.Errorf("array exceeds %d items", int(maxItems))
		}
		if minItems, ok := node["minItems"].(float64); ok && len(items) < int(minItems) {
			return fmt.Errorf("array needs at least %d items", int(minItems))
		}
		itemSchema, ok := node["items"].(map[string]any)
		if !ok {
			return fmt.Errorf("array items are not schema-constrained")
		}
		for index, item := range items {
			if err := validateValue(item, itemSchema, depth+1); err != nil {
				return fmt.Errorf("item %d: %w", index, err)
			}
		}
	case "string":
		text, ok := value.(string)
		if !ok {
			return fmt.Errorf("expected a string")
		}
		if maxLength, ok := node["maxLength"].(float64); ok && utf8Length(text) > int(maxLength) {
			return fmt.Errorf("string exceeds %d characters", int(maxLength))
		}
		if minLength, ok := node["minLength"].(float64); ok && utf8Length(text) < int(minLength) {
			return fmt.Errorf("string is shorter than %d characters", int(minLength))
		}
		if values, ok := node["enum"].([]any); ok && len(values) > 0 {
			allowed := false
			for _, candidate := range values {
				if candidate == text {
					allowed = true
					break
				}
			}
			if !allowed {
				return fmt.Errorf("value is not one of the allowed choices")
			}
		}
	case "integer":
		number, ok := value.(json.Number)
		if !ok {
			return fmt.Errorf("expected an integer")
		}
		parsed, err := number.Float64()
		if err != nil || parsed != math.Trunc(parsed) {
			return fmt.Errorf("expected an integer")
		}
		return checkBounds(node, parsed)
	case "number":
		number, ok := value.(json.Number)
		if !ok {
			return fmt.Errorf("expected a number")
		}
		parsed, err := number.Float64()
		if err != nil {
			return fmt.Errorf("expected a number")
		}
		return checkBounds(node, parsed)
	case "boolean":
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("expected a boolean")
		}
	default:
		return fmt.Errorf("unsupported schema type %q", typeValue)
	}
	return nil
}

func checkBounds(node map[string]any, value float64) error {
	if maximum, ok := node["maximum"].(float64); ok && value > maximum {
		return fmt.Errorf("value exceeds the maximum of %g", maximum)
	}
	if minimum, ok := node["minimum"].(float64); ok && value < minimum {
		return fmt.Errorf("value is below the minimum of %g", minimum)
	}
	return nil
}

func requiredOf(node map[string]any) []string {
	entries, _ := node["required"].([]any)
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if name, ok := entry.(string); ok {
			names = append(names, name)
		}
	}
	return names
}

func utf8Length(text string) int {
	count := 0
	for range text {
		count++
	}
	return count
}
