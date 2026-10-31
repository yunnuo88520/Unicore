// Author: yunnuo <ymz@ebox.vip>
// Description: Identical response envelopes and error codes for all UI transports.
package presenter

import (
	"crypto/rand"
	"encoding/hex"
	"errors"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
)

func RequestID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		panic("secure random unavailable")
	}
	return hex.EncodeToString(value[:])
}

func Error(err error, requestID string) contracts.ErrorResponse {
	code := "INTERNAL_ERROR"
	if errors.Is(err, domain.ErrInvalidText) {
		code = "INVALID_INPUT"
	}
	return contracts.ErrorResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, RequestID: requestID}
}
