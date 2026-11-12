// Author: yunnuo <ymz@ebox.vip>
// Description: Local business-file composition shared by Standalone carriers, without cloud or identity dependencies.
package filelocal

import (
	"context"
	"errors"
	"log/slog"
	"path/filepath"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/adapter/storage/filesql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/secret"
)

type policy struct{}

func (policy) Value(_ context.Context, key string) (string, error) {
	switch key {
	case "storage.active":
		return "local", nil
	case "storage.upload_paths", "storage.allowed_extensions":
		return "", nil
	}
	return "", errors.New("local upload policy uses defaults")
}
func New(store *sqlstore.Store, directory string) (*files.Service, error) {
	key, err := secret.Open(directory, "")
	if err != nil {
		return nil, err
	}
	return WithSecrets(store, directory, key)
}
func WithSecrets(store *sqlstore.Store, directory string, key files.Secrets) (*files.Service, error) {
	service := &files.Service{Repo: &filesql.Repository{Store: store}, Settings: policy{}, Secrets: key, Factory: func(location files.Location, _ files.Credentials) (blob.Store, error) {
		if location.ID != "local" || location.Provider != "local" {
			return nil, files.ErrUnavailable
		}
		return bloblocal.New(filepath.Join(directory, "files")), nil
	}}
	if err := service.Cleanup(context.Background()); err != nil {
		return nil, err
	}
	return service, nil
}

// StartCleanup runs bounded retries and returns a stop function that drains before DB close.
func StartCleanup(service *files.Service) func() {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				work, finish := context.WithTimeout(ctx, 30*time.Second)
				err := service.Cleanup(work)
				finish()
				if err != nil && ctx.Err() == nil {
					slog.Warn("file cleanup unavailable", "event", "files.cleanup_unavailable")
				}
			}
		}
	}()
	return func() { cancel(); <-done }
}
