// Author: yunnuo <ymz@ebox.vip>
// Description: Platform file governance reuses metadata, private downloads and durable storage transitions.
package files

import (
	"context"
	"path"
	"strings"

	"github.com/yunnuo/unicore/internal/contracts"
)

// CatalogFilter is exclusive to the instance administration surface. Business
// lists retain their independent ownership and data-scope restrictions.
type CatalogFilter struct {
	Search, LocationID string
	Page               int
	Purpose            string
	TypeCategory       string
}

type CatalogRepository interface {
	Catalog(context.Context, CatalogFilter) (contracts.FileCatalogList, error)
}

// Directory exposes only the logical upload folder, never the object key.
func Directory(f Record) string {
	dir := path.Dir(f.Key)
	if dir == "objects" || dir == "." {
		return ""
	}
	return strings.TrimPrefix(dir, "objects/")
}

// StoragePath renders a human-readable logical path relative to the storage
// root for governance audit: local objects live under the instance data
// directory's files/ folder, cloud objects under their bucket and configured
// prefix. Host-absolute paths are never exposed.
func StoragePath(l contracts.StorageLocation, key string) string {
	if l.Provider == "" || l.Provider == "local" {
		return "files/" + key
	}
	parts := make([]string, 0, 3)
	if bucket := strings.TrimSpace(l.Bucket); bucket != "" {
		parts = append(parts, bucket)
	}
	if prefix := strings.Trim(l.Prefix, "/"); prefix != "" {
		parts = append(parts, prefix)
	}
	return strings.Join(append(parts, key), "/")
}

func validPurpose(p string) bool { return p == "" || p == "user" || p == "branding" }

func validTypeCategory(c string) bool {
	return c == "" || c == CategoryImage || c == CategoryDocument || c == CategoryArchive || c == CategoryOther
}

func (s *Service) Catalog(ctx context.Context, a Actor, filter CatalogFilter) (contracts.FileCatalogList, error) {
	if !a.Admin {
		return contracts.FileCatalogList{}, ErrNotFound
	}
	if filter.Page < 1 || filter.Page > 100000 || len(filter.Search) > 255 || len(filter.LocationID) > 64 || !validPurpose(filter.Purpose) || !validTypeCategory(filter.TypeCategory) {
		return contracts.FileCatalogList{}, ErrInvalid
	}
	repo, ok := s.Repo.(CatalogRepository)
	if !ok {
		return contracts.FileCatalogList{}, ErrUnavailable
	}
	list, err := repo.Catalog(ctx, filter)
	if err != nil {
		return list, ErrUnavailable
	}
	locations := map[string]contracts.StorageLocation{}
	if len(list.Items) > 0 {
		if all, err := s.Repo.Locations(ctx); err == nil {
			for _, l := range all {
				locations[l.ID] = l.StorageLocation
			}
		}
	}
	for i := range list.Items {
		f := &list.Items[i].File
		f.Capabilities.Download = f.State == "ready" && (f.ExpiresAt == 0 || f.ExpiresAt > int(s.now().Unix()))
		// The delete endpoint performs the authoritative reference check again.
		referenced := s.ensureUnreferenced(ctx, Record{FileEntry: *f, Key: list.Items[i].FileKey}) == nil
		list.Items[i].Referenced = !referenced
		f.Capabilities.Delete = f.State != "copying" && referenced
		list.Items[i].StoragePath = StoragePath(locations[f.LocationID], list.Items[i].FileKey)
	}
	if s.Creators != nil && len(list.Items) > 0 {
		ids := make([]string, 0, len(list.Items))
		for _, item := range list.Items {
			if item.File.CreatorRealm != "system" {
				ids = append(ids, item.File.CreatorID)
			}
		}
		creators, err := s.Creators.FileCreators(ctx, ids)
		if err != nil {
			return contracts.FileCatalogList{}, ErrUnavailable
		}
		for i := range list.Items {
			creator := creators[list.Items[i].File.CreatorID]
			list.Items[i].CreatorName = creator.Name
			list.Items[i].CreatorUsername = creator.Username
		}
	}
	return list, nil
}

// CatalogAccess signs a short-lived download or, for whitelisted MIME types, a
// sandboxed inline preview link on the administrator governance surface.
func (s *Service) CatalogAccess(ctx context.Context, a Actor, id string, inline bool) (contracts.FileAccess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !a.Admin {
		return contracts.FileAccess{}, ErrNotFound
	}
	f, err := s.Repo.Get(ctx, id)
	if err != nil || f.State == "deleted" || (f.Purpose != "user" && f.Purpose != "branding") || f.ExpiresAt > 0 && f.ExpiresAt <= int(s.now().Unix()) {
		return contracts.FileAccess{}, ErrNotFound
	}
	return s.signAccess(ctx, f, inline)
}

func (s *Service) CatalogDelete(ctx context.Context, a Actor, id string) error {
	s.referenceMu.Lock()
	defer s.referenceMu.Unlock()
	s.mu.Lock()
	defer s.mu.Unlock()
	if !a.Admin {
		return ErrNotFound
	}
	f, err := s.Repo.Get(ctx, id)
	if err != nil || f.State == "deleted" || (f.Purpose != "user" && f.Purpose != "branding") {
		return ErrNotFound
	}
	if f.State == "copying" {
		return ErrBusy
	}
	if err = s.ensureUnreferenced(ctx, f); err != nil {
		return err
	}
	return s.remove(ctx, f, a.ID)
}
