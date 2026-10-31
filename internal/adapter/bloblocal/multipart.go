// Author: yunnuo <ymz@ebox.vip>
// Description: Restart-safe, root-confined parts and bounded streaming assembly.
package bloblocal

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"strconv"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/blob"
)

func partKey(k, upload string, number int) string {
	return k + "-parts/" + upload + "/" + strconv.Itoa(number)
}
func validUpload(k, upload string) bool { return blob.ValidKey(k) && upload == "local" }
func (s *Store) BeginMultipart(ctx context.Context, k, mime string) (string, error) {
	if e := checked(k); e != nil {
		return "", e
	}
	return "local", ctx.Err()
}
func (s *Store) SignPart(context.Context, string, string, int, int64, time.Duration) (blob.Grant, error) {
	return blob.Grant{}, blob.ErrUnsupported
}
func (s *Store) ReceivePart(ctx context.Context, k, upload string, number int, r io.Reader, n int64) error {
	if !validUpload(k, upload) || number < 1 || number > 10000 || n < 1 || n > 64<<20 {
		return blob.ErrChanged
	}
	_, e := s.Put(ctx, partKey(k, upload, number), r, n, "application/octet-stream")
	return e
}
func (s *Store) ListParts(ctx context.Context, k, upload string) ([]blob.Part, error) {
	if !validUpload(k, upload) {
		return nil, blob.ErrChanged
	}
	root, e := s.root()
	if e != nil {
		return nil, e
	}
	defer root.Close()
	entries, e := fs.ReadDir(root.FS(), k+"-parts/"+upload)
	if e != nil && !isMissing(e) {
		return nil, e
	}
	parts := []blob.Part{}
	for _, v := range entries {
		n, e := strconv.Atoi(v.Name())
		if e != nil || v.IsDir() || n < 1 || n > 10000 {
			continue
		}
		o, e := s.Stat(ctx, partKey(k, upload, n))
		if e != nil {
			return nil, e
		}
		parts = append(parts, blob.Part{Number: n, Size: o.Size, ETag: o.ETag})
	}
	return parts, nil
}
func isMissing(e error) bool { return errors.Is(e, fs.ErrNotExist) }
func (s *Store) CompleteMultipart(ctx context.Context, k, upload string, parts []blob.Part) error {
	if !validUpload(k, upload) {
		return blob.ErrChanged
	}
	// Pipe keeps RAM independent of total file size and opens only one part at a time.
	var size int64
	for _, p := range parts {
		size += p.Size
	}
	reader, writer := io.Pipe()
	done := make(chan error, 1)
	go func() {
		var err error
		for _, p := range parts {
			r, o, e := s.Open(ctx, partKey(k, upload, p.Number))
			if e != nil {
				err = e
				break
			}
			if o.ETag != p.ETag || o.Size != p.Size {
				r.Close()
				err = blob.ErrChanged
				break
			}
			_, err = io.Copy(writer, r)
			r.Close()
			if err != nil {
				break
			}
		}
		writer.CloseWithError(err)
		done <- err
	}()
	_, e := s.Put(ctx, k, reader, size, "")
	reader.CloseWithError(e)
	writeErr := <-done
	if e != nil {
		return e
	}
	return writeErr
}
func (s *Store) AbortMultipart(ctx context.Context, k string) error {
	if e := checked(k); e != nil {
		return e
	}
	if e := ctx.Err(); e != nil {
		return e
	}
	root, e := s.root()
	if e != nil {
		return e
	}
	defer root.Close()
	// Only this file's private staging directory, never the root namespace.
	if !strings.HasPrefix(k, "multipart/") {
		return nil
	}
	return root.RemoveAll(k + "-parts")
}
