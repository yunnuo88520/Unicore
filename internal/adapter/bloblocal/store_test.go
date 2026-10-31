// Author: yunnuo <ymz@ebox.vip>
// Description: Verify filesystem confinement, exact lengths, atomic failure and conditional copy semantics.
package bloblocal

import (
	"bytes"
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/blob"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestConfinementAndAtomicPublication(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	s := New(filepath.Join(dir, "objects"))
	payload := []byte("original")
	v, e := s.Put(ctx, "a/b.txt", bytes.NewReader(payload), int64(len(payload)), "text/plain")
	if e != nil {
		t.Fatal(e)
	}
	for _, key := range []string{".", "", "../escape", "/absolute", "a/../../outside", "a\\outside", "a//b", "a/./b"} {
		if _, e = s.Put(ctx, key, bytes.NewReader(payload), int64(len(payload)), ""); e == nil {
			t.Fatal("invalid key accepted", key)
		}
	}
	if _, e = s.Put(ctx, "a/b.txt", bytes.NewReader([]byte("longer")), 2, ""); e == nil {
		t.Fatal("size mismatch accepted")
	}
	r, _, e := s.Open(ctx, "a/b.txt")
	if e != nil {
		t.Fatal(e)
	}
	got, _ := io.ReadAll(r)
	r.Close()
	if !bytes.Equal(got, payload) {
		t.Fatal("failed write replaced original")
	}
	if e = s.Copy(ctx, "a/b.txt", "copy.txt", "wrong"); !errors.Is(e, blob.ErrChanged) {
		t.Fatal("copy ignored etag", e)
	}
	if e = s.Copy(ctx, "a/b.txt", "copy.txt", v.ETag); e != nil {
		t.Fatal(e)
	}
	outside := t.TempDir()
	if e = os.Symlink(outside, filepath.Join(s.Directory, "escape")); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Put(ctx, "escape/data", bytes.NewReader(payload), int64(len(payload)), ""); e == nil {
		t.Fatal("followed escaping symlink")
	}
	if entries, _ := os.ReadDir(outside); len(entries) != 0 {
		t.Fatal("escaped root")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, e = s.Put(cancelled, "cancelled", bytes.NewReader(payload), int64(len(payload)), ""); e == nil {
		t.Fatal("ignored cancellation")
	}
	info, e := os.Stat(filepath.Join(s.Directory, "a/b.txt"))
	if e != nil || info.Mode().Perm() != 0600 {
		t.Fatal("unsafe file permissions", e)
	}
}
