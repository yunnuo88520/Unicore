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
	"runtime"
	"testing"
)

func TestConfinementAndAtomicPublication(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	s := New(filepath.Join(dir, "objects"))
	payload := []byte("original")
	_, e := s.Put(ctx, "a/b.txt", bytes.NewReader(payload), int64(len(payload)), "text/plain")
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
	r, opened, e := s.Open(ctx, "a/b.txt")
	if e != nil {
		t.Fatal(e)
	}
	got, _ := io.ReadAll(r)
	r.Close()
	if !bytes.Equal(got, payload) {
		t.Fatal("failed write replaced original")
	}
	// Streaming reads and filesystem stats stay cheap: no content hash.
	if opened.ETag != "" {
		t.Fatal("open computed a hash")
	}
	// Local copies verify at Put time instead of an etag precheck.
	if e = s.Copy(ctx, "a/b.txt", "copy.txt", ""); e != nil {
		t.Fatal(e)
	}
	if e = s.Copy(ctx, "a/b.txt", "copy2.txt", "ignored-etag"); e != nil {
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
	if e != nil {
		t.Fatal(e)
	}
	// Windows keeps no POSIX mode bits; Go only reports a synthetic 0666 there.
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0600 {
		t.Fatal("unsafe file permissions", info.Mode())
	}
}

func TestStatIsFilesystemMetadataOnly(t *testing.T) {
	ctx := context.Background()
	s := New(t.TempDir())
	payload := []byte("stat must not read object bytes")
	v, e := s.Put(ctx, "deep/object.bin", bytes.NewReader(payload), int64(len(payload)), "application/octet-stream")
	if e != nil {
		t.Fatal(e)
	}
	obj, e := s.Stat(ctx, "deep/object.bin")
	if e != nil {
		t.Fatal(e)
	}
	if obj.Size != int64(len(payload)) || obj.ETag != "" {
		t.Fatal("stat metadata", obj)
	}
	if _, e = s.Stat(ctx, "deep/missing.bin"); !errors.Is(e, blob.ErrNotFound) {
		t.Fatal("missing object", e)
	}
	if _, e = s.Stat(ctx, "../escape"); e == nil {
		t.Fatal("escaping key accepted")
	}
	// Hash is the explicit verification moment and matches the stored digest.
	h, e := s.Hash(ctx, "deep/object.bin")
	if e != nil || h != v.ETag {
		t.Fatal("hash mismatch", h, e)
	}
	if _, e = s.Hash(ctx, "deep/missing.bin"); !errors.Is(e, blob.ErrNotFound) {
		t.Fatal("missing hash", e)
	}
	// Copy publishes a byte-identical target without any etag precheck.
	if e = s.Copy(ctx, "deep/object.bin", "deep/copy.bin", ""); e != nil {
		t.Fatal(e)
	}
	copied, e := s.Hash(ctx, "deep/copy.bin")
	if e != nil || copied != v.ETag {
		t.Fatal("copy changed bytes", e)
	}
}
