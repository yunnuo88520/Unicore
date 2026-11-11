// Author: yunnuo <ymz@ebox.vip>
// Description: Existing-instance-only, locked offline repairs with encrypted configuration and scoped identities.
package webmanage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofrs/flock"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/secret"
	"github.com/yunnuo/unicore/internal/settings"
)

type instance struct {
	directory                                         string
	raw                                               map[string]json.RawMessage
	state, profile, driver, identity, base, encrypted string
	key                                               *secret.Store
	lock                                              *flock.Flock
	db                                                *sqlstore.Store
}

func (i *instance) close() {
	if i.db != nil {
		_ = i.db.Close()
	}
	if i.lock != nil {
		_ = i.lock.Unlock()
	}
}
func regular(path string) error {
	info, e := os.Lstat(path)
	if e != nil {
		return e
	}
	if !info.Mode().IsRegular() {
		return errors.New("expected an existing regular file: " + path)
	}
	return nil
}
func inspect(directory string) (*instance, error) {
	info, e := os.Lstat(directory)
	if e != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("instance directory does not exist or is not a regular directory; no instance was created")
	}
	path := filepath.Join(directory, "installation.json")
	if e = regular(path); e != nil {
		return nil, errors.New("installation.json is missing or invalid; select the existing instance")
	}
	raw, e := os.ReadFile(path)
	if e != nil {
		return nil, e
	}
	i := &instance{directory: directory}
	if e = json.Unmarshal(raw, &i.raw); e != nil {
		return nil, errors.New("invalid installation record")
	}
	for k, v := range map[string]*string{"state": &i.state, "profile": &i.profile, "driver": &i.driver, "instance": &i.identity, "base_url": &i.base, "dsn_encrypted": &i.encrypted} {
		if e = json.Unmarshal(i.raw[k], v); e != nil {
			return nil, errors.New("invalid installation record")
		}
	}
	return i, nil
}
func openInstance(directory, external string) (*instance, error) {
	i, e := inspect(directory)
	if e != nil {
		return nil, e
	}
	if i.state != "INSTALLED" || i.identity == "" || (i.profile != "web-platform" && i.profile != "web-standalone") {
		return nil, errors.New("operation requires a completed Web installation")
	}
	if e = regular(filepath.Join(directory, "install.lock")); e != nil {
		return nil, errors.New("installation lock is missing; restore it before maintenance")
	}
	if e = regular(filepath.Join(directory, "instance.lock")); e != nil {
		return nil, errors.New("instance lock is missing")
	}
	i.lock = flock.New(filepath.Join(directory, "instance.lock"))
	locked, e := i.lock.TryLock()
	if e != nil || !locked {
		return nil, errors.New("stop the running instance before this operation (unicore stop or Docker stop)")
	}
	if external == "" {
		if e = regular(filepath.Join(directory, "secret.key")); e != nil {
			i.close()
			return nil, errors.New("original instance key is required; no key was generated")
		}
	}
	i.key, e = secret.Open(directory, external)
	if e != nil {
		i.close()
		return nil, e
	}
	return i, nil
}
func (i *instance) connect(ctx context.Context, dsn string) (*sqlstore.Store, error) {
	if i.driver == "sqlite" {
		if e := regular(filepath.Join(i.directory, "unicore.db")); e != nil {
			return nil, errors.New("installed SQLite database is missing; refusing to create an empty database")
		}
	}
	db, e := webdb.Open(ctx, i.driver, dsn, filepath.Join(i.directory, "unicore.db"))
	if e != nil {
		return nil, errors.New("database connection failed; check credentials, network and TLS")
	}
	profile, id, e := db.Installation(ctx)
	if e != nil || profile != i.profile || id != i.identity {
		_ = db.Close()
		return nil, errors.New("target database does not match this installed instance; configuration was not changed")
	}
	return db, nil
}
func (i *instance) save(key, value string) error {
	raw, _ := json.Marshal(value)
	i.raw[key] = raw
	data, e := json.MarshalIndent(i.raw, "", "  ")
	if e != nil {
		return e
	}
	return secret.AtomicWrite(filepath.Join(i.directory, "installation.json"), append(data, '\n'))
}
func instanceCommand(ctx context.Context, command string, o options, c Console) error {
	web, source, e := resolve(o, c)
	if e != nil {
		return e
	}
	fmt.Fprintln(c.Err, "实例目录 / Instance:", web.DataDir)
	if command == "status" {
		i, e := inspect(web.DataDir)
		if e != nil {
			return e
		}
		running := false
		if regular(filepath.Join(web.DataDir, "instance.lock")) == nil {
			lock := flock.New(filepath.Join(web.DataDir, "instance.lock"))
			acquired, err := lock.TryLock()
			if err != nil {
				return err
			}
			running = !acquired
			if acquired {
				_ = lock.Unlock()
			}
		}
		return c.emit(map[string]any{"state": i.state, "profile": i.profile, "driver": i.driver, "data_dir": i.directory, "running": running, "configuration": source, "base_url": i.base})
	}
	i, e := openInstance(web.DataDir, c.Getenv("APP_SECRET_KEY"))
	if e != nil {
		return e
	}
	defer i.close()
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	ctx = audit.With(ctx, audit.Metadata{ActorName: "OS owner", Realm: "offline", Target: command, Detail: "explicit offline maintenance"})
	dsn := ""
	if command == "database configure" || (command == "database check" && o.dsnStdin) {
		if i.driver == "sqlite" {
			return errors.New("SQLite uses data_dir/unicore.db; no connection replacement is necessary")
		}
		dsn, e = c.hidden("新数据库连接 / New database DSN: ", o.dsnStdin)
		if e != nil {
			return e
		}
	} else if i.encrypted != "" {
		dsn, e = i.key.Open(i.encrypted)
	}
	if e != nil {
		return errors.New("unable to read database credentials with the supplied key")
	}
	i.db, e = i.connect(ctx, dsn)
	if e != nil {
		return e
	}
	if command == "doctor" || command == "database check" {
		return c.emit(map[string]any{"status": "ok", "data_dir": i.directory, "driver": i.driver, "profile": i.profile, "instance_match": true, "key_readable": true, "migrations_executed": false})
	}
	if command == "database configure" {
		if e = c.confirm("目标数据库已验证属于本实例。保存新连接？ / Save verified connection?", o.yes); e != nil {
			return e
		}
		if e = i.save("dsn_encrypted", i.key.Seal(dsn)); e != nil {
			return e
		}
		return c.emit(map[string]any{"status": "ok", "operation": command, "driver": i.driver, "credentials": "encrypted", "data_moved": false})
	}
	if i.profile != "web-platform" {
		return errors.New("account and site administration is available only in web-platform")
	}
	r := &platformsql.Repository{Store: i.db, Administrators: true}
	switch command {
	case "admin list":
		users, e := managementAccounts(ctx, r)
		if e != nil {
			return e
		}
		return c.emit(users)
	case "admin reset-password":
		if o.username == "" {
			users, e := managementAccounts(ctx, r)
			if e != nil {
				return e
			}
			if users.Total != 1 || len(users.Items) != 1 {
				return errors.New("multiple administrators: use admin list and --username")
			}
			o.username = users.Items[0].Username
		}
		password, e := c.hidden("新密码 / New password: ", o.passwordStdin)
		if e != nil {
			return e
		}
		if len(password) < 12 || len(password) > 128 {
			return errors.New("password must contain 12–128 bytes")
		}
		if !o.passwordStdin {
			again, e := c.hidden("再次输入 / Confirm password: ", false)
			if e != nil || again != password {
				return errors.New("passwords do not match")
			}
		}
		values, e := i.db.ReadSettings(ctx)
		if e != nil {
			return e
		}
		if settings.BlockedText(values["account.password_blacklist"], password, true) {
			return errors.New("password is blocked by the instance policy")
		}
		hash, e := platform.HashPassword(password)
		if e != nil {
			return e
		}
		if e = r.RecoverPassword(ctx, o.username, hash); e != nil {
			return e
		}
		return c.emit(map[string]any{"status": "ok", "username": o.username, "sessions_revoked": true, "two_factor": "retained"})
	case "sessions revoke":
		if o.realm != "administrator" && o.realm != "user" {
			return errors.New("realm must be administrator or user")
		}
		// The legacy realm flag selects no separate session store.
		if e = r.RecoverSessions(ctx, o.username, o.all); e != nil {
			return e
		}
		return c.emit(map[string]any{"status": "ok", "realm": o.realm, "shared_accounts": true, "sessions_revoked": true})
	case "admin path", "admin set-path":
		if o.path == "" && command == "admin path" {
			values, e := i.db.ReadSettings(ctx)
			if e != nil {
				return e
			}
			path := values["admin.path"]
			if path == "" {
				path = "/admin"
			}
			return c.emit(map[string]string{"path": path, "environment_override": c.Getenv("APP_ADMIN_PATH")})
		}
		if !settings.ValidAdminPath(o.path) {
			return errors.New("invalid administrator path")
		}
		if override := c.Getenv("APP_ADMIN_PATH"); override != "" && override != o.path {
			return errors.New("remove or update APP_ADMIN_PATH override before changing the saved path")
		}
		if e = i.db.SaveSettings(ctx, map[string]string{"admin.path": o.path}, "offline-owner"); e != nil {
			return e
		}
		return c.emit(map[string]string{"status": "ok", "path": o.path})
	case "maintenance on", "maintenance off":
		values := map[string]string{"maintenance.enabled": fmt.Sprint(command == "maintenance on")}
		for _, d := range settings.Definitions {
			if d.Key == "maintenance.message" && !d.Validate(o.message) {
				return errors.New("invalid maintenance message")
			}
		}
		if o.message != "" {
			values["maintenance.message"] = o.message
		}
		if e = i.db.SaveSettings(ctx, values, "offline-owner"); e != nil {
			return e
		}
		return c.emit(map[string]any{"status": "ok", "enabled": command == "maintenance on"})
	case "site set-url":
		if !settings.ValidBaseURL(o.url) {
			return errors.New("use a valid HTTP(S) origin without a path")
		}
		if e = c.confirm("修改后需更新反代及企业回调白名单。继续？ / Update origin?", o.yes); e != nil {
			return e
		}
		old, e := i.db.ReadSettings(ctx)
		if e != nil {
			return e
		}
		if e = i.db.SaveSettings(ctx, map[string]string{"site.base_url": o.url}, "offline-owner"); e != nil {
			return e
		}
		if e = i.save("base_url", o.url); e != nil {
			_ = i.db.SaveSettings(ctx, map[string]string{"site.base_url": old["site.base_url"]}, "offline-owner")
			return e
		}
		return c.emit(map[string]string{"status": "ok", "base_url": o.url, "oidc_user_callback": o.url + "/api/v1/auth/oidc/callback", "oidc_administrator_callback": o.url + "/api/v1/admin/auth/oidc/callback"})
	}
	return errors.New("unsupported operation")
}

// managementAccounts keeps offline recovery focused on privileged accounts in the shared store.
func managementAccounts(ctx context.Context, r *platformsql.Repository) (contracts.UserList, error) {
	result := contracts.UserList{Items: []contracts.User{}, Page: 1, PageSize: 50}
	placeholders := []string{}
	args := []any{}
	for _, definition := range platform.PermissionCatalog() {
		if !definition.Assignable {
			placeholders = append(placeholders, "?")
			args = append(args, definition.ID)
		}
	}
	predicate := "id IN (SELECT ur.user_id FROM unicore_user_roles ur LEFT JOIN unicore_role_permissions rp ON rp.role_id=ur.role_id WHERE ur.role_id='super_admin' OR rp.permission_id IN (" + strings.Join(placeholders, ",") + "))"
	if err := r.Store.Row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_users WHERE "+predicate, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT username FROM unicore_users WHERE "+predicate+" ORDER BY username,id LIMIT 50", args...)
	if err != nil {
		return result, err
	}
	names := []string{}
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			rows.Close()
			return result, err
		}
		names = append(names, name)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	for _, name := range names {
		account, e := r.FindAccount(ctx, name)
		if e != nil {
			return result, e
		}
		result.Items = append(result.Items, account.User)
	}
	return result, nil
}
