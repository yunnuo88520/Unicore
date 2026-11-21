// Author: yunnuo <ymz@ebox.vip>
// Description: Order entity rules: bounded fields and the explicit status graph.
package domain

import (
	"errors"
	"strings"
	"unicode/utf8"
)

var (
	ErrOrderInvalid   = errors.New("invalid order")
	ErrOrderStatus    = errors.New("order status transition not allowed")
	ErrOrderForbidden = errors.New("order not visible to this account")
)

// Statuses: open → processing → done, with cancelled reachable while active.
const (
	StatusOpen       = "open"
	StatusProcessing = "processing"
	StatusDone       = "done"
	StatusCancelled  = "cancelled"
)

// ValidateNew bounds creation input: a title and a non-negative amount.
// Ownership and assignment never come from the customer: the owner is the
// creating handle operator, the agent is assigned explicitly.
func ValidateNew(title string, amountCents int) error {
	title = strings.TrimSpace(title)
	if utf8.RuneCountInString(title) < 1 || utf8.RuneCountInString(title) > 80 {
		return ErrOrderInvalid
	}
	if amountCents < 0 {
		return ErrOrderInvalid
	}
	return nil
}

// CanTransition enforces the status graph server-side; the client never picks
// the target freely and terminal orders are immutable.
func CanTransition(from, to string) bool {
	switch to {
	case StatusProcessing:
		return from == StatusOpen
	case StatusDone, StatusCancelled:
		return from == StatusOpen || from == StatusProcessing
	}
	return false
}

func ValidStatus(status string) bool {
	return status == StatusOpen || status == StatusProcessing || status == StatusDone || status == StatusCancelled
}
