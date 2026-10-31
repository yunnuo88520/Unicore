// Author: yunnuo <ymz@ebox.vip>
// Description: Shared Go/TypeScript boundary vectors detect runtime validation drift.
package apispec

import (
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"
)

func TestSharedValidationCases(t *testing.T) {
	data, err := os.ReadFile("validation-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name, Schema string
		Value        json.RawMessage
		Fields       []string
		RepeatText   int
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			if tc.RepeatText > 0 {
				var value map[string]string
				_ = json.Unmarshal(tc.Value, &value)
				value["text"] = strings.Repeat(value["text"], tc.RepeatText)
				tc.Value, _ = json.Marshal(value)
			}
			actual := []string{}
			for field := range ValidateJSON(tc.Schema, tc.Value) {
				actual = append(actual, field)
			}
			slices.Sort(actual)
			slices.Sort(tc.Fields)
			if !slices.Equal(actual, tc.Fields) {
				t.Fatalf("got %v want %v", actual, tc.Fields)
			}
		})
	}
	if len(ValidateJSON("ExecuteInput", []byte(`{"text":"ok"} {}`))) == 0 {
		t.Fatal("accepted trailing JSON")
	}
}
