// Author: yunnuo <ymz@ebox.vip>
// Description: Optional persistent multipart capability; provider IDs and object keys never reach business callers.
package blob

import (
	"context"
	"io"
	"time"
)

type Part struct {
	Number int
	Size   int64
	ETag   string
}
type Multipart interface {
	BeginMultipart(context.Context, string, string) (string, error)
	ListParts(context.Context, string, string) ([]Part, error)
	SignPart(context.Context, string, string, int, int64, time.Duration) (Grant, error)
	CompleteMultipart(context.Context, string, string, []Part) error
	// Abort all incomplete uploads for this exact staging key, including a Begin response lost during a crash.
	AbortMultipart(context.Context, string) error
}
type PartReceiver interface {
	ReceivePart(context.Context, string, string, int, io.Reader, int64) error
}
