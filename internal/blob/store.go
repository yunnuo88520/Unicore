// Author: yunnuo <ymz@ebox.vip>
// Description: Provider-neutral object bytes and expiring grants; business code never resolves filesystem paths.
package blob

import (
	"context"
	"errors"
	"io"
	"path"
	"strings"
	"time"
)

var ErrNotFound = errors.New("object not found")
var ErrUnsupported = errors.New("object operation unsupported")
var ErrChanged = errors.New("object changed")

type Object struct {
	Size       int64
	MIME, ETag string
}
type Grant struct {
	URL, Method     string
	Headers, Fields map[string]string
}
type Store interface {
	Put(context.Context, string, io.Reader, int64, string) (Object, error)
	Open(context.Context, string) (io.ReadCloser, Object, error)
	Stat(context.Context, string) (Object, error)
	Delete(context.Context, string) error
	Copy(context.Context, string, string, string) error
	SignPut(context.Context, string, int64, string, time.Duration) (Grant, error)
	SignGet(context.Context, string, string, time.Duration) (string, error)
}

// Keys is used only by small, managed namespaces such as normalized branding.
type Lister interface {
	Keys(context.Context) ([]string, error)
}

func ValidKey(key string) bool {
	return key != "" && key != "." && len(key) <= 1024 && !strings.ContainsAny(key, "\\\x00\r\n") && !strings.HasPrefix(key, "/") && path.Clean(key) == key && key != ".." && !strings.HasPrefix(key, "../")
}
