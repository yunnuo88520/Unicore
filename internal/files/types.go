// Author: yunnuo <ymz@ebox.vip>
// Description: File metadata and persistence ports independent of filesystem, SQL and identity modules.
package files

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	"sync"
	"time"
)

var ErrInvalid = errors.New("invalid file input")
var ErrNotFound = errors.New("file not found")
var ErrBusy = errors.New("file or location in use")
var ErrUnavailable = errors.New("storage unavailable")
var ErrNotReady = errors.New("storage not tested")

type Actor struct {
	ID, Realm string
	Admin     bool
}

// ScopeFilter carries the optional row-level data scope for list queries: the
// zero value keeps the personal-only behaviour, All lists every file of the
// actor's own realm, CreatorIDs restricts the list to those platform users.
type ScopeFilter struct {
	All        bool
	CreatorIDs []string
}

// RowCapabilities projects what this session may do with one listed file row:
// downloads follow the freshly resolved read scope and never cross realms,
// deletion stays with the owner (or the administrator instance surface).
func (a Actor) RowCapabilities(f Record, scope ScopeFilter) contracts.FileCapabilities {
	own := f.CreatorID == a.ID && f.CreatorRealm == a.Realm
	sameRealm := f.CreatorRealm == a.Realm
	download := a.Admin || own || (scope.All && sameRealm)
	if !download {
		for _, id := range scope.CreatorIDs {
			if id == f.CreatorID && sameRealm {
				download = true
				break
			}
		}
	}
	return contracts.FileCapabilities{Download: download, Delete: a.Admin || own}
}

type Location struct {
	contracts.StorageLocation
	Credentials string
}
type Credentials struct {
	AccessKey string `json:"access_key"`
	SecretKey string `json:"secret_key"`
}
type Record struct {
	contracts.FileEntry
	Key, Staging, ETag, Purpose string
	UploadExpires               int64
	CleanupAt                   int64
}
type UploadSession struct {
	FileID, UploadID, Fingerprint string
	PartSize                      int64
}

// Migration job states and run modes.
const (
	MigrationRunning   = "running"
	MigrationPaused    = "paused"
	MigrationCompleted = "completed"
	MigrationFailed    = "failed"
	MigrationCancelled = "cancelled"
	MigrationModeScan  = "scan"
	MigrationModeRetry = "retry"
)

// MigrationJobRow is one durable migration run. The scan cursor stays
// internal: contracts expose progress, never the resume pointer.
type MigrationJobRow struct {
	contracts.StorageMigrationJob
	ScanCursor string
}
type Job struct {
	ID, LocationID, Key string
	Due                 int64
	Attempts            int
}
type Repository interface {
	Session(context.Context, string) (UploadSession, error)
	SaveSession(context.Context, UploadSession, bool) error
	Locations(context.Context) ([]Location, error)
	SaveLocation(context.Context, Location, bool, string) error
	RemoveLocation(context.Context, string, string) error
	CountLocation(context.Context, string) (int, error)
	BusyLocation(context.Context, string) (bool, error)
	Get(context.Context, string) (Record, error)
	List(context.Context, Actor, string, int, ScopeFilter) (contracts.FileList, error)
	Create(context.Context, Record, []Job) error
	Change(context.Context, Record, []Job, string) error
	Remove(context.Context, Record, []Job, string) error
	Queue(context.Context, []Job) error
	Jobs(context.Context, int64) ([]Job, error)
	JobDone(context.Context, Job, bool) error
	Referenced(context.Context, string, string, int64) (bool, error)
	Expired(context.Context, int64, string) ([]Record, error)
	BrandKeys(context.Context) ([]string, error)
}
type Settings interface {
	Value(context.Context, string) (string, error)
}
type ReferenceChecker interface {
	Referenced(context.Context, string) (bool, error)
}

// MigrationJobRepository persists platform migration runs. Only the
// web-platform composition implements it; other profiles never migrate.
type MigrationJobRepository interface {
	CreateMigrationJob(context.Context, MigrationJobRow, string) error
	MigrationJob(context.Context, string) (MigrationJobRow, error)
	// ActiveMigrationJob returns the single running or paused run, or a zero row.
	ActiveMigrationJob(context.Context) (MigrationJobRow, error)
	MigrationJobs(context.Context, int) ([]MigrationJobRow, error)
	// PauseRunningMigrations demotes every running run to paused; startup recovery.
	PauseRunningMigrations(context.Context) error
	// Transition flips status atomically and returns whether the guard matched.
	TransitionMigrationJob(ctx context.Context, id, from, to string, finishedAt int64) (bool, error)
	// RestartMigrationJob reactivates a finished or paused job in retry mode.
	RestartMigrationJob(ctx context.Context, id string, now int64) (bool, error)
	// SaveMigrationProgress persists counters, cursor and mode only; status stays owned by transitions.
	SaveMigrationProgress(ctx context.Context, job MigrationJobRow) error
	RecordMigrationFailure(ctx context.Context, jobID string, failure contracts.StorageMigrationFailure) error
	// ClearMigrationFailure reports whether a recorded failure row was removed.
	ClearMigrationFailure(ctx context.Context, jobID, fileID string) (bool, error)
	MigrationFailures(ctx context.Context, jobID string, limit int) ([]contracts.StorageMigrationFailure, error)
	CountMigrationFailures(ctx context.Context, jobID string) (int, error)
	CountReadyForMigration(ctx context.Context, locationID string) (int, error)
	NextMigrationBatch(ctx context.Context, locationID, afterID string, limit int) ([]Record, error)
	LocationReadyTotals(ctx context.Context, excludeLocation string) ([]contracts.StorageMigrationSummaryItem, error)
}

// CreatorDirectory supplies account labels without coupling file metadata to identity storage.
type Creator struct{ Name, Username string }
type CreatorDirectory interface {
	FileCreators(context.Context, []string) (map[string]Creator, error)
}
type Secrets interface {
	Seal(string) string
	Open(string) (string, error)
}
type Factory func(Location, Credentials) (blob.Store, error)
type BrowserStore interface {
	Browser(context.Context, string) error
	Origin() string
}
type Service struct {
	Repo       Repository
	Settings   Settings
	Secrets    Secrets
	Factory    Factory
	Activate   func(context.Context, string, string) error
	References []ReferenceChecker
	Creators   CreatorDirectory
	// MigrationNotifications receives terminal migration outcomes for the
	// instance notification center; assembly bridges it to the registered-type
	// inbox and it stays nil in profiles without the migration worker.
	MigrationNotifications MigrationNotifier
	Now                    func() time.Time
	// Single-instance composition holds a process lock; all metadata transitions use this mutex.
	mu sync.Mutex
	// referenceMu serializes business-reference writes with destructive file transitions.
	referenceMu sync.Mutex
	uploadLocks [64]sync.Mutex
	// Rotate bounded expiry scans past referenced records without starving later files.
	cleanupCursor string
	originsMu     sync.RWMutex
	cachedOrigins []string
	originsValid  bool
}

func (s *Service) fileLock(id string) *sync.Mutex {
	var hash uint64
	for _, c := range id {
		hash = hash*31 + uint64(c)
	}
	return &s.uploadLocks[hash%64]
}
