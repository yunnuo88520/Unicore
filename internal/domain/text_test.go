// Author: yunnuo <ymz@ebox.vip>
// Description: Verify Unicode, byte limits and line semantics independently of transports.
package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestAnalyze(t *testing.T) {
	for _, tc := range []struct {
		name, text                 string
		chars, words, lines, bytes int
	}{
		{"ascii", "hello world", 11, 2, 1, 11},
		{"unicode", "你好 Go 👋", 7, 3, 1, 14},
		{"line endings", "a\r\nb\rc\n", 7, 3, 4, 7},
		{"boundary", strings.Repeat("a", MaxTextBytes), MaxTextBytes, 1, 1, MaxTextBytes},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Analyze(tc.text)
			if err != nil {
				t.Fatal(err)
			}
			if got.Characters != tc.chars || got.Words != tc.words || got.Lines != tc.lines || got.Bytes != tc.bytes {
				t.Fatalf("unexpected analysis: %+v", got)
			}
		})
	}
	got, _ := Analyze("hello world")
	if got.SHA256 != "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9" {
		t.Fatal("digest must match original bytes")
	}
}

func TestInvalidText(t *testing.T) {
	for _, input := range []string{"", " \n\t", string([]byte{0xff}), strings.Repeat("a", MaxTextBytes+1), strings.Repeat("你", MaxTextBytes/3+1)} {
		if _, err := Analyze(input); !errors.Is(err, ErrInvalidText) {
			t.Fatalf("expected invalid text, got %v", err)
		}
	}
}
