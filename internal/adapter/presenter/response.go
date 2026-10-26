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
	code, message := "INTERNAL_ERROR", "操作失败，请重试"
	if errors.Is(err, domain.ErrInvalidText) {
		code, message = "INVALID_INPUT", "请输入非空文本，且 UTF-8 编码不超过 65,536 字节"
	}
	return contracts.ErrorResponse{Code: code, Message: message, RequestID: requestID}
}
