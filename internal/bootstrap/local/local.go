// Author: yunnuo <ymz@ebox.vip>
// Description: Desktop-only SQLite composition with no platform identity imports.
package local

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/gofrs/flock"
	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlite"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/branding"
	"github.com/yunnuo/unicore/internal/settings"
)

func Open(ctx context.Context, directory string) (*sqlstore.Store, *settings.Service, error) {
	if directory == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return nil, nil, err
		}
		directory = filepath.Join(base, "Unicore", "desktop")
	}
	directory, err := filepath.Abs(directory)
	if err != nil {
		return nil, nil, err
	}
	if err = os.MkdirAll(directory, 0700); err != nil {
		return nil, nil, err
	}
	lock := flock.New(filepath.Join(directory, "instance.lock"))
	locked, err := lock.TryLock()
	if err != nil {
		return nil, nil, err
	}
	if !locked {
		return nil, nil, errors.New("desktop data directory is already in use")
	}
	store, err := sqlite.Open(ctx, filepath.Join(directory, "unicore.db"))
	if err != nil {
		_ = lock.Unlock()
		return nil, nil, err
	}
	store.OnClose = func() { _ = lock.Unlock() }
	fail := func(err error) (*sqlstore.Store, *settings.Service, error) { _ = store.Close(); return nil, nil, err }
	if err = store.Migrate(ctx, false); err != nil {
		return fail(err)
	}
	profile, _, err := store.Installation(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		tx, e := store.DB.BeginTx(ctx, nil)
		if e != nil {
			return fail(e)
		}
		defer tx.Rollback()
		abort := func(err error) (*sqlstore.Store, *settings.Service, error) { _ = tx.Rollback(); return fail(err) }
		if _, e = store.Exec(ctx, tx, "INSERT INTO install_state(id,profile,instance_id,installed_at) VALUES(1,'desktop',?,?)", sqlstore.ID(), time.Now().Unix()); e != nil {
			return abort(e)
		}
		for key, value := range settings.Defaults("desktop") {
			if _, e = store.Exec(ctx, tx, "INSERT INTO system_settings(setting_key,setting_value) VALUES(?,?)", key, value); e != nil {
				return abort(e)
			}
		}
		if e = tx.Commit(); e != nil {
			return abort(e)
		}
	} else if err != nil {
		return fail(err)
	} else if profile != "desktop" {
		return fail(errors.New("data directory belongs to another profile"))
	}
	return store, &settings.Service{Store: store, Profile: "desktop", Branding: branding.New(store, bloblocal.New(filepath.Join(directory, "brand-assets")))}, nil
}
