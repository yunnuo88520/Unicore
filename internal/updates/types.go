// Author: yunnuo <ymz@ebox.vip>
// Description: Update ports and publisher-signed target metadata, independent of transport and identity.
package updates

import (
	"context"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/updateport"
	"io"
	"time"
)

var ErrBusy = updateport.ErrBusy
var ErrRejected = updateport.ErrRejected
var ErrUnavailable = updateport.ErrUnavailable

type Release struct {
	Version     string      `json:"version"`
	Notes       string      `json:"notes"`
	PublishedAt string      `json:"published_at"`
	Prerelease  bool        `json:"prerelease"`
	URL         string      `json:"url"`
	Assets      []AssetLink `json:"assets"`
}
type AssetLink struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}
type Target struct {
	Profile           string `json:"profile"`
	OS                string `json:"os"`
	Arch              string `json:"arch"`
	Migration         int    `json:"migration_level"`
	BusinessMigration int    `json:"business_migration_level"`
	License           bool   `json:"license"`
	Updater           bool   `json:"updater"`
}
type Artifact struct {
	Target
	Name              string `json:"artifact"`
	SHA256            string `json:"sha256"`
	Size              int64  `json:"size"`
	PlatformSignature string `json:"platform_signature"`
}
type Manifest struct {
	Schema      int        `json:"schema"`
	Application string     `json:"application_id"`
	Version     string     `json:"version"`
	Commit      string     `json:"source_commit"`
	IssuedAt    time.Time  `json:"issued_at"`
	ExpiresAt   time.Time  `json:"expires_at"`
	Artifacts   []Artifact `json:"artifacts"`
}
type Signature struct {
	KeyID     string `json:"key_id"`
	Algorithm string `json:"algorithm"`
	Value     string `json:"signature"`
}
type Trust struct {
	Application           string
	Keys                  map[string]string
	AllowUnsignedPlatform bool
}
type Payload struct {
	Manifest  []byte   `json:"manifest"`
	Signature []byte   `json:"signature"`
	Artifact  Artifact `json:"artifact"`
	URL       string   `json:"url"`
	Version   string   `json:"version"`
	Commit    string   `json:"commit"`
}
type Provider interface {
	Name() string
	Releases(context.Context) ([]Release, error)
	Read(context.Context, string, int64) ([]byte, error)
	Download(context.Context, string, io.Writer, int64, func(int64)) error
}
type Catalog struct {
	Releases  []Release `json:"releases"`
	CheckedAt string    `json:"checked_at"`
	LastError string    `json:"last_error"`
	Verified  *Payload  `json:"verified,omitempty"`
}
type Cache interface {
	Load() Catalog
	Save(Catalog) error
}
type Installer interface {
	Readiness() string
	Job() contracts.UpdateJob
	Start(Payload) (contracts.UpdateJob, error)
}

// API is the narrow composition/transport port; no platform module is imported.
type API interface {
	Overview(context.Context) contracts.UpdateOverview
	Check(context.Context) contracts.UpdateOverview
	Apply(context.Context, contracts.UpdateApplyInput) (contracts.UpdateJob, error)
}
