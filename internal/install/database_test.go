// Author: yunnuo <ymz@ebox.vip>
// Description: Three-dialect installer fields, reset consent, encrypted persistence and repeated restart.
package install

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
)

func pointer[T any](value T) *T { return &value }
func installDatabase(t *testing.T, driver string) contracts.DatabaseInput {
	t.Helper()
	input := contracts.DatabaseInput{Driver: driver}
	if driver == "sqlite" {
		return input
	}
	dsn := os.Getenv("UNICORE_INSTALL_TEST_" + strings.ToUpper(driver) + "_DSN")
	if dsn == "" {
		t.Skip("isolated installer database not provided")
	}
	input.Tls = pointer("disable")
	if driver == "mysql" {
		c, err := mysql.ParseDSN(dsn)
		if err != nil {
			t.Fatal("test database config invalid")
		}
		host, port, err := net.SplitHostPort(c.Addr)
		if err != nil {
			t.Fatal(err)
		}
		number, _ := strconv.Atoi(port)
		input.Host, input.Port, input.Name, input.Username, input.Password = &host, &number, &c.DBName, &c.User, &c.Passwd
	} else {
		c, err := pgx.ParseConfig(dsn)
		if err != nil {
			t.Fatal("test database config invalid")
		}
		input.Host, input.Port, input.Name, input.Username, input.Password = &c.Host, pointer(int(c.Port)), &c.Database, &c.User, &c.Password
	}
	return input
}
func TestDatabaseFieldsResetAndRestart(t *testing.T) {
	for _, driver := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			ctx := context.Background()
			input := standaloneInput()
			input.Database = installDatabase(t, driver)
			input.Profile = "web-platform"
			input.AdminUsername = "admin"
			input.AdminEmail = "admin@example.test"
			input.AdminPassword = "test-password-strong"
			m, options, token := testManager(t)
			dsn, name, err := webdb.Resolve(input.Database)
			if err != nil {
				t.Fatal(err)
			}
			store, err := webdb.Open(ctx, driver, dsn, filepath.Join(options.DataDir, "unicore.db"))
			if err != nil {
				t.Fatal(err)
			}
			if count, err := store.TableCount(ctx); err != nil || count != 0 {
				t.Fatal("installer test database must be empty", count, err)
			}
			if driver == "postgres" {
				// pgx_extra is a user schema, not a reserved pg_ schema.
				if _, err = store.DB.ExecContext(ctx, "CREATE SCHEMA pgx_extra"); err != nil {
					t.Fatal(err)
				}
				if _, err = m.Verify(ctx, token, input.Database); !errors.Is(err, ErrDatabase) {
					t.Fatal("installer accepted a database with another user schema", err)
				}
				if _, err = store.DB.ExecContext(ctx, "DROP SCHEMA pgx_extra"); err != nil {
					t.Fatal(err)
				}
			}
			for _, query := range []string{"CREATE TABLE old_parent (id INTEGER PRIMARY KEY)", "INSERT INTO old_parent(id) VALUES(19)", "CREATE TABLE old_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES old_parent(id))", "INSERT INTO old_child(id,parent_id) VALUES(1,19)", "CREATE VIEW old_view AS SELECT id FROM old_parent"} {
				if _, err = store.DB.ExecContext(ctx, query); err != nil {
					t.Fatal(err)
				}
			}
			_ = store.Close()
			check, err := m.Verify(ctx, token, input.Database)
			if err != nil || !check.Success || check.DatabaseName != name || check.TableCount != 3 || check.Initialized {
				t.Fatal("connection/inspection failed", check, err)
			}
			if _, _, err = m.Complete(ctx, "wrong", input); !errors.Is(err, ErrToken) {
				t.Fatal("reset lacked installer authorization", err)
			}
			if _, _, err = m.Complete(ctx, token, input); !errors.Is(err, ErrNotEmpty) {
				t.Fatal("implicit reset allowed", err)
			}
			input.ResetDatabase = pointer(true)
			input.DatabaseConfirmation = pointer("wrong-name")
			if _, _, err = m.Complete(ctx, token, input); !errors.Is(err, ErrInput) {
				t.Fatal("target confirmation bypass", err)
			}
			store, err = webdb.Open(ctx, driver, dsn, filepath.Join(options.DataDir, "unicore.db"))
			if err != nil {
				t.Fatal(err)
			}
			var kept int
			if err = store.DB.QueryRowContext(ctx, "SELECT id FROM old_parent").Scan(&kept); err != nil || kept != 19 {
				t.Fatal("data changed without confirmation", err)
			}
			_ = store.Close()
			input.DatabaseConfirmation = &name
			if _, _, err = m.Complete(ctx, token, input); err != nil {
				t.Fatal("confirmed installation failed", err)
			}
			store, settings, identity, _ := m.Services()
			identity = m.Identity(true)
			account, err := identity.Store.FindAccount(ctx, "admin")
			if err != nil {
				t.Fatal(err)
			}
			adminID := account.User.ID
			if _, err = store.DB.ExecContext(ctx, "SELECT * FROM old_view"); err == nil {
				t.Fatal("legacy data/view survived reset")
			}
			if _, err = settings.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "site.name", Value: "Persistent installation"}}}, adminID); err != nil {
				t.Fatal(err)
			}
			check, err = m.Verify(ctx, token, input.Database)
			if !errors.Is(err, ErrInstalled) {
				t.Fatal("installed connection endpoint still open", check, err)
			}
			raw, err := os.ReadFile(filepath.Join(options.DataDir, "installation.json"))
			if err != nil {
				t.Fatal(err)
			}
			if input.Database.Password != nil && *input.Database.Password != "" && strings.Contains(string(raw), *input.Database.Password) {
				t.Fatal("database password persisted in plaintext")
			}
			var saved record
			if err = json.Unmarshal(raw, &saved); err != nil || saved.State != "INSTALLED" || saved.TokenHash != "" {
				t.Fatal("installation not durable", err)
			}
			for range 2 {
				_ = m.Close()
				m, err = Open(ctx, options)
				if err != nil {
					t.Fatal("restart failed", err)
				}
				if !m.Installed() {
					t.Fatal("restart returned to installer")
				}
				store, settings, identity, _ = m.Services()
				identity = m.Identity(true)
				current, err := identity.Store.FindAccount(ctx, "admin")
				if err != nil || current.User.ID != adminID {
					t.Fatal("administrator recreated on restart", err)
				}
				if site, _ := settings.Value(ctx, "site.name"); site != "Persistent installation" {
					t.Fatal("configuration lost")
				}
				if _, _, err = m.Complete(ctx, token, input); !errors.Is(err, ErrInstalled) {
					t.Fatal("reinstallation accepted", err)
				}
			}
			defer m.Close()
			// A fresh data directory must never erase an already-installed external database.
			if driver != "sqlite" {
				other, _, otherToken := testManager(t)
				if _, _, err = other.Complete(ctx, otherToken, input); !errors.Is(err, ErrTaken) {
					t.Fatal("installed database reset allowed", err)
				}
			}
		})
	}
}
func TestRotateInstallationCredential(t *testing.T) {
	ctx := context.Background()
	m, options, token := testManager(t)
	if _, err := m.RotateToken(""); !errors.Is(err, ErrToken) {
		t.Fatal("anonymous rotation allowed", err)
	}
	next, err := m.RotateToken(token)
	if err != nil || next.Token == token || len(next.Token) < 32 {
		t.Fatal("credential not rotated", err)
	}
	if _, err = m.Verify(ctx, token, contracts.DatabaseInput{Driver: "sqlite"}); !errors.Is(err, ErrToken) {
		t.Fatal("old token survived", err)
	}
	_ = m.Close()
	reopened, err := Open(ctx, options)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if _, err = reopened.Verify(ctx, next.Token, contracts.DatabaseInput{Driver: "sqlite"}); err != nil {
		t.Fatal("new token not persisted", err)
	}
	if raw, _ := json.Marshal(reopened.Status()); strings.Contains(string(raw), next.Token) {
		t.Fatal("status leaked token")
	}
	if _, _, err = reopened.Complete(ctx, next.Token, standaloneInput()); err != nil {
		t.Fatal(err)
	}
	if _, err = reopened.RotateToken(next.Token); !errors.Is(err, ErrInstalled) {
		t.Fatal("installed token rotation accepted", err)
	}
}
func TestMissingInstalledDatabaseNeverReinstalls(t *testing.T) {
	for _, missing := range []string{"database", "table", "marker"} {
		t.Run(missing, func(t *testing.T) {
			ctx := context.Background()
			m, options, token := testManager(t)
			if _, _, err := m.Complete(ctx, token, standaloneInput()); err != nil {
				t.Fatal(err)
			}
			if missing != "database" {
				query := "DELETE FROM install_state"
				if missing == "table" {
					query = "DROP TABLE install_state"
				}
				store, _, _, _ := m.Services()
				if _, err := store.DB.ExecContext(ctx, query); err != nil {
					t.Fatal(err)
				}
			}
			_ = m.Close()
			if missing == "database" {
				if err := os.Remove(filepath.Join(options.DataDir, "unicore.db")); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := Open(ctx, options); !errors.Is(err, ErrTaken) {
				t.Fatal("missing installation state silently reinitialized", err)
			}
		})
	}
}
