// Author: yunnuo <ymz@ebox.vip>
// Description: Real DB installation/restart, rollback and one-time token behavior.
package install

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

func testManager(t *testing.T) (*Manager, Options, string) {
	t.Helper()
	options := Options{DataDir: t.TempDir()}
	m, err := Open(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.Close() })
	raw, err := os.ReadFile(m.TokenPath())
	if err != nil {
		t.Fatal(err)
	}
	return m, options, strings.TrimSpace(string(raw))
}
func standaloneInput() contracts.InstallInput {
	return contracts.InstallInput{Profile: "web-standalone", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "My workspace", BaseUrl: "http://localhost:8080"}
}

func TestStandaloneInstallOnceAndRestart(t *testing.T) {
	ctx := context.Background()
	m, options, token := testManager(t)
	input := standaloneInput()
	if _, _, err := m.Complete(ctx, "bad", input); !errors.Is(err, ErrToken) {
		t.Fatal(err)
	}
	if _, _, err := m.Complete(ctx, token, input); err != nil {
		t.Fatal(err)
	}
	if !m.Installed() {
		t.Fatal("must be installed")
	}
	if _, err := os.Stat(m.TokenPath()); !os.IsNotExist(err) {
		t.Fatal("token file must be removed")
	}
	store, service, identity, _ := m.Services()
	if identity != nil {
		t.Fatal("standalone loaded identity")
	}
	var count int
	if err := store.Row(ctx, store.DB, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'").Scan(&count); err != nil || count != 0 {
		t.Fatal("standalone created users")
	}
	if _, err := service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "site.name", Value: "Persistent"}}}, "local"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "security.login_captcha", Value: "false"}}}, "local"); err == nil {
		t.Fatal("platform setting allowed in standalone")
	}
	if _, _, err := m.Complete(ctx, token, input); !errors.Is(err, ErrInstalled) {
		t.Fatal(err)
	}
	if _, err := Open(ctx, options); err == nil {
		t.Fatal("second process must not acquire data directory")
	}
	_ = m.Close()
	reopened, err := Open(ctx, options)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	_, settings, _, _ := reopened.Services()
	if value, _ := settings.Value(ctx, "site.name"); value != "Persistent" {
		t.Fatal(value)
	}
	_ = reopened.Close()
	options.Profile = "web-platform"
	if _, err := Open(ctx, options); err == nil {
		t.Fatal("installed profile changed")
	}
}

func TestConcurrentInstallCreatesOneMarker(t *testing.T) {
	m, _, token := testManager(t)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, err := m.Complete(context.Background(), token, standaloneInput())
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrInstalled) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("success %d conflict %d", success, conflict)
	}
}

func TestRecoverCommittedInstallationAndEncryptedDSN(t *testing.T) {
	ctx := context.Background()
	m, options, token := testManager(t)
	if _, _, err := m.Complete(ctx, token, standaloneInput()); err != nil {
		t.Fatal(err)
	}
	_ = m.Close()
	path := filepath.Join(options.DataDir, "installation.json")
	raw, _ := os.ReadFile(path)
	var config record
	_ = json.Unmarshal(raw, &config)
	config.State = "INSTALLING"
	data, _ := json.Marshal(config)
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	recovered, err := Open(ctx, options)
	if err != nil {
		t.Fatal(err)
	}
	defer recovered.Close()
	if !recovered.Installed() {
		t.Fatal("committed DB was not recovered")
	}
	if _, _, err := recovered.Complete(ctx, token, standaloneInput()); !errors.Is(err, ErrInstalled) {
		t.Fatal(err)
	}
}

func TestFailedMigrationDoesNotCreatePartialAdministrator(t *testing.T) {
	m, options, token := testManager(t)
	input := standaloneInput()
	input.Profile = "web-platform"
	input.AdminUsername = "admin"
	input.AdminEmail = "admin@example.test"
	input.AdminPassword = platform.Token()
	// Force a schema failure with a conflicting pre-existing object; no user or marker may commit.
	if err := m.Verify(context.Background(), token, input.Database); err != nil {
		t.Fatal(err)
	}
	store, err := m.connect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.DB.Exec("CREATE VIEW users AS SELECT 1 AS id")
	if err != nil {
		t.Fatal(err)
	}
	_ = store.Close()
	m.config.State = "INSTALL_FAILED" // Existing partial schema is owned by this interrupted attempt.
	m.config.Profile = "web-platform"
	m.config.OwnsSchema = true
	if _, _, err = m.Complete(context.Background(), token, input); err == nil {
		t.Fatal("expected schema failure")
	}
	if m.Installed() {
		t.Fatal("failed installation marked installed")
	}
	_ = m.Close()
	recovered, err := Open(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	defer recovered.Close()
	if recovered.Installed() {
		t.Fatal("failed install became installed after restart")
	}
}

func TestForeignDatabaseIsRejectedBeforeMigration(t *testing.T) {
	m, _, token := testManager(t)
	ctx := context.Background()
	if err := m.Verify(ctx, token, contracts.DatabaseInput{Driver: "sqlite"}); err != nil {
		t.Fatal(err)
	}
	store, err := m.connect(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.DB.Exec("CREATE TABLE foreign_data(id INTEGER)"); err != nil {
		t.Fatal(err)
	}
	_ = store.Close()
	if _, _, err = m.Complete(ctx, token, standaloneInput()); !errors.Is(err, ErrTaken) {
		t.Fatal("existing DB was not rejected", err)
	}
	if _, _, err = m.Complete(ctx, token, standaloneInput()); !errors.Is(err, ErrTaken) {
		t.Fatal("retry acquired foreign DB", err)
	}
	store, err = m.connect(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	exists, err := store.HasInstallationTable(ctx)
	if err != nil || exists {
		t.Fatal("foreign database was changed")
	}
}
