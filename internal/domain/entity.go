// Author: yunnuo <ymz@ebox.vip>
// Description: Embedded lifecycle fields for mutable business aggregates; transport and persistence stay outside the domain.
package domain

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// BaseEntity uses UTC Unix seconds. DeletedAt == 0 means active. Every mutation
// must compare Version, increment it and set UpdatedAt in the same transaction.
// Security credentials, join rows and append-only ledgers have explicit separate lifecycles.
type BaseEntity struct {
	ID                              string
	CreatedAt, UpdatedAt, DeletedAt int
	Version                         int
}

func NewEntity(now time.Time) BaseEntity {
	var raw [24]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic(err)
	}
	return BaseEntity{ID: hex.EncodeToString(raw[:]), CreatedAt: int(now.Unix()), UpdatedAt: int(now.Unix()), Version: 1}
}

// ValidPage bounds both resource use and offset arithmetic across all SQL dialects.
func ValidPage(page, size int) bool { return page >= 1 && page <= 100000 && size >= 1 && size <= 50 }
func PageOffset(page, size int) int { return (page - 1) * size }
