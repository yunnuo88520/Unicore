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
type Job struct {
	ID, LocationID, Key string
	Due                 int64
	Attempts            int
}
type Repository interface {
	Locations(context.Context) ([]Location, error)
	SaveLocation(context.Context, Location, bool, string) error
	RemoveLocation(context.Context, string, string) error
	CountLocation(context.Context, string) (int, error)
	BusyLocation(context.Context, string) (bool, error)
	Get(context.Context, string) (Record, error)
	List(context.Context, Actor, string, int) (contracts.FileList, error)
	Create(context.Context, Record, []Job) error
	Change(context.Context, Record, []Job, string) error
	Queue(context.Context, []Job) error
	Jobs(context.Context, int64) ([]Job, error)
	JobDone(context.Context, Job, bool) error
	Referenced(context.Context, string, string, int64) (bool, error)
	Expired(context.Context, int64) ([]Record, error)
	BrandKeys(context.Context) ([]string, error)
}
type Settings interface {
	Value(context.Context, string) (string, error)
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
	Repo     Repository
	Settings Settings
	Secrets  Secrets
	Factory  Factory
	Activate func(context.Context, string, string) error
	Now      func() time.Time
	// Single-instance composition holds a process lock; all metadata transitions use this mutex.
	mu sync.Mutex
}
