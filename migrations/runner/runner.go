// Author: yunnuo <ymz@ebox.vip>
// Description: Catalog executor used by installation and startup: advisory locks, checksum verification and the four-column ledger.
package runner

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"hash/fnv"
	"strconv"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/edition"
	"github.com/yunnuo/unicore/migrations"
	"github.com/yunnuo/unicore/migrations/catalogdata"
)

var (
	// ErrLegacyLedger reports the ADR-0024 two-column ledger: the database
	// predates the catalog generation and cannot be upgraded in place.
	ErrLegacyLedger = errors.New("legacy two-column schema_migrations requires reinstall")
	// ErrForeignDatabase reports a database that already holds objects but no
	// catalog ledger: a legacy-prefix world (whose schema_migrations was renamed
	// away) or an unrelated database. Creating a fresh ledger on top would
	// replay baselines into colliding names, so it is refused before writing.
	ErrForeignDatabase = errors.New("database is not empty and has no catalog ledger; legacy installations require reinstall")
	// ErrLedgerShape reports a schema_migrations table that matches neither
	// the catalog ledger nor the legacy shape.
	ErrLedgerShape = errors.New("schema_migrations does not match the catalog ledger")
	// ErrChecksumMismatch reports drifted bytes: the stored checksum of an
	// applied migration or a baseline file no longer matches the catalog.
	ErrChecksumMismatch = errors.New("migration checksum does not match the catalog")
	// ErrUnknownApplied reports ledger rows the catalog does not define.
	ErrUnknownApplied = errors.New("ledger records a migration the catalog does not define")
	// ErrAnchorMismatch reports a database whose rows lack the persisted
	// generation anchor: a four-column ledger without the catalog's core@1
	// fingerprint must never pass as the current generation.
	ErrAnchorMismatch = errors.New("database generation anchor does not match the catalog")
	// ErrLocked reports a concurrent migration run holding the database lock.
	ErrLocked = errors.New("another migration run holds the database lock")
)

// Querier is the subset of database/sql the runner executes through. Advisory
// locks pin a single *sql.Conn, so both *sql.DB and *sql.Conn satisfy it.
type Querier interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// session adds transaction control to Querier; *sql.DB and *sql.Conn both
// provide it.
type session interface {
	Querier
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
}

// Options selects the target identity of one Apply or Verify call.
type Options struct {
	// Dialect is one of sqlite, postgres, mysql.
	Dialect string
	// Profile is a catalog profile such as web-platform or desktop.
	Profile string
	// Now stamps the applied_at ledger column; tests inject fixed clocks.
	Now func() time.Time
	// Source loads a baseline SQL file by catalog path. Nil uses the
	// embedded baseline trees.
	Source func(path string) ([]byte, error)
}

var advisoryLockKey = func() int64 {
	hash := fnv.New64a()
	_, _ = hash.Write([]byte("unicore-schema-migrations"))
	return int64(hash.Sum64())
}()

const advisoryLockName = "unicore-schema-migrations"

// Apply brings the database to the catalog baseline for the profile. It
// serializes concurrent runs with a dialect-appropriate lock, refuses legacy
// or tampered ledger states before writing anything, and records every
// migration only after all of its statements succeed.
func Apply(ctx context.Context, db *sql.DB, opts Options) error {
	return ApplyDescriptor(ctx, db, catalogdata.Catalog, opts)
}

// ApplyDescriptor is Apply against an explicit descriptor; tests inject
// synthetic catalogs through it.
func ApplyDescriptor(ctx context.Context, db *sql.DB, descriptor catalogdata.Descriptor, opts Options) error {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	schema, err := plan(descriptor, opts)
	if err != nil {
		return err
	}
	conn, release, err := lockSession(ctx, db, opts.Dialect)
	if err != nil {
		return err
	}
	defer func() { _ = release() }()
	if err = ensureLedger(ctx, conn, schema.ledger, opts.Dialect); err != nil {
		return err
	}
	applied, err := readLedger(ctx, conn, descriptor, opts)
	if err != nil {
		return err
	}
	return execute(ctx, conn, schema, applied, opts)
}

// Verify validates the ledger shape, generation anchor and applied checksums
// without executing anything. A missing ledger is reported, never created.
func Verify(ctx context.Context, db *sql.DB, opts Options) error {
	return VerifyDescriptor(ctx, db, catalogdata.Catalog, opts)
}

// VerifyDescriptor is Verify against an explicit descriptor.
func VerifyDescriptor(ctx context.Context, db *sql.DB, descriptor catalogdata.Descriptor, opts Options) error {
	if _, err := plan(descriptor, opts); err != nil {
		return err
	}
	conn, release, err := lockSession(ctx, db, opts.Dialect)
	if err != nil {
		return err
	}
	defer func() { _ = release() }()
	if _, found, err := inspectLedger(ctx, conn, descriptor.Ledger, opts.Dialect); err != nil {
		return err
	} else if !found {
		return fmt.Errorf("%w: table %q does not exist", ErrLedgerShape, descriptor.Ledger.Table)
	}
	applied, err := readLedger(ctx, conn, descriptor, opts)
	if err != nil {
		return err
	}
	if !applied.exists {
		return fmt.Errorf("%w: table %q does not exist", ErrLedgerShape, descriptor.Ledger.Table)
	}
	return nil
}

type plannedMigration struct {
	namespace string
	version   int
	file      catalogdata.SQLFile
	noTx      bool
}

type schemaPlan struct {
	ledger catalogdata.Ledger
	order  []plannedMigration
}

type ledgerState struct {
	rows   map[string]bool
	exists bool
}

func plan(descriptor catalogdata.Descriptor, opts Options) (schemaPlan, error) {
	profile, ok := descriptor.Profiles[opts.Profile]
	if !ok {
		return schemaPlan{}, fmt.Errorf("unknown profile %q", opts.Profile)
	}
	if !contains(profile.Dialects, opts.Dialect) {
		return schemaPlan{}, fmt.Errorf("profile %q does not declare dialect %q", opts.Profile, opts.Dialect)
	}
	namespaces := map[string]catalogdata.Namespace{}
	for _, namespace := range descriptor.Namespaces {
		namespaces[namespace.Id] = namespace
	}
	result := schemaPlan{ledger: descriptor.Ledger}
	for _, id := range profile.Order {
		if id == "module.notes" && !edition.Notes {
			continue
		}
		namespace, ok := namespaces[id]
		if !ok {
			return schemaPlan{}, fmt.Errorf("profile %q orders unknown namespace %q", opts.Profile, id)
		}
		for _, migration := range namespace.Migrations {
			file, ok := migration.Files[opts.Dialect]
			if !ok {
				return schemaPlan{}, fmt.Errorf("namespace %q version %d has no %q file", id, migration.Version, opts.Dialect)
			}
			result.order = append(result.order, plannedMigration{
				namespace: id,
				version:   migration.Version,
				file:      file,
				noTx:      strings.HasSuffix(file.Path, ".notx.sql"),
			})
		}
	}
	return result, nil
}

// lockSession pins one pooled connection so the advisory lock and every later
// statement share a session. SQLite relies on its own writer locking.
func lockSession(ctx context.Context, db *sql.DB, dialect string) (session, func() error, error) {
	if dialect != "postgres" && dialect != "mysql" {
		return db, func() error { return nil }, nil
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, nil, err
	}
	switch dialect {
	case "postgres":
		if _, err = conn.ExecContext(ctx, "SELECT pg_advisory_lock($1)", advisoryLockKey); err != nil {
			_ = conn.Close()
			return nil, nil, err
		}
	case "mysql":
		var held int
		if err = conn.QueryRowContext(ctx, "SELECT GET_LOCK(?, 10)", advisoryLockName).Scan(&held); err != nil {
			_ = conn.Close()
			return nil, nil, err
		}
		if held != 1 {
			_ = conn.Close()
			return nil, nil, ErrLocked
		}
	}
	release := func() error {
		var unlockErr error
		// Releasing the lock must survive cancellation of the caller.
		background := context.WithoutCancel(ctx)
		switch dialect {
		case "postgres":
			_, unlockErr = conn.ExecContext(background, "SELECT pg_advisory_unlock($1)", advisoryLockKey)
		case "mysql":
			_, unlockErr = conn.ExecContext(background, "SELECT RELEASE_LOCK(?)", advisoryLockName)
		}
		if closeErr := conn.Close(); unlockErr == nil {
			unlockErr = closeErr
		}
		return unlockErr
	}
	return conn, release, nil
}

// ensureLedger creates the ledger when absent and refuses tables that match
// neither the catalog shape nor the legacy two-column shape.
func ensureLedger(ctx context.Context, conn session, ledger catalogdata.Ledger, dialect string) error {
	columns, found, err := ledgerColumns(ctx, conn, ledger.Table, dialect)
	if err != nil {
		return err
	}
	if found {
		return checkLedgerShape(ledger, columns)
	}
	objects, err := objectCount(ctx, conn, dialect)
	if err != nil {
		return err
	}
	if objects != 0 {
		return ErrForeignDatabase
	}
	ddl, ok := ledger.Ddl[dialect]
	if !ok {
		return fmt.Errorf("catalog ledger has no %q DDL", dialect)
	}
	// IF NOT EXISTS keeps a concurrent creator from failing the run; the
	// shape check above already rejected foreign tables.
	_, err = conn.ExecContext(ctx, strings.Replace(ddl, "CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1))
	return err
}

// objectCount counts user-visible tables and views, excluding the dialect's
// own internals. Views are counted because a replay into a view-named target
// fails just the same.
func objectCount(ctx context.Context, conn Querier, dialect string) (int, error) {
	var query string
	switch dialect {
	case "sqlite":
		query = "SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'"
	case "postgres":
		query = "SELECT count(*) FROM information_schema.tables WHERE table_schema=current_schema() AND table_type IN ('BASE TABLE','VIEW')"
	case "mysql":
		query = "SELECT count(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE IN ('BASE TABLE','VIEW')"
	default:
		return 0, fmt.Errorf("unsupported dialect %q", dialect)
	}
	rows, err := conn.QueryContext(ctx, query)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	if !rows.Next() {
		return 0, rows.Err()
	}
	var count int
	if err = rows.Scan(&count); err != nil {
		return 0, err
	}
	return count, rows.Err()
}

func inspectLedger(ctx context.Context, conn session, ledger catalogdata.Ledger, dialect string) ([]string, bool, error) {
	columns, found, err := ledgerColumns(ctx, conn, ledger.Table, dialect)
	if err != nil || !found {
		return nil, false, err
	}
	return columns, true, checkLedgerShape(ledger, columns)
}

func checkLedgerShape(ledger catalogdata.Ledger, columns []string) error {
	if len(columns) == 2 && contains(columns, "version") && contains(columns, "checksum") {
		return fmt.Errorf("%w: table %q", ErrLegacyLedger, ledger.Table)
	}
	for _, column := range ledger.Columns {
		if !contains(columns, column.Name) {
			return fmt.Errorf("%w: missing column %q", ErrLedgerShape, column.Name)
		}
	}
	return nil
}

func ledgerColumns(ctx context.Context, conn session, table, dialect string) ([]string, bool, error) {
	var query string
	switch dialect {
	case "sqlite":
		query = "SELECT name FROM pragma_table_info('" + table + "')"
	case "postgres":
		query = "SELECT column_name FROM information_schema.columns WHERE table_name='" + table + "' ORDER BY ordinal_position"
	case "mysql":
		query = "SELECT column_name FROM information_schema.columns WHERE table_name='" + table + "' AND table_schema=DATABASE() ORDER BY ordinal_position"
	default:
		return nil, false, fmt.Errorf("unsupported dialect %q", dialect)
	}
	rows, err := conn.QueryContext(ctx, query)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	var columns []string
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			return nil, false, err
		}
		columns = append(columns, name)
	}
	return columns, len(columns) > 0, rows.Err()
}

// readLedger validates every recorded row against the catalog and, when any
// row exists, requires the persisted generation anchor.
func readLedger(ctx context.Context, conn session, descriptor catalogdata.Descriptor, opts Options) (ledgerState, error) {
	state := ledgerState{rows: map[string]bool{}}
	rows, err := conn.QueryContext(ctx, "SELECT namespace, version, checksum FROM "+descriptor.Ledger.Table+" ORDER BY namespace, version")
	if err != nil {
		if ledgerMissing(err) {
			return state, nil
		}
		return state, err
	}
	defer rows.Close()
	state.exists = true
	for rows.Next() {
		var namespace, checksumValue string
		var version int64
		if err = rows.Scan(&namespace, &version, &checksumValue); err != nil {
			return state, err
		}
		file, ok := lookupFile(descriptor, namespace, int(version), opts.Dialect)
		if !ok {
			return state, fmt.Errorf("%w: %s@%s", ErrUnknownApplied, namespace, strconv.FormatInt(version, 10))
		}
		if file.Checksum != checksumValue {
			return state, fmt.Errorf("%w: %s@%s", ErrChecksumMismatch, namespace, strconv.FormatInt(version, 10))
		}
		state.rows[namespace+"@"+strconv.FormatInt(version, 10)] = true
	}
	if err = rows.Err(); err != nil {
		return state, err
	}
	if len(state.rows) > 0 {
		anchor := descriptor.GenerationAnchor
		if !state.rows[anchor.Namespace+"@"+strconv.Itoa(anchor.Version)] {
			return state, fmt.Errorf("%w: missing %s@%d", ErrAnchorMismatch, anchor.Namespace, anchor.Version)
		}
		file, _ := lookupFile(descriptor, anchor.Namespace, anchor.Version, opts.Dialect)
		if file.Checksum != anchor.Checksums[opts.Dialect] {
			return state, fmt.Errorf("%w: %s@%d", ErrAnchorMismatch, anchor.Namespace, anchor.Version)
		}
	}
	return state, nil
}

func ledgerMissing(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "no such table") || strings.Contains(message, "does not exist")
}

func lookupFile(descriptor catalogdata.Descriptor, namespace string, version int, dialect string) (catalogdata.SQLFile, bool) {
	for _, candidate := range descriptor.Namespaces {
		if candidate.Id != namespace {
			continue
		}
		for _, migration := range candidate.Migrations {
			if migration.Version != version {
				continue
			}
			file, ok := migration.Files[dialect]
			return file, ok
		}
	}
	return catalogdata.SQLFile{}, false
}

func execute(ctx context.Context, conn session, schema schemaPlan, applied ledgerState, opts Options) error {
	source := opts.Source
	if source == nil {
		source = func(path string) ([]byte, error) { return migrations.Baselines.ReadFile(path) }
	}
	stamp := opts.Now().UTC().Unix()
	for _, migration := range schema.order {
		key := migration.namespace + "@" + strconv.Itoa(migration.version)
		if applied.rows[key] {
			continue
		}
		body, err := source(migration.file.Path)
		if err != nil {
			return err
		}
		if checksum(body) != migration.file.Checksum {
			return fmt.Errorf("%w: %s", ErrChecksumMismatch, migration.file.Path)
		}
		if err = runMigration(ctx, conn, opts.Dialect, schema.ledger.Table, migration, body, stamp); err != nil {
			return err
		}
		applied.rows[key] = true
	}
	return nil
}

func runMigration(ctx context.Context, conn session, dialect, ledgerTable string, migration plannedMigration, body []byte, stamp int64) error {
	run := func(exec Querier) error {
		for _, statement := range splitStatements(body) {
			if _, err := exec.ExecContext(ctx, statement); err != nil {
				return fmt.Errorf("%s@%d: %w", migration.namespace, migration.version, err)
			}
		}
		return nil
	}
	record := func(exec Querier) error {
		// PostgreSQL's extended protocol rejects ? placeholders; the baselines
		// themselves are executed without parameters, so only this insert
		// needs the dialect's placeholder form.
		placeholders := "?, ?, ?, ?"
		if dialect == "postgres" {
			placeholders = "$1, $2, $3, $4"
		}
		_, err := exec.ExecContext(ctx, "INSERT INTO "+ledgerTable+"(namespace, version, checksum, applied_at) VALUES("+placeholders+")",
			migration.namespace, migration.version, migration.file.Checksum, stamp)
		if err != nil {
			return fmt.Errorf("%s@%d: %w", migration.namespace, migration.version, err)
		}
		return nil
	}
	if migration.noTx {
		// DDL that cannot run inside a transaction (concurrent index builds,
		// some MySQL operations) executes statement by statement; the ledger
		// row lands only after every statement succeeded.
		if err := run(conn); err != nil {
			return err
		}
		return record(conn)
	}
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err = run(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err = record(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// splitStatements strips full-line comments and splits on semicolons, the
// same contract the legacy executor applies to baseline DDL.
func splitStatements(body []byte) []string {
	var lines []string
	for _, line := range strings.Split(string(body), "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "--") {
			lines = append(lines, line)
		}
	}
	var statements []string
	for _, statement := range strings.Split(strings.Join(lines, "\n"), ";") {
		if strings.TrimSpace(statement) != "" {
			statements = append(statements, statement)
		}
	}
	return statements
}

func checksum(body []byte) string {
	digest := sha256.Sum256(body)
	return hex.EncodeToString(digest[:])
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
