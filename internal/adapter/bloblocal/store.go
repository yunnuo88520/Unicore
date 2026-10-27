// Author: yunnuo <ymz@ebox.vip>
// Description: Root-confined local objects with bounded streaming and atomic publication.
package bloblocal

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"time"

	"github.com/yunnuo/unicore/internal/blob"
)

type Store struct{ Directory string }

func New(directory string) *Store { return &Store{Directory: directory} }
func (s *Store) root() (*os.Root, error) {
	if err := os.MkdirAll(s.Directory, 0700); err != nil {
		return nil, err
	}
	return os.OpenRoot(s.Directory)
}
func checked(key string) error {
	if !blob.ValidKey(key) {
		return errors.New("invalid object key")
	}
	return nil
}

type contextual struct {
	ctx context.Context
	io.Reader
}

func (r contextual) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.Reader.Read(p)
}
func (s *Store) Put(ctx context.Context, key string, source io.Reader, size int64, mime string) (blob.Object, error) {
	if err := checked(key); err != nil {
		return blob.Object{}, err
	}
	if size < 0 {
		return blob.Object{}, errors.New("invalid object size")
	}
	root, err := s.root()
	if err != nil {
		return blob.Object{}, err
	}
	defer root.Close()
	if err = root.MkdirAll(path.Dir(key), 0700); err != nil {
		return blob.Object{}, err
	}
	var random [16]byte
	if _, err = rand.Read(random[:]); err != nil {
		return blob.Object{}, err
	}
	temporary := path.Join(path.Dir(key), ".upload-"+hex.EncodeToString(random[:]))
	file, err := root.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return blob.Object{}, err
	}
	defer root.Remove(temporary)
	hash := sha256.New()
	n, copyErr := io.Copy(io.MultiWriter(file, hash), io.LimitReader(contextual{ctx, source}, size+1))
	if copyErr == nil && n != size {
		copyErr = errors.New("object size mismatch")
	}
	if copyErr == nil {
		copyErr = file.Sync()
	}
	closeErr := file.Close()
	if copyErr != nil {
		return blob.Object{}, copyErr
	}
	if closeErr != nil {
		return blob.Object{}, closeErr
	}
	if err = root.Rename(temporary, key); err != nil {
		return blob.Object{}, err
	}
	return blob.Object{Size: n, MIME: mime, ETag: hex.EncodeToString(hash.Sum(nil))}, nil
}
func (s *Store) Open(ctx context.Context, key string) (io.ReadCloser, blob.Object, error) {
	if err := checked(key); err != nil {
		return nil, blob.Object{}, err
	}
	root, err := s.root()
	if err != nil {
		return nil, blob.Object{}, err
	}
	defer root.Close()
	f, err := root.Open(key)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, blob.Object{}, blob.ErrNotFound
	}
	if err != nil {
		return nil, blob.Object{}, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		f.Close()
		return nil, blob.Object{}, errors.New("invalid object")
	}
	h := sha256.New()
	if _, err = io.Copy(h, contextual{ctx, f}); err != nil {
		f.Close()
		return nil, blob.Object{}, err
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		f.Close()
		return nil, blob.Object{}, err
	}
	return f, blob.Object{Size: info.Size(), ETag: hex.EncodeToString(h.Sum(nil))}, nil
}
func (s *Store) Stat(ctx context.Context, key string) (blob.Object, error) {
	r, obj, err := s.Open(ctx, key)
	if r != nil {
		r.Close()
	}
	return obj, err
}
func (s *Store) Delete(_ context.Context, key string) error {
	if err := checked(key); err != nil {
		return err
	}
	root, err := s.root()
	if err != nil {
		return err
	}
	defer root.Close()
	err = root.Remove(key)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}
func (s *Store) Copy(ctx context.Context, source, target, etag string) error {
	r, obj, err := s.Open(ctx, source)
	if err != nil {
		return err
	}
	defer r.Close()
	if etag != "" && obj.ETag != etag {
		return blob.ErrChanged
	}
	_, err = s.Put(ctx, target, r, obj.Size, obj.MIME)
	return err
}
func (s *Store) SignPut(context.Context, string, int64, string, time.Duration) (blob.Grant, error) {
	return blob.Grant{}, blob.ErrUnsupported
}
func (s *Store) SignGet(context.Context, string, string, time.Duration) (string, error) {
	return "", blob.ErrUnsupported
}
func (s *Store) Keys(ctx context.Context) ([]string, error) {
	root, err := s.root()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	result := []string{}
	err = fs.WalkDir(root.FS(), ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		if len(result) > 10000 {
			return fmt.Errorf("managed namespace too large")
		}
		if !entry.IsDir() && entry.Type().IsRegular() && blob.ValidKey(filepath.ToSlash(name)) {
			result = append(result, filepath.ToSlash(name))
		}
		return nil
	})
	return result, err
}
