// Author: yunnuo <ymz@ebox.vip>
// Description: Owner-controlled installation lock and database ownership checks for explicit reinstalls.
package install

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/secret"
)

// Original encrypted configuration is retained while a reinstall is pending.
// It is never exposed through the installation status or database check API.
type reinstallTarget struct {
	Driver   string            `json:"driver"`
	DSN      string            `json:"dsn_encrypted"`
	Instance string            `json:"instance"`
	Profile  contracts.Profile `json:"profile"`
}

func (m *Manager) installLocked() (bool, error) {
	path := filepath.Join(m.directory, "install.lock")
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !info.Mode().IsRegular() {
		return false, errors.New("installation lock must be a regular file")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(string(data)) != m.config.Instance {
		return false, errors.New("invalid installation lock; restore the matching data directory")
	}
	return true, nil
}

// Write the lock before recording its version. Legacy installations and a crash
// after the DB commit can then finish safely without interpreting an absent lock
// as an administrator's request to reinstall.
func (m *Manager) finalize() error {
	if _, err := m.installLocked(); err != nil {
		return err
	}
	if err := secret.AtomicWrite(filepath.Join(m.directory, "install.lock"), []byte(m.config.Instance+"\n")); err != nil {
		return err
	}
	m.config.LockVersion = 1
	m.config.Reinstall = nil
	return m.save()
}

func (m *Manager) inspectTarget(ctx context.Context, store *sqlstore.Store, driver, dsn string) (initialized, own bool, err error) {
	exists, err := store.HasInstallationTable(ctx)
	if err != nil {
		return false, false, ErrDatabase
	}
	if !exists {
		return false, false, nil
	}
	profile, instance, err := store.Installation(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return false, false, nil
	}
	if err != nil {
		return false, false, ErrDatabase
	}
	previous := m.config.Reinstall
	if previous == nil || previous.Driver != driver || previous.Instance != instance || string(previous.Profile) != profile {
		return true, false, nil
	}
	previousDSN := ""
	if previous.DSN != "" {
		previousDSN, err = m.secret.Open(previous.DSN)
		if err != nil {
			return true, false, ErrDatabase
		}
	}
	return true, previousDSN == dsn, nil
}
