// Author: yunnuo <ymz@ebox.vip>
// Description: Deterministic capability fingerprint that gates re-review of open policies.
package mcp

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
)

// Fingerprint covers every behavior-relevant fact of a capability: kind,
// name, version, the deterministic representation of both schemas, the
// operation set, effect, confirmation requirement and the explicit
// implementation version. Display language, titles, translations and Go
// pointer identity are excluded on purpose: copy edits do not invalidate a
// review, behavior edits do.
func Fingerprint(def ToolDefinition) (string, error) {
	input, err := canonicalJSON(def.InputSchema)
	if err != nil {
		return "", fmt.Errorf("canonicalize input schema: %w", err)
	}
	output, err := canonicalJSON(def.OutputSchema)
	if err != nil {
		return "", fmt.Errorf("canonicalize output schema: %w", err)
	}
	operations := append([]string(nil), def.OperationIDs...)
	sort.Strings(operations)
	payload := struct {
		Kind          Kind
		Name          string
		Version       string
		ImplVersion   string
		InputSchema   json.RawMessage
		OutputSchema  json.RawMessage
		OperationIDs  []string
		Effect        Effect
		Confirmation  Confirmation
	}{Kind: KindTool, Name: def.Name, Version: def.Version, ImplVersion: def.ImplVersion, InputSchema: input, OutputSchema: output, OperationIDs: operations, Effect: def.Effect, Confirmation: def.Confirmation}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode fingerprint payload: %w", err)
	}
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:]), nil
}

// canonicalJSON normalizes raw JSON so key order and whitespace of the
// source literal cannot change the fingerprint. Empty input normalizes to
// null so an absent output schema is stable.
func canonicalJSON(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return json.RawMessage("null"), nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	normalized, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return normalized, nil
}
