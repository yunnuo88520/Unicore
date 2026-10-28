// Author: yunnuo <ymz@ebox.vip>
// Description: Offline, instance-locked backup and verified restore to a fresh directory and empty database.
package maintenance

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/gofrs/flock"
	"github.com/yunnuo/unicore/internal/adapter/blobcloud"
	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/adapter/storage/filesql"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/secret"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type BackupOptions struct{ DataDir, Output, Password, ExternalKey, ToolContainer string }
type RestoreOptions struct {
	Input, DataDir, Password, DatabaseDSN, ConfirmDatabase, BaseURL, ToolContainer string
	MaxBytes                                                                       int64
}
type installRecord struct {
	State    string `json:"state"`
	Profile  string `json:"profile"`
	Driver   string `json:"driver"`
	DSN      string `json:"dsn_encrypted"`
	Instance string `json:"instance"`
}
type objectSource struct {
	id, key, mime, location string
	size                    int64
}

func Backup(ctx context.Context, o BackupOptions) (Manifest, error) {
	var m Manifest
	directory, err := filepath.Abs(o.DataDir)
	if err != nil {
		return m, err
	}
	info, err := os.Lstat(directory)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return m, errors.New("backup source must be an existing regular directory")
	}
	output, err := filepath.Abs(o.Output)
	if err != nil {
		return m, err
	}
	rel, err := filepath.Rel(directory, output)
	if err != nil || rel == "." || (!strings.HasPrefix(rel, ".."+string(filepath.Separator)) && rel != "..") {
		return m, errors.New("backup output must be outside the data directory")
	}
	lock := flock.New(filepath.Join(directory, "instance.lock"))
	locked, err := lock.TryLock()
	if err != nil {
		return m, err
	}
	if !locked {
		return m, errors.New("stop the instance before creating a backup")
	}
	defer lock.Unlock()
	config := installRecord{Profile: "desktop", Driver: "sqlite"}
	var key *secret.Store
	dsn := ""
	raw, err := os.ReadFile(filepath.Join(directory, "installation.json"))
	if err == nil {
		if json.Unmarshal(raw, &config) != nil || config.State != "INSTALLED" {
			return m, errors.New("only completed installations can be backed up")
		}
		if o.ExternalKey == "" {
			if _, err = os.Stat(filepath.Join(directory, "secret.key")); err != nil {
				return m, errors.New("instance encryption key is missing")
			}
		}
		key, err = secret.Open(directory, o.ExternalKey)
		if err != nil {
			return m, err
		}
		if config.DSN != "" {
			dsn, err = key.Open(config.DSN)
			if err != nil {
				return m, err
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return m, err
	}
	if config.Driver == "sqlite" {
		if _, err = os.Stat(filepath.Join(directory, "unicore.db")); err != nil {
			return m, errors.New("installed SQLite database is missing")
		}
	}
	store, err := webdb.Open(ctx, config.Driver, dsn, filepath.Join(directory, "unicore.db"))
	if err != nil {
		return m, err
	}
	defer store.Close()
	profile, instance, err := store.Installation(ctx)
	if err != nil || profile != config.Profile || (config.Instance != "" && instance != config.Instance) {
		return m, errors.New("database installation marker does not match data directory")
	}
	m = Manifest{Format: 1, Snapshot: sqlstore.ID(), Version: buildinfo.Version, Created: time.Now().UTC(), Profile: profile, Driver: config.Driver, Files: []Entry{}, Objects: []CloudObject{}}
	if err = store.DB.QueryRowContext(ctx, "SELECT MAX(version) FROM schema_migrations").Scan(&m.Schema); err != nil {
		return m, err
	}
	// The business ledger did not exist before the scaffold example was introduced.
	_ = store.DB.QueryRowContext(ctx, "SELECT MAX(version) FROM business_migrations").Scan(&m.BusinessSchema)
	temporary, err := os.MkdirTemp("", "unicore-backup-db-")
	if err != nil {
		return m, err
	}
	defer os.RemoveAll(temporary)
	database := filepath.Join(temporary, "database.sql")
	if config.Driver == "sqlite" {
		database = filepath.Join(temporary, "unicore.db")
		_, err = store.DB.ExecContext(ctx, "VACUUM INTO ?", database)
	} else {
		var dump *os.File
		dump, err = os.OpenFile(database, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err == nil {
			err = runDatabaseTool(ctx, config.Driver, dsn, o.ToolContainer, false, nil, dump)
			err = errors.Join(err, dump.Close())
		}
	}
	if err != nil {
		return m, err
	}
	sources := []objectSource{}
	locations := map[string]files.Location{}
	if profile == "web-platform" && m.Schema >= 9 {
		ls, e := (&filesql.Repository{Store: store}).Locations(ctx)
		if e != nil {
			return m, e
		}
		for _, l := range ls {
			locations[l.ID] = l
		}
		if e := verifyLocalFiles(ctx, store, directory); e != nil {
			return m, e
		}
		rows, e := store.DB.QueryContext(ctx, "SELECT id,file_key,mime_type,size,location_id FROM file_metadata WHERE state='ready' AND storage_type<>'local' ORDER BY id")
		if e != nil {
			return m, e
		}
		for rows.Next() {
			var object objectSource
			if e = rows.Scan(&object.id, &object.key, &object.mime, &object.size, &object.location); e != nil {
				rows.Close()
				return m, e
			}
			sources = append(sources, object)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return m, e
		}
	}
	err = writeArchive(output, o.Password, &m, func(a *archiveWriter) error {
		if config.Driver == "sqlite" {
			if e := a.file("data/unicore.db", database); e != nil {
				return e
			}
		} else {
			if e := a.file("database.sql", database); e != nil {
				return e
			}
		}
		if e := filepath.WalkDir(directory, func(path string, entry fs.DirEntry, e error) error {
			if e != nil {
				return e
			}
			if path == directory {
				return nil
			}
			relative, e := filepath.Rel(directory, path)
			if e != nil {
				return e
			}
			name := filepath.ToSlash(relative)
			if entry.Type()&os.ModeSymlink != 0 {
				return errors.New("snapshot refuses symbolic links")
			}
			if entry.IsDir() {
				return nil
			}
			if name == "instance.lock" || name == "bootstrap.token" || name == "unicore.db" || name == "unicore.db-wal" || name == "unicore.db-shm" || (name == "secret.key" && o.ExternalKey != "") {
				return nil
			}
			return a.file("data/"+name, path)
		}); e != nil {
			return e
		}
		if o.ExternalKey != "" {
			raw, e := base64.StdEncoding.DecodeString(o.ExternalKey)
			if e != nil || len(raw) != 32 {
				return errors.New("invalid external key")
			}
			if e = a.add("data/secret.key", 32, strings.NewReader(string(raw))); e != nil {
				return e
			}
		}
		for _, object := range sources {
			if !objectID.MatchString(object.id) {
				return errors.New("invalid object metadata")
			}
			l, ok := locations[object.location]
			if !ok {
				return errors.New("object storage location is missing")
			}
			storage, e := cloudStore(l, key)
			if e != nil {
				return e
			}
			reader, actual, e := storage.Open(ctx, object.key)
			if e != nil {
				return errors.New("cannot read managed cloud object; backup was not published")
			}
			if actual.Size != object.size {
				reader.Close()
				return errors.New("cloud object size differs from metadata")
			}
			e = a.add("objects/"+object.id, object.size, reader)
			e = errors.Join(e, reader.Close())
			if e != nil {
				return e
			}
			m.Objects = append(m.Objects, CloudObject{ID: object.id, MIME: object.mime, Size: object.size})
		}
		return nil
	})
	return m, err
}

var objectID = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,80}$`)

func cloudStore(l files.Location, key *secret.Store) (blob.Store, error) {
	if key == nil {
		return nil, errors.New("instance key is unavailable")
	}
	plain, err := key.Open(l.Credentials)
	if err != nil {
		return nil, err
	}
	var credentials files.Credentials
	if json.Unmarshal([]byte(plain), &credentials) != nil {
		return nil, errors.New("invalid storage configuration")
	}
	return blobcloud.New(blobcloud.Config{Provider: l.Provider, Endpoint: l.Endpoint, Bucket: l.Bucket, Region: l.Region, Prefix: l.Prefix, PathStyle: l.PathStyle, AccessKey: credentials.AccessKey, SecretKey: credentials.SecretKey})
}

func Restore(ctx context.Context, o RestoreOptions) (Manifest, error) {
	var m Manifest
	target, err := filepath.Abs(o.DataDir)
	if err != nil {
		return m, err
	}
	if _, err = os.Lstat(target); !errors.Is(err, os.ErrNotExist) {
		return m, errors.New("restore destination must not exist")
	}
	if err = os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return m, err
	}
	stage, err := os.MkdirTemp(filepath.Dir(target), ".unicore-restore-")
	if err != nil {
		return m, err
	}
	defer os.RemoveAll(stage)
	m, err = readArchive(o.Input, o.Password, stage, o.MaxBytes)
	if err != nil {
		return m, err
	}
	if m.Schema < 1 || m.Schema > 9 || m.BusinessSchema > 1 || (m.Profile != "desktop" && m.Profile != "web-platform" && m.Profile != "web-standalone") {
		return m, errors.New("backup schema/profile is not supported by this tool version")
	}
	directory := filepath.Join(stage, "data")
	if _, err = os.Stat(directory); err != nil {
		return m, errors.New("backup data directory is missing")
	}
	var key *secret.Store
	if m.Profile != "desktop" {
		if _, err = os.Stat(filepath.Join(directory, "secret.key")); err != nil {
			return m, errors.New("backup instance key is missing")
		}
		key, err = secret.Open(directory, "")
		if err != nil {
			return m, err
		}
	}
	if o.BaseURL != "" {
		u, e := url.Parse(o.BaseURL)
		if e != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
			return m, errors.New("base URL must be an HTTP(S) origin")
		}
	}
	var db *sqlstore.Store
	if m.Driver == "sqlite" {
		if o.DatabaseDSN != "" {
			return m, errors.New("SQLite snapshots restore to SQLite; migrate databases separately")
		}
		if _, err = os.Stat(filepath.Join(directory, "unicore.db")); err != nil {
			return m, errors.New("backup database is missing")
		}
		db, err = webdb.Open(ctx, "sqlite", "", filepath.Join(directory, "unicore.db"))
		if err != nil {
			return m, err
		}
	} else {
		name, e := databaseName(m.Driver, o.DatabaseDSN)
		if e != nil || name != o.ConfirmDatabase || name == "" {
			return m, errors.New("external restore requires a new database DSN and exact --confirm-database name")
		}
		db, err = webdb.Open(ctx, m.Driver, o.DatabaseDSN, "")
		if err != nil {
			return m, err
		}
		count, e := db.TableCount(ctx)
		if e != nil || count != 0 || db.InstallationScope(ctx) != nil {
			db.Close()
			return m, errors.New("restore target database must be empty and dedicated")
		}
		f, e := os.Open(filepath.Join(stage, "database.sql"))
		if e != nil {
			db.Close()
			return m, e
		}
		e = runDatabaseTool(ctx, m.Driver, o.DatabaseDSN, o.ToolContainer, true, f, io.Discard)
		f.Close()
		if e != nil {
			db.Close()
			return m, errors.New("database restore failed; no data directory published; discard the partial target database before retrying")
		}
	}
	published := false
	defer func() {
		if !published {
			db.Close()
		}
	}()
	profile, instance, err := db.Installation(ctx)
	if err != nil || profile != m.Profile {
		return m, errors.New("restored database installation marker is invalid")
	}
	// Cloud payloads are restored locally, preventing a restored instance from writing to the source bucket.
	if m.Profile == "web-platform" && m.Schema >= 9 {
		if err = restoreCloud(ctx, db, directory, stage, m); err != nil {
			return m, err
		}
	}
	if m.Profile == "web-platform" && m.Schema >= 9 {
		if err = verifyLocalFiles(ctx, db, directory); err != nil {
			return m, err
		}
	}
	if m.Profile != "desktop" {
		path := filepath.Join(directory, "installation.json")
		raw, e := os.ReadFile(path)
		if e != nil {
			return m, e
		}
		var record map[string]any
		if json.Unmarshal(raw, &record) != nil {
			return m, errors.New("invalid installation record")
		}
		if record["profile"] != m.Profile || record["driver"] != m.Driver || record["state"] != "INSTALLED" || record["instance"] != instance {
			return m, errors.New("installation record differs from backup manifest")
		}
		if m.Driver != "sqlite" {
			record["dsn_encrypted"] = key.Seal(o.DatabaseDSN)
		}
		if o.BaseURL != "" {
			record["base_url"] = strings.TrimSuffix(o.BaseURL, "/")
		}
		data, e := json.MarshalIndent(record, "", "  ")
		if e != nil {
			return m, e
		}
		if e = secret.AtomicWrite(path, append(data, '\n')); e != nil {
			return m, e
		}
	}
	if err = db.Close(); err != nil {
		return m, err
	}
	published = true
	if _, err = os.Lstat(target); !errors.Is(err, os.ErrNotExist) {
		return m, errors.New("restore destination was created concurrently")
	}
	if err = os.Rename(directory, target); err != nil {
		return m, err
	}
	return m, nil
}

func restoreCloud(ctx context.Context, db *sqlstore.Store, directory, stage string, m Manifest) error {
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	seen := map[string]bool{}
	var expected int
	if err = db.Row(ctx, tx, "SELECT COUNT(*) FROM file_metadata WHERE state='ready' AND storage_type<>'local'").Scan(&expected); err != nil {
		return err
	}
	if expected != len(m.Objects) {
		return errors.New("backup is missing managed cloud files")
	}
	for _, object := range m.Objects {
		if !objectID.MatchString(object.ID) || seen[object.ID] {
			return errors.New("invalid backup cloud object")
		}
		seen[object.ID] = true
		key := "restored/" + m.Snapshot + "/" + object.ID
		if !safePath("data/files/" + key) {
			return errors.New("unsafe snapshot ID")
		}
		source := filepath.Join(stage, "objects", object.ID)
		info, e := os.Stat(source)
		if e != nil || info.Size() != object.Size {
			return errors.New("cloud payload is missing")
		}
		destination := filepath.Join(directory, "files", filepath.FromSlash(key))
		if e = os.MkdirAll(filepath.Dir(destination), 0700); e != nil {
			return e
		}
		if e = os.Rename(source, destination); e != nil {
			return e
		}
		var hash string
		for _, file := range m.Files {
			if file.Path == "objects/"+object.ID {
				hash = file.SHA256
				break
			}
		}
		if hash == "" {
			return errors.New("cloud payload checksum is missing")
		}
		result, e := db.Exec(ctx, tx, "UPDATE file_metadata SET storage_type='local',location_id='local',file_key=?,staging_key='',etag=? WHERE id=? AND storage_type<>'local' AND state='ready'", key, hash, object.ID)
		if e != nil {
			return e
		}
		count, e := result.RowsAffected()
		if e != nil || count != 1 {
			return errors.New("cloud metadata mismatch")
		}
	}
	for _, query := range []string{
		"DELETE FROM file_cleanup_jobs WHERE location_id IN (SELECT id FROM storage_locations WHERE provider<>'local')",
		"UPDATE file_metadata SET state='deleted',file_key='',staging_key='' WHERE storage_type<>'local' AND state<>'ready'",
		"UPDATE storage_locations SET credentials='',tested=0 WHERE provider<>'local'",
		"DELETE FROM system_settings WHERE setting_key='storage.active'",
		"INSERT INTO system_settings(setting_key,setting_value) VALUES('storage.active','local')",
	} {
		if _, err = db.Exec(ctx, tx, query); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Validate every ready local reference, including legacy brand files, before publishing a snapshot or restore.
func verifyLocalFiles(ctx context.Context, db *sqlstore.Store, directory string) error {
	rows, err := db.DB.QueryContext(ctx, "SELECT file_key,location_id,size,etag FROM file_metadata WHERE storage_type='local' AND state='ready'")
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var key, location, etag string
		var size int64
		if err = rows.Scan(&key, &location, &size, &etag); err != nil {
			return err
		}
		folder := "files"
		if location == "legacy-brand" {
			folder = "brand-assets"
		}
		object, e := bloblocal.New(filepath.Join(directory, folder)).Stat(ctx, key)
		if e != nil || object.Size != size || (etag != "" && object.ETag != etag) {
			return errors.New("a managed local file is missing or differs from its metadata")
		}
	}
	return rows.Err()
}
