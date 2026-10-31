// Author: yunnuo <ymz@ebox.vip>
// Description: Framework-independent UTF-8 text analysis rules.
package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"unicode/utf8"
)

const MaxTextBytes = 65536

var ErrInvalidText = errors.New("text must be non-blank UTF-8 and at most 65536 bytes")

type Analysis struct {
	Characters int
	Words      int
	Lines      int
	Bytes      int
	SHA256     string
}

// Analyze counts Unicode code points and whitespace-separated fields. The digest
// covers the original bytes; only line counting normalizes CRLF and CR.
func Analyze(text string) (Analysis, error) {
	if len(text) > MaxTextBytes || !utf8.ValidString(text) || strings.TrimSpace(text) == "" {
		return Analysis{}, ErrInvalidText
	}
	digest := sha256.Sum256([]byte(text))
	normalized := strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n")
	return Analysis{
		Characters: utf8.RuneCountInString(text),
		Words:      len(strings.Fields(text)),
		Lines:      strings.Count(normalized, "\n") + 1,
		Bytes:      len(text),
		SHA256:     hex.EncodeToString(digest[:]),
	}, nil
}
