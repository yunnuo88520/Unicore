// Author: yunnuo <ymz@ebox.vip>
// Description: Token-gated, crash-recoverable installation with an immutable persisted profile.
package install

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gofrs/flock"
	"github.com/yunnuo/unicore/internal/adapter/blobcloud"
	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	mailadapter "github.com/yunnuo/unicore/internal/adapter/mail"
	oidcadapter "github.com/yunnuo/unicore/internal/adapter/oidc"
	"github.com/yunnuo/unicore/internal/adapter/storage/filesql"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/branding"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/secret"
	"github.com/yunnuo/unicore/internal/settings"
)

var (
	ErrInstalled = errors.New("installation is already complete")
	ErrToken     = errors.New("invalid bootstrap token")
	ErrInput     = errors.New("invalid installation input")
	ErrDatabase  = errors.New("database connection or migration failed")
	ErrTaken     = errors.New("database is already initialized; restore its original configuration")
	ErrNotEmpty  = errors.New("database reset requires explicit confirmation")
)

type Options struct{ DataDir, Profile, SecretKey, BootstrapToken, AdminPath string }
type record struct {
	OwnsSchema bool              `json:"owns_schema"`
	State      string            `json:"state"`
	Profile    contracts.Profile `json:"profile"`
	Instance   string            `json:"instance"`
	Driver     string            `json:"driver"`
	DSN        string            `json:"dsn_encrypted"`
	TokenHash  string            `json:"bootstrap_hash"`
	BaseURL    string            `json:"base_url"`
}
type Manager struct {
	mu             sync.RWMutex
	directory      string
	config         record
	secret         *secret.Store
	lock           *flock.Flock
	store          *sqlstore.Store
	settingService *settings.Service
	identity       *platform.Service
	administrator  *platform.Service
	adminAccounts  *platform.Accounts
	adminOIDC      *platform.OIDC
	accounts       *platform.Accounts
	oidc           *platform.OIDC
	mail           *mailer.Service
	files          *files.Service
	adminOverride  string
}

func Open(ctx context.Context, options Options) (manager *Manager, err error) {
	directory, err := filepath.Abs(options.DataDir)
	if err != nil {
		return nil, err
	}
	if err = os.MkdirAll(directory, 0700); err != nil {
		return nil, err
	}
	lock := flock.New(filepath.Join(directory, "instance.lock"))
	locked, err := lock.TryLock()
	if err != nil {
		return nil, err
	}
	if !locked {
		return nil, errors.New("data directory is already in use")
	}
	m := &Manager{directory: directory, lock: lock, adminOverride: options.AdminPath}
	defer func() {
		if err != nil {
			_ = m.Close()
		}
	}()
	if options.AdminPath != "" && !settings.ValidAdminPath(options.AdminPath) {
		return nil, ErrInput
	}
	m.secret, err = secret.Open(directory, options.SecretKey)
	if err != nil {
		return nil, err
	}
	data, readErr := os.ReadFile(filepath.Join(directory, "installation.json"))
	if errors.Is(readErr, os.ErrNotExist) {
		if _, dbErr := os.Stat(filepath.Join(directory, "unicore.db")); dbErr == nil {
			return nil, ErrTaken
		}
		profile := options.Profile
		if profile == "" {
			profile = runtime.DefaultWebProfile
		}
		parsed, e := runtime.ParseWebProfile(profile)
		if e != nil {
			return nil, e
		}
		m.config = record{State: "UNINITIALIZED", Profile: parsed, Instance: sqlstore.ID(), Driver: "sqlite"}
	} else if readErr != nil {
		return nil, readErr
	} else if err = json.Unmarshal(data, &m.config); err != nil {
		return nil, errors.New("invalid installation configuration")
	}
	if _, err = runtime.ParseWebProfile(string(m.config.Profile)); err != nil {
		return nil, err
	}
	if m.config.State != "UNINITIALIZED" && m.config.State != "INSTALLING" && m.config.State != "INSTALL_FAILED" && m.config.State != "INSTALLED" {
		return nil, errors.New("invalid installation state")
	}
	if m.config.State != "UNINITIALIZED" {
		if err = m.recover(ctx); err != nil {
			return nil, err
		}
	}
	if m.config.State == "INSTALLED" {
		if options.Profile != "" && options.Profile != string(m.config.Profile) {
			return nil, errors.New("installed profile cannot be changed; use a separate deployment and migration")
		}
		_ = os.Remove(filepath.Join(directory, "bootstrap.token"))
		return m, nil
	}
	token := strings.TrimSpace(options.BootstrapToken)
	if token == "" {
		if data, e := os.ReadFile(filepath.Join(directory, "bootstrap.token")); e == nil {
			token = strings.TrimSpace(string(data))
		}
	}
	if token == "" {
		token = platform.Token()
	}
	if len(token) < 32 || len(token) > 256 {
		return nil, errors.New("bootstrap token must contain 32 to 256 characters")
	}
	m.config.TokenHash = platform.Hash(token)
	if err = secret.AtomicWrite(filepath.Join(directory, "bootstrap.token"), []byte(token+"\n")); err != nil {
		return nil, err
	}
	if err = m.save(); err != nil {
		return nil, err
	}
	return m, nil
}

func (m *Manager) save() error {
	data, err := json.MarshalIndent(m.config, "", "  ")
	if err != nil {
		return err
	}
	return secret.AtomicWrite(filepath.Join(m.directory, "installation.json"), append(data, '\n'))
}
func (m *Manager) connect(ctx context.Context) (*sqlstore.Store, error) {
	dsn := ""
	if m.config.DSN != "" {
		var err error
		dsn, err = m.secret.Open(m.config.DSN)
		if err != nil {
			return nil, err
		}
	}
	return webdb.Open(ctx, m.config.Driver, dsn, filepath.Join(m.directory, "unicore.db"))
}
func (m *Manager) attach(store *sqlstore.Store) {
	m.store = store
	m.settingService = &settings.Service{Store: store, Profile: m.config.Profile, Secrets: m.secret, Branding: nil}
	if m.config.Profile == runtime.WebPlatform {
		m.files = &files.Service{Repo: &filesql.Repository{Store: store}, Settings: m.settingService, Secrets: m.secret, Activate: m.settingService.SetStorageActive, Factory: func(l files.Location, c files.Credentials) (blob.Store, error) {
			if l.Provider == "local" {
				folder := "files"
				if l.ID == "legacy-brand" {
					folder = "brand-assets"
				}
				return bloblocal.New(filepath.Join(m.directory, folder)), nil
			}
			return blobcloud.New(blobcloud.Config{Provider: l.Provider, Endpoint: l.Endpoint, Bucket: l.Bucket, Region: l.Region, Prefix: l.Prefix, PathStyle: l.PathStyle, AccessKey: c.AccessKey, SecretKey: c.SecretKey})
		}}
		m.settingService.Branding = branding.New(store, m.files.BrandStore())
		repository := &platformsql.Repository{Store: store}
		admins := &platformsql.Repository{Store: store, Administrators: true}
		m.identity = platform.New(repository)
		m.administrator = platform.New(admins)
		m.mail = &mailer.Service{Store: repository, Settings: m.settingService, Secrets: m.secret, Sender: mailadapter.SMTP{}}
		m.accounts = &platform.Accounts{Identity: m.identity, Store: repository, Settings: m.settingService, Mail: m.mail, BaseURL: m.config.BaseURL}
		m.adminAccounts = &platform.Accounts{Administrator: true, Identity: m.administrator, Store: admins, Settings: m.settingService, Mail: m.mail, BaseURL: m.config.BaseURL}
		m.oidc = &platform.OIDC{Identity: m.identity, Store: repository, Settings: m.settingService, Secrets: m.secret, Provider: oidcadapter.Provider{}, BaseURL: m.config.BaseURL}
		m.adminOIDC = &platform.OIDC{Identity: m.administrator, Store: admins, Settings: m.settingService, Secrets: m.secret, Provider: oidcadapter.Provider{}, BaseURL: m.config.BaseURL, CallbackPath: "/api/v1/admin/auth/oidc/callback"}
	}
}
func (m *Manager) recover(ctx context.Context) error {
	if !m.config.OwnsSchema {
		if m.config.State == "INSTALLED" {
			return ErrTaken
		}
		m.config.State = "INSTALL_FAILED"
		return m.save()
	}
	store, err := m.connect(ctx)
	if err != nil {
		if m.config.State == "INSTALLED" {
			return ErrDatabase
		}
		m.config.State = "INSTALL_FAILED"
		return m.save()
	}
	exists, checkErr := store.HasInstallationTable(ctx)
	if checkErr != nil {
		_ = store.Close()
		return ErrDatabase
	}
	if exists {
		profile, instance, markerErr := store.Installation(ctx)
		if m.config.State == "INSTALLED" && markerErr != nil {
			_ = store.Close()
			return ErrTaken
		}
		if markerErr == nil && (profile != string(m.config.Profile) || instance != m.config.Instance) {
			_ = store.Close()
			return ErrTaken
		}
	}
	if !exists && m.config.State == "INSTALLED" {
		_ = store.Close()
		return ErrTaken
	}
	if err = store.Migrate(ctx, m.config.Profile == runtime.WebPlatform); err != nil {
		_ = store.Close()
		if m.config.State == "INSTALLED" {
			return ErrDatabase
		}
		m.config.State = "INSTALL_FAILED"
		return m.save()
	}
	profile, instance, err := store.Installation(ctx)
	if err == nil {
		if profile != string(m.config.Profile) || instance != m.config.Instance {
			_ = store.Close()
			return ErrTaken
		}
		m.config.State = "INSTALLED"
		m.config.TokenHash = ""
		m.attach(store)
		return m.save()
	}
	_ = store.Close()
	if m.config.State == "INSTALLED" {
		return ErrTaken
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return ErrDatabase
	}
	m.config.State = "INSTALL_FAILED"
	return m.save()
}
func (m *Manager) Close() error {
	if m.store != nil {
		_ = m.store.Close()
	}
	if m.lock != nil {
		return m.lock.Unlock()
	}
	return nil
}
func (m *Manager) TokenPath() string { return filepath.Join(m.directory, "bootstrap.token") }
func (m *Manager) Installed() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.config.State == "INSTALLED"
}
func (m *Manager) Services() (*sqlstore.Store, *settings.Service, *platform.Service, contracts.Profile) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.store, m.settingService, m.identity, m.config.Profile
}
func (m *Manager) BaseURL() string      { m.mu.RLock(); defer m.mu.RUnlock(); return m.config.BaseURL }
func (m *Manager) OIDC() *platform.OIDC { m.mu.RLock(); defer m.mu.RUnlock(); return m.oidc }
func (m *Manager) AdminPath(ctx context.Context) string {
	if m.adminOverride != "" {
		return m.adminOverride
	}
	_, service, _, _ := m.Services()
	if service != nil {
		if path, err := service.Value(ctx, "admin.path"); err == nil {
			return path
		}
	}
	return "/admin"
}
func (m *Manager) Status() contracts.InstallStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return contracts.InstallStatus{Status: m.config.State, Profile: m.config.Profile, DatabaseOptions: []string{"mysql", "postgres", "sqlite"}, Checks: []contracts.EnvironmentCheck{{Name: "数据目录", Ok: true, Detail: "可写，安装信息在此持久化；重启自动恢复"}, {Name: "安装保护", Ok: true, Detail: "服务器已自动生成一次性安装凭据，与加密密钥独立"}}}
}
func (m *Manager) authorized(token string) error {
	if m.config.State == "INSTALLED" {
		return ErrInstalled
	}
	if !platform.Equal(platform.Hash(token), m.config.TokenHash) {
		return ErrToken
	}
	return nil
}
func (m *Manager) RotateToken(token string) (contracts.InstallToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.authorized(token); err != nil {
		return contracts.InstallToken{}, err
	}
	next := platform.Token()
	if err := secret.AtomicWrite(m.TokenPath(), []byte(next+"\n")); err != nil {
		return contracts.InstallToken{}, err
	}
	previous := m.config.TokenHash
	m.config.TokenHash = platform.Hash(next)
	if err := m.save(); err != nil {
		m.config.TokenHash = previous
		_ = secret.AtomicWrite(m.TokenPath(), []byte(token+"\n"))
		return contracts.InstallToken{}, err
	}
	return contracts.InstallToken{Token: next}, nil
}
func (m *Manager) Verify(ctx context.Context, token string, input contracts.DatabaseInput) (contracts.DatabaseCheck, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := contracts.DatabaseCheck{}
	if err := m.authorized(token); err != nil {
		return result, err
	}
	dsn, name, err := webdb.Resolve(input)
	if err != nil {
		return result, ErrInput
	}
	store, err := webdb.Open(ctx, input.Driver, dsn, filepath.Join(m.directory, "unicore.db"))
	if err != nil {
		return result, ErrDatabase
	}
	defer store.Close()
	if err = store.InstallationScope(ctx); err != nil {
		return result, ErrDatabase
	}
	result.DatabaseName = name
	result.TableCount, err = store.TableCount(ctx)
	if err != nil {
		return result, ErrDatabase
	}
	exists, err := store.HasInstallationTable(ctx)
	if err != nil {
		return result, ErrDatabase
	}
	if exists {
		_, _, err = store.Installation(ctx)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return result, ErrDatabase
		}
		result.Initialized = err == nil
	}
	result.Success = true
	return result, nil
}

func (m *Manager) Complete(ctx context.Context, token string, input contracts.InstallInput) (contracts.InstallResult, contracts.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := contracts.InstallResult{}
	user := contracts.User{}
	if err := m.authorized(token); err != nil {
		return result, user, err
	}
	if (input.Profile != runtime.WebPlatform && input.Profile != runtime.WebStandalone) || !settings.ValidBaseURL(input.BaseUrl) || strings.TrimSpace(input.SiteName) == "" || len(input.SiteName) > 192 {
		return result, user, ErrInput
	}
	dsn, databaseName, err := webdb.Resolve(input.Database)
	if err != nil {
		return result, user, ErrInput
	}
	reset := input.ResetDatabase != nil && *input.ResetDatabase
	if reset && (input.DatabaseConfirmation == nil || *input.DatabaseConfirmation != databaseName) {
		return result, user, ErrInput
	}
	input.AdminUsername = strings.ToLower(strings.TrimSpace(input.AdminUsername))
	input.AdminEmail = strings.ToLower(strings.TrimSpace(input.AdminEmail))
	hash := ""
	if input.Profile == runtime.WebPlatform {
		if !platform.ValidateAccount(input.AdminUsername, input.AdminEmail, input.AdminPassword) {
			return result, user, ErrInput
		}
		var err error
		hash, err = platform.HashPassword(input.AdminPassword)
		if err != nil {
			return result, user, err
		}
	}
	previousDSN := ""
	if m.config.DSN != "" {
		var err error
		previousDSN, err = m.secret.Open(m.config.DSN)
		if err != nil {
			return result, user, err
		}
	}
	resume := m.config.OwnsSchema && m.config.State != "UNINITIALIZED" && m.config.Driver == input.Database.Driver && previousDSN == dsn && m.config.Profile == input.Profile
	m.config.OwnsSchema = resume
	m.config.Profile = input.Profile
	m.config.Driver = input.Database.Driver
	m.config.DSN = m.secret.Seal(dsn)
	m.config.BaseURL = strings.TrimRight(input.BaseUrl, "/")
	m.config.State = "INSTALLING"
	if err := m.save(); err != nil {
		m.config.State = "INSTALL_FAILED"
		return result, user, err
	}
	store, err := m.connect(ctx)
	if err != nil {
		m.config.State = "INSTALL_FAILED"
		_ = m.save()
		return result, user, ErrDatabase
	}
	success := false
	defer func() {
		if !success {
			_ = store.Close()
			m.config.State = "INSTALL_FAILED"
			_ = m.save()
		}
	}()
	if err = store.InstallationScope(ctx); err != nil {
		return result, user, ErrDatabase
	}
	exists, inspectErr := store.HasInstallationTable(ctx)
	if inspectErr != nil {
		return result, user, ErrDatabase
	}
	if exists {
		_, _, markerErr := store.Installation(ctx)
		if markerErr == nil {
			return result, user, ErrTaken
		}
		if !errors.Is(markerErr, sql.ErrNoRows) {
			return result, user, ErrDatabase
		}
	}
	if !resume {
		count, countErr := store.TableCount(ctx)
		if countErr != nil {
			return result, user, ErrDatabase
		}
		if count != 0 {
			if !reset {
				return result, user, ErrNotEmpty
			}
			// OwnsSchema remains false until reset succeeds. A crash/partial MySQL
			// reset must require another explicit installer confirmation on retry.
			if err = store.Reset(ctx); err != nil {
				return result, user, ErrDatabase
			}
		}
	}
	m.config.OwnsSchema = true
	if err = m.save(); err != nil {
		return result, user, err
	}
	if err = store.Migrate(ctx, input.Profile == runtime.WebPlatform); err != nil {
		return result, user, ErrDatabase
	}
	if _, _, err = store.Installation(ctx); err == nil {
		return result, user, ErrTaken
	} else if !errors.Is(err, sql.ErrNoRows) {
		return result, user, ErrDatabase
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		return result, user, ErrDatabase
	}
	defer tx.Rollback()
	if _, err = store.Exec(ctx, tx, "INSERT INTO install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,?)", string(input.Profile), m.config.Instance, time.Now().Unix()); err != nil {
		return result, user, ErrTaken
	}
	for key, value := range settings.Defaults(input.Profile) {
		if key == "site.name" {
			value = input.SiteName
		}
		if _, err = store.Exec(ctx, tx, "INSERT INTO system_settings(setting_key,setting_value) VALUES(?,?)", key, value); err != nil {
			return result, user, ErrDatabase
		}
	}
	if input.Profile == runtime.WebPlatform {
		repository := platformsql.Repository{Store: store, Administrators: true}
		user, err = repository.Seed(ctx, tx, contracts.UserCreate{Username: input.AdminUsername, Email: input.AdminEmail, Role: "super_admin"}, hash)
		if err != nil {
			return result, user, ErrDatabase
		}
	}
	if err = store.Audit(ctx, tx, "bootstrap", "install.completed"); err != nil {
		return result, user, ErrDatabase
	}
	if err = tx.Commit(); err != nil {
		return result, user, ErrDatabase
	}
	success = true
	m.config.State = "INSTALLED"
	m.config.TokenHash = ""
	m.attach(store)
	// The DB marker is authoritative even when local finalization fails; restart recovers it.
	if err = m.save(); err != nil {
		return result, user, errors.New("installation committed; free disk space and restart to finalize configuration")
	}
	_ = os.Remove(m.TokenPath())
	result = contracts.InstallResult{Profile: input.Profile, SiteUrl: m.config.BaseURL + "/", SettingsUrl: m.config.BaseURL + "/settings"}
	if input.Profile == runtime.WebPlatform {
		result.AdminUrl = m.config.BaseURL + "/admin"
	}
	return result, user, nil
}

func (m *Manager) Accounts() *platform.Accounts {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.accounts
}
func (m *Manager) Mail() *mailer.Service { m.mu.RLock(); defer m.mu.RUnlock(); return m.mail }

// Identity scope is selected by the explicit entry/header, never by a fallback account lookup.
func (m *Manager) Identity(admin bool) *platform.Service {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if admin {
		return m.administrator
	}
	return m.identity
}
func (m *Manager) AccountService(admin bool) *platform.Accounts {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if admin {
		return m.adminAccounts
	}
	return m.accounts
}
func (m *Manager) OIDCService(admin bool) *platform.OIDC {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if admin {
		return m.adminOIDC
	}
	return m.oidc
}

func (m *Manager) Files() *files.Service { m.mu.RLock(); defer m.mu.RUnlock(); return m.files }
