// Author: yunnuo <ymz@ebox.vip>
// Description: Pure business rules for the removable notes example.
package domain

import (
	"errors"
	"strings"
	"unicode/utf8"
)

var ErrNoteInvalid = errors.New("invalid note")

func ValidateNote(title, body, status string, attachments []string) error {
	if strings.TrimSpace(title) == "" || utf8.RuneCountInString(title) > 120 || utf8.RuneCountInString(body) > 5000 || (status != "open" && status != "done") || len(attachments) > 5 {
		return ErrNoteInvalid
	}
	seen := map[string]bool{}
	for _, id := range attachments {
		if id == "" || len(id) > 80 || seen[id] {
			return ErrNoteInvalid
		}
		seen[id] = true
	}
	return nil
}
