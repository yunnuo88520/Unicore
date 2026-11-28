// Author: yunnuo <ymz@ebox.vip>
// Description: Module-owned artifact downloads with fresh authorization at issuance and consumption.
package files

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/blob"
)

// ResourceFile is a module's persisted artifact reference. Key belongs to the
// module's private blob namespace, not a local path or a presigned URL. Do not
// register these bytes as personal files: the creator shortcut is inappropriate
// for department-owned artifacts. Modules own reference/cleanup transactions.
type ResourceFile struct {
	FileID, Key, Name, MIME string
	Size                    int64
}

// ResourceSnapshot is freshly resolved under the module's resource read guard.
// Subject identifies the authenticated principal (including credential/role
// restrictions); Revision changes on resource transfer, deletion or artifact
// replacement. Every requested file must belong to the current live resource.
type ResourceSnapshot struct {
	Subject, Revision string
	Files             []ResourceFile
}

// ResourceAuthorizer must re-read the subject's permissions, permission-specific
// department scope, current resource ownership/deletion and EVERY file binding.
// It holds its transaction/read guard until visit returns, serialized against
// resource changes. It must not call visit on denial or database failure.
// No caller-provided Actor, creator set or administrator bypass is accepted.
type ResourceAuthorizer interface {
	WithResourceFiles(ctx context.Context, resourceID string, fileIDs []string, visit func(ResourceSnapshot) error) error
}

// ControlledStore is a narrow port for module-owned private artifacts. It always
// opens provider bytes through the application, including cloud storage. It never
// issues provider bearer URLs or caches ZIPs that could outlive authorization.
// Personal files continue using Service with their existing ownership semantics.
type ControlledStore struct {
	Store      blob.Store
	Authorizer ResourceAuthorizer
	Secrets    Secrets
	Now        func() time.Time
}

type ControlledGrant struct {
	Token     string
	ExpiresAt int64
	Count     int
}

type controlledPayload struct {
	Kind       string
	ResourceID string
	FileIDs    []string
	Digest     string
	ExpiresAt  int64
}

func (s *ControlledStore) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func validResourceSelection(resource string, ids []string) bool {
	if resource == "" || len(resource) > 256 || len(ids) == 0 || len(ids) > 100 {
		return false
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if id == "" || len(id) > 256 || seen[id] {
			return false
		}
		seen[id] = true
	}
	return true
}

// resourceDigest rejects incomplete/extra entries, unsafe ZIP names and ambiguous
// bindings; signed metadata never substitutes for a fresh authorization check.
func resourceDigest(snapshot ResourceSnapshot, ids []string) (string, error) {
	if snapshot.Subject == "" || snapshot.Revision == "" || len(snapshot.Files) != len(ids) {
		return "", ErrNotFound
	}
	for i, file := range snapshot.Files {
		if file.FileID != ids[i] || !blob.ValidKey(file.Key) || file.Size < 0 ||
			file.Name == "" || file.Name == "." || file.Name == ".." || len(file.Name) > 255 ||
			path.Base(file.Name) != file.Name || strings.ContainsAny(file.Name, "\\\x00\r\n") {
			return "", ErrNotFound
		}
	}
	raw, err := json.Marshal(snapshot)
	if err != nil {
		return "", ErrUnavailable
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}

// Sign returns an opaque grant for a module's authenticated download endpoint.
// The endpoint calls Open with its CURRENT request principal; it must not redirect
// to a cloud URL or serve a previously generated archive from a static cache.
func (s *ControlledStore) Sign(ctx context.Context, resource string, ids []string, ttl time.Duration) (ControlledGrant, error) {
	if s.Authorizer == nil || s.Store == nil || s.Secrets == nil {
		return ControlledGrant{}, ErrUnavailable
	}
	if !validResourceSelection(resource, ids) || ttl < time.Second || ttl > time.Hour {
		return ControlledGrant{}, ErrInvalid
	}
	payload := controlledPayload{Kind: "unicore-resource-download-v1", ResourceID: resource, FileIDs: append([]string(nil), ids...), ExpiresAt: s.now().Add(ttl).Unix()}
	visited := false
	err := s.Authorizer.WithResourceFiles(ctx, resource, payload.FileIDs, func(snapshot ResourceSnapshot) error {
		if visited {
			return ErrUnavailable
		}
		visited = true
		var err error
		payload.Digest, err = resourceDigest(snapshot, payload.FileIDs)
		return err
	})
	if err != nil {
		return ControlledGrant{}, err
	}
	if !visited || payload.Digest == "" {
		return ControlledGrant{}, ErrUnavailable
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return ControlledGrant{}, ErrUnavailable
	}
	return ControlledGrant{Token: s.Secrets.Seal(string(raw)), ExpiresAt: payload.ExpiresAt, Count: len(ids)}, nil
}

// Open reauthorizes the exact selection and rejects grants for an old subject,
// department/resource revision or artifact manifest BEFORE opening any bytes.
// A single file streams as itself; multiple files stream a newly built ZIP.
// Authorization is evaluated at download start; already delivered bytes cannot
// be revoked. The caller must close the reader (also on request cancellation).
func (s *ControlledStore) Open(ctx context.Context, token string) (io.ReadCloser, ResourceFile, error) {
	if s.Authorizer == nil || s.Store == nil || s.Secrets == nil {
		return nil, ResourceFile{}, ErrUnavailable
	}
	if len(token) > 128*1024 {
		return nil, ResourceFile{}, ErrNotFound
	}
	raw, err := s.Secrets.Open(token)
	if err != nil {
		return nil, ResourceFile{}, ErrNotFound
	}
	var payload controlledPayload
	now := s.now().Unix()
	if json.Unmarshal([]byte(raw), &payload) != nil || payload.Kind != "unicore-resource-download-v1" ||
		!validResourceSelection(payload.ResourceID, payload.FileIDs) || payload.ExpiresAt <= now || payload.ExpiresAt > now+3600 {
		return nil, ResourceFile{}, ErrNotFound
	}
	var streams []io.ReadCloser
	var files []ResourceFile
	closeStreams := func() {
		for _, stream := range streams {
			_ = stream.Close()
		}
	}
	visited := false
	err = s.Authorizer.WithResourceFiles(ctx, payload.ResourceID, payload.FileIDs, func(snapshot ResourceSnapshot) error {
		if visited {
			return ErrUnavailable
		}
		visited = true
		digest, err := resourceDigest(snapshot, payload.FileIDs)
		if err != nil {
			return err
		}
		if digest != payload.Digest {
			return ErrNotFound
		}
		files = append([]ResourceFile(nil), snapshot.Files...)
		for _, file := range files {
			stream, object, err := s.Store.Open(ctx, file.Key)
			if err != nil {
				return ErrUnavailable
			}
			streams = append(streams, stream)
			if object.Size != file.Size {
				return ErrUnavailable
			}
		}
		return nil
	})
	if err != nil || !visited || len(streams) != len(payload.FileIDs) {
		closeStreams()
		if err == nil {
			err = ErrUnavailable
		}
		return nil, ResourceFile{}, err
	}
	if len(files) == 1 {
		return streams[0], files[0], nil
	}
	reader, writer := io.Pipe()
	go func() {
		defer closeStreams()
		archive := zip.NewWriter(writer)
		var writeErr error
		for i, file := range files {
			if writeErr = ctx.Err(); writeErr != nil {
				break
			}
			// Ordinals keep repeated filenames distinct without trusting IDs as paths.
			entry, err := archive.Create(fmt.Sprintf("%03d/%s", i+1, file.Name))
			if err != nil {
				writeErr = err
				break
			}
			if _, writeErr = io.Copy(entry, streams[i]); writeErr != nil {
				break
			}
		}
		if err := archive.Close(); writeErr == nil {
			writeErr = err
		}
		_ = writer.CloseWithError(writeErr)
	}()
	return reader, ResourceFile{Name: "artifacts.zip", MIME: "application/zip", Size: -1}, nil
}
