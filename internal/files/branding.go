// Author: yunnuo <ymz@ebox.vip>
// Description: Normalized public branding shares storage abstraction while keeping private user files isolated.
package files

import (
	"context"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	"io"
	"time"
)

type brandStore struct{ s *Service }

func (s *Service) BrandStore() blob.Store { return &brandStore{s} }
func (b *brandStore) lookup(ctx context.Context, key string) (Record, error) {
	f, e := b.s.Repo.Get(ctx, key)
	if e == nil {
		if f.Purpose != "branding" || f.State != "ready" {
			return f, blob.ErrNotFound
		}
		return f, nil
	}
	if e != ErrNotFound {
		return f, e
	}
	l, e := b.s.location(ctx, "legacy-brand")
	if e != nil {
		return f, e
	}
	st, e := b.s.store(l)
	if e != nil {
		return f, e
	}
	obj, e := st.Stat(ctx, key)
	if e != nil {
		return f, e
	}
	f = Record{FileEntry: contracts.FileEntry{FileID: key, OriginalName: key, StorageType: "local", LocationID: l.ID, MimeType: "image/png", Size: int(obj.Size), CreatorID: "system", CreatorRealm: "system", CreatedAt: int(b.s.now().Unix()), State: "ready"}, Key: key, Purpose: "branding", ETag: obj.ETag}
	if e = b.s.Repo.Create(ctx, f, nil); e != nil {
		return f, e
	}
	return f, nil
}
func (b *brandStore) Open(ctx context.Context, key string) (io.ReadCloser, blob.Object, error) {
	b.s.mu.Lock()
	defer b.s.mu.Unlock()
	f, e := b.lookup(ctx, key)
	if e != nil {
		return nil, blob.Object{}, e
	}
	l, e := b.s.location(ctx, f.LocationID)
	if e != nil {
		return nil, blob.Object{}, e
	}
	st, e := b.s.store(l)
	if e != nil {
		return nil, blob.Object{}, e
	}
	return st.Open(ctx, f.Key)
}
func (b *brandStore) Stat(ctx context.Context, key string) (blob.Object, error) {
	r, v, e := b.Open(ctx, key)
	if r != nil {
		r.Close()
	}
	return v, e
}
func (b *brandStore) Put(ctx context.Context, key string, r io.Reader, n int64, m string) (blob.Object, error) {
	b.s.mu.Lock()
	defer b.s.mu.Unlock()
	old, e := b.s.Repo.Get(ctx, key)
	if e == nil && old.State == "ready" {
		if old.Purpose != "branding" {
			return blob.Object{}, ErrBusy
		}
		l, e := b.s.location(ctx, old.LocationID)
		if e != nil {
			return blob.Object{}, e
		}
		st, e := b.s.store(l)
		if e != nil {
			return blob.Object{}, e
		}
		return st.Stat(ctx, old.Key)
	}
	if e != nil && e != ErrNotFound {
		return blob.Object{}, e
	}
	active, e := b.s.active(ctx)
	if e != nil {
		return blob.Object{}, e
	}
	l, e := b.s.location(ctx, active)
	if e != nil {
		return blob.Object{}, e
	}
	st, e := b.s.store(l)
	if e != nil {
		return blob.Object{}, e
	}
	f := Record{FileEntry: contracts.FileEntry{FileID: key, OriginalName: key, MimeType: m, Size: int(n), LocationID: l.ID, StorageType: l.Provider, CreatorID: "system", CreatorRealm: "system", CreatedAt: int(b.s.now().Unix()), State: "pending"}, Purpose: "branding", Key: "branding/" + id(), UploadExpires: b.s.now().Add(2 * time.Hour).Unix()}
	f.CleanupAt = f.UploadExpires
	j := b.s.job(l.ID, f.Key, f.UploadExpires)
	if old.FileID != "" {
		e = b.s.Repo.Change(ctx, f, []Job{j}, "system")
	} else {
		e = b.s.Repo.Create(ctx, f, []Job{j})
	}
	if e != nil {
		return blob.Object{}, e
	}
	obj, e := st.Put(ctx, f.Key, r, n, m)
	if e != nil {
		return blob.Object{}, e
	}
	f.State = "ready"
	f.ETag = obj.ETag
	if e = b.s.Repo.Change(ctx, f, nil, "system"); e != nil {
		return blob.Object{}, e
	}
	return obj, nil
}
func (b *brandStore) Delete(ctx context.Context, key string) error {
	b.s.mu.Lock()
	defer b.s.mu.Unlock()
	f, e := b.s.Repo.Get(ctx, key)
	if e == ErrNotFound {
		return nil
	}
	if e != nil {
		return e
	}
	if f.Purpose != "branding" {
		return ErrNotFound
	}
	return b.s.remove(ctx, f, "system")
}
func (b *brandStore) Keys(ctx context.Context) ([]string, error)         { return b.s.Repo.BrandKeys(ctx) }
func (b *brandStore) Copy(context.Context, string, string, string) error { return blob.ErrUnsupported }
func (b *brandStore) SignPut(context.Context, string, int64, string, time.Duration) (blob.Grant, error) {
	return blob.Grant{}, blob.ErrUnsupported
}
func (b *brandStore) SignGet(context.Context, string, string, time.Duration) (string, error) {
	return "", blob.ErrUnsupported
}
