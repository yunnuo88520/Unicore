// Author: yunnuo <ymz@ebox.vip>
// Description: Platform file governance reuses metadata, private downloads and durable storage transitions.
package files

import (
	"context"
	"path"
	"strings"
	"unicode"

	"github.com/yunnuo/unicore/internal/contracts"
)

// CatalogFilter is exclusive to the instance administration surface. Business
// lists retain their independent ownership and data-scope restrictions.
type CatalogFilter struct {
	Search, LocationID, Directory string
	Page                          int
	DirectorySet                  bool
	TargetLocationID              string
	LocalSourcesOnly              bool
}

type CatalogRepository interface {
	Catalog(context.Context, CatalogFilter) (contracts.FileCatalogList, error)
	Directories(context.Context) (contracts.FileDirectoryList, error)
	MigrationSelection(context.Context, CatalogFilter) (contracts.FileMigrationSelection, error)
}

// Directory exposes only the logical upload folder, never the object key.
func Directory(f Record) string {
	dir := path.Dir(f.Key)
	if dir == "objects" || dir == "." {
		return ""
	}
	return strings.TrimPrefix(dir, "objects/")
}

func validDirectory(dir string) bool {
	return dir == "" || len(dir) <= 512 && !strings.HasPrefix(dir, "/") &&
		!strings.Contains(dir, "\\") && path.Clean(dir) == dir &&
		dir != "." && dir != ".." && !strings.HasPrefix(dir, "../") &&
		!strings.ContainsFunc(dir, unicode.IsControl)
}

func (s *Service) Catalog(ctx context.Context, a Actor, filter CatalogFilter) (contracts.FileCatalogList, error) {
	if !a.Admin {
		return contracts.FileCatalogList{}, ErrNotFound
	}
	if filter.Page < 1 || filter.Page > 100000 || len(filter.Search) > 255 || len(filter.LocationID) > 64 || len(filter.TargetLocationID) > 64 || !validDirectory(filter.Directory) {
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
	for i := range list.Items {
		f := &list.Items[i].File
		f.Capabilities.Download = f.State == "ready" && (f.ExpiresAt == 0 || f.ExpiresAt > int(s.now().Unix()))
		// The delete endpoint performs the authoritative reference check again.
		f.Capabilities.Delete = f.State != "copying" && s.ensureUnreferenced(ctx, Record{FileEntry: *f}) == nil
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

func (s *Service) Directories(ctx context.Context, a Actor) (contracts.FileDirectoryList, error) {
	if !a.Admin {
		return contracts.FileDirectoryList{}, ErrNotFound
	}
	repo, ok := s.Repo.(CatalogRepository)
	if !ok {
		return contracts.FileDirectoryList{}, ErrUnavailable
	}
	return repo.Directories(ctx)
}

func (s *Service) CatalogAccess(ctx context.Context, a Actor, id string) (contracts.FileAccess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !a.Admin {
		return contracts.FileAccess{}, ErrNotFound
	}
	f, err := s.Repo.Get(ctx, id)
	if err != nil || f.State == "deleted" || (f.Purpose != "user" && f.Purpose != "branding") || f.ExpiresAt > 0 && f.ExpiresAt <= int(s.now().Unix()) {
		return contracts.FileAccess{}, ErrNotFound
	}
	return s.signAccess(ctx, f)
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

// MigrationSelection freezes the batch before the first storage transition.
func (s *Service) MigrationSelection(ctx context.Context, a Actor, filter CatalogFilter) (contracts.FileMigrationSelection, error) {
	if !a.Admin {
		return contracts.FileMigrationSelection{}, ErrNotFound
	}
	if len(filter.Search) > 255 || len(filter.LocationID) > 64 || len(filter.TargetLocationID) > 64 || !validDirectory(filter.Directory) {
		return contracts.FileMigrationSelection{}, ErrInvalid
	}
	if filter.TargetLocationID != "" {
		target, err := s.location(ctx, filter.TargetLocationID)
		if err != nil {
			return contracts.FileMigrationSelection{}, err
		}
		if !target.Tested || target.ID == "legacy-brand" {
			return contracts.FileMigrationSelection{}, ErrNotReady
		}
		filter.LocalSourcesOnly = target.Provider != "local"
	}
	repo, ok := s.Repo.(CatalogRepository)
	if !ok {
		return contracts.FileMigrationSelection{}, ErrUnavailable
	}
	return repo.MigrationSelection(ctx, filter)
}
