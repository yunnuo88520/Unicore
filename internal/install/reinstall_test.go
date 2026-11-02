// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit installation unlock, prior database ownership, crash recovery and legacy lock adoption.
package install

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
)

func unlockManager(t *testing.T, m *Manager, options Options) (*Manager, string) {
	t.Helper()
	if err := m.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(options.DataDir, "install.lock")); err != nil {
		t.Fatal(err)
	}
	next, err := Open(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = next.Close() })
	if next.Installed() {
		t.Fatal("explicit unlock did not open installation")
	}
	return next, strings.TrimSpace(string(mustRead(t, next.TokenPath())))
}

func TestExplicitReinstallRequiresNewTokenAndResetConsent(t *testing.T) {
	ctx := context.Background()
	m, options, oldToken := testManager(t)
	input := standaloneInput()
	if _, _, err := m.Complete(ctx, oldToken, input); err != nil {
		t.Fatal(err)
	}
	oldInstance := m.config.Instance
	options.BootstrapToken = oldToken // Even a previously injected token must be revoked.
	m, token := unlockManager(t, m, options)
	if token == oldToken {
		t.Fatal("bootstrap credential was reused")
	}
	if _, _, err := m.Complete(ctx, oldToken, input); !errors.Is(err, ErrToken) {
		t.Fatal("former owner token accepted", err)
	}
	check, err := m.Verify(ctx, token, input.Database)
	if err != nil || !check.Initialized || check.ResetAllowed == nil || !*check.ResetAllowed {
		t.Fatal("own database was not identified", check, err)
	}
	if _, _, err = m.Complete(ctx, token, input); !errors.Is(err, ErrNotEmpty) {
		t.Fatal("old database reset without consent", err)
	}
	// An interrupted confirmation must not recover the former marker as a new success.
	_ = m.Close()
	m, err = Open(ctx, options)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	if m.Installed() || strings.TrimSpace(string(mustRead(t, m.TokenPath()))) != token {
		t.Fatal("pending reinstall lost its state or token")
	}
	input.ResetDatabase = pointer(true)
	input.DatabaseConfirmation = pointer("wrong")
	if _, _, err = m.Complete(ctx, token, input); !errors.Is(err, ErrInput) {
		t.Fatal("incorrect target name accepted", err)
	}
	input.DatabaseConfirmation = &check.DatabaseName
	input.SiteName = "Replacement site"
	if _, _, err = m.Complete(ctx, token, input); err != nil {
		t.Fatal(err)
	}
	if m.config.Instance == oldInstance || m.config.Reinstall != nil {
		t.Fatal("reinstallation retained former ownership intent")
	}
	if locked, err := m.installLocked(); err != nil || !locked {
		t.Fatal("reinstallation did not relock", err)
	}
	store, _, _, _ := m.Services()
	_, instance, err := store.Installation(ctx)
	if err != nil || instance != m.config.Instance {
		t.Fatal("new DB marker was not committed", err)
	}
	if _, _, err = m.Complete(ctx, token, input); !errors.Is(err, ErrInstalled) {
		t.Fatal("reinstallation endpoint stayed open", err)
	}
}

func TestUnlockedInstallerRejectsForeignAndUnrecognizedData(t *testing.T) {
	for _, change := range []string{"foreign-marker", "missing-marker", "unrelated-data"} {
		t.Run(change, func(t *testing.T) {
			ctx := context.Background()
			m, options, token := testManager(t)
			input := standaloneInput()
			if _, _, err := m.Complete(ctx, token, input); err != nil {
				t.Fatal(err)
			}
			store, _, _, _ := m.Services()
			query := "UPDATE unicore_install_state SET instance_id='another-instance'"
			if change == "missing-marker" {
				query = "DELETE FROM unicore_install_state"
			} else if change == "unrelated-data" {
				query = "DROP TABLE unicore_install_state"
			}
			if _, err := store.DB.ExecContext(ctx, query); err != nil {
				t.Fatal(err)
			}
			if _, err := store.DB.ExecContext(ctx, "CREATE TABLE foreign_data(id INTEGER)"); err != nil {
				t.Fatal(err)
			}
			if _, err := store.DB.ExecContext(ctx, "INSERT INTO foreign_data(id) VALUES(97)"); err != nil {
				t.Fatal(err)
			}
			m, token = unlockManager(t, m, options)
			check, err := m.Verify(ctx, token, input.Database)
			if err != nil || check.ResetAllowed == nil || *check.ResetAllowed {
				t.Fatal("unrecognized database offered for reset", check, err)
			}
			input.ResetDatabase = pointer(true)
			input.DatabaseConfirmation = &check.DatabaseName
			for range 2 {
				if _, _, err = m.Complete(ctx, token, input); !errors.Is(err, ErrTaken) {
					t.Fatal("foreign data reset allowed", err)
				}
			}
			store, err = m.connect(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			var id int
			if err = store.DB.QueryRowContext(ctx, "SELECT id FROM foreign_data").Scan(&id); err != nil || id != 97 {
				t.Fatal("foreign data was modified", err)
			}
		})
	}
}

func TestLegacyInstalledInstanceAdoptsLockAndCorruptionFailsClosed(t *testing.T) {
	ctx := context.Background()
	m, options, token := testManager(t)
	if _, _, err := m.Complete(ctx, token, standaloneInput()); err != nil {
		t.Fatal(err)
	}
	_ = m.Close()
	if err := os.Remove(filepath.Join(options.DataDir, "install.lock")); err != nil {
		t.Fatal(err)
	}
	m.config.LockVersion = 0 // Configuration produced by a release without install.lock.
	if err := m.save(); err != nil {
		t.Fatal(err)
	}
	m, err := Open(ctx, options)
	if err != nil {
		t.Fatal(err)
	}
	if !m.Installed() || m.config.LockVersion != 1 {
		t.Fatal("legacy instance was reopened instead of locked")
	}
	_ = m.Close()
	if err := os.WriteFile(filepath.Join(options.DataDir, "install.lock"), []byte("wrong-instance\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(ctx, options); err == nil {
		t.Fatal("invalid lock reopened installation")
	}
}

func TestLockFinalizationFailureRecoversCommittedDatabase(t *testing.T) {
	ctx := context.Background()
	m, options, token := testManager(t)
	path := filepath.Join(options.DataDir, "install.lock")
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	if _, _, err := m.Complete(ctx, token, standaloneInput()); err == nil {
		t.Fatal("lock write failure was ignored")
	}
	_ = m.Close()
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	m, err := Open(ctx, options)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	if !m.Installed() {
		t.Fatal("committed installation reopened after lock write failure")
	}
	if _, err := os.Stat(m.TokenPath()); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("recovered installation kept a token", err)
	}
}

func TestRemovingLockDuringRuntimeDoesNotUnlockHTTPState(t *testing.T) {
	ctx := context.Background()
	m, options, token := testManager(t)
	if _, _, err := m.Complete(ctx, token, standaloneInput()); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(options.DataDir, "install.lock")); err != nil {
		t.Fatal(err)
	}
	if !m.Installed() {
		t.Fatal("runtime lock deletion changed installed state")
	}
	if _, _, err := m.Complete(ctx, token, standaloneInput()); !errors.Is(err, ErrInstalled) {
		t.Fatal("runtime lock deletion authorized reinstallation", err)
	}
	raw := mustRead(t, filepath.Join(options.DataDir, "installation.json"))
	var config record
	if err := json.Unmarshal(raw, &config); err != nil || config.State != "INSTALLED" {
		t.Fatal("runtime lock deletion changed configuration", err)
	}
}

func TestUnlockedInstallCanUseEmptyTargetAndPreservesOldDatabase(t *testing.T) {
	ctx := context.Background()
	m, options, token := testManager(t)
	if _, _, err := m.Complete(ctx, token, standaloneInput()); err != nil {
		t.Fatal(err)
	}
	original := m.config.Instance
	_ = m.Close()
	archive := filepath.Join(options.DataDir, "original.db")
	if err := os.Rename(filepath.Join(options.DataDir, "unicore.db"), archive); err != nil {
		t.Fatal(err)
	}
	m, token = unlockManager(t, m, options)
	check, err := m.Verify(ctx, token, standaloneInput().Database)
	if err != nil || check.TableCount != 0 || check.ResetAllowed == nil || !*check.ResetAllowed {
		t.Fatal("empty replacement database was rejected", check, err)
	}
	if _, _, err := m.Complete(ctx, token, standaloneInput()); err != nil {
		t.Fatal(err)
	}
	old, err := webdb.Open(ctx, "sqlite", "", archive)
	if err != nil {
		t.Fatal(err)
	}
	defer old.Close()
	_, instance, err := old.Installation(ctx)
	if err != nil || instance != original {
		t.Fatal("original database was modified", err)
	}
}
