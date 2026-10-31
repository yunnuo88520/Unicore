// Author: yunnuo <ymz@ebox.vip>
// Description: Streaming age-encrypted snapshots with bounded extraction, checksums and no archive path traversal.
package maintenance

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"filippo.io/age"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

type Entry struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}
type CloudObject struct {
	ID   string `json:"id"`
	MIME string `json:"mime"`
	Size int64  `json:"size"`
}
type Manifest struct {
	Format         int           `json:"format"`
	Snapshot       string        `json:"snapshot"`
	Version        string        `json:"tool_version"`
	Created        time.Time     `json:"created_at"`
	Profile        string        `json:"profile"`
	Driver         string        `json:"driver"`
	Schema         int           `json:"schema"`
	BusinessSchema int           `json:"business_schema"`
	Files          []Entry       `json:"files"`
	Objects        []CloudObject `json:"objects"`
}
type archiveWriter struct {
	tar      *tar.Writer
	manifest *Manifest
}

func (a *archiveWriter) add(name string, size int64, reader io.Reader) error {
	if !safePath(name) || name == "manifest.json" {
		return errors.New("unsafe archive member")
	}
	if err := a.tar.WriteHeader(&tar.Header{Name: name, Size: size, Mode: 0600, Typeflag: tar.TypeReg}); err != nil {
		return err
	}
	hash := sha256.New()
	n, err := io.CopyN(io.MultiWriter(a.tar, hash), reader, size)
	if err != nil || n != size {
		return errors.New("snapshot source changed or could not be read")
	}
	var extra [1]byte
	if n, e := reader.Read(extra[:]); n != 0 || e != io.EOF {
		return errors.New("snapshot source size changed")
	}
	a.manifest.Files = append(a.manifest.Files, Entry{Path: name, Size: size, SHA256: hex.EncodeToString(hash.Sum(nil))})
	return nil
}
func (a *archiveWriter) file(name, source string) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("snapshot refuses symlinks and special files")
	}
	f, err := os.Open(source)
	if err != nil {
		return err
	}
	defer f.Close()
	return a.add(name, info.Size(), f)
}
func safePath(name string) bool {
	if name == "" || strings.ContainsAny(name, "\\\x00:") || path.Clean(name) != name || strings.HasPrefix(name, "/") || name == ".." || strings.HasPrefix(name, "../") {
		return false
	}
	return name == "manifest.json" || name == "database.sql" || strings.HasPrefix(name, "data/") || strings.HasPrefix(name, "objects/")
}
func writeArchive(output, password string, m *Manifest, write func(*archiveWriter) error) error {
	if len(password) < 12 {
		return errors.New("backup passphrase must contain at least 12 characters")
	}
	if _, err := os.Lstat(output); !errors.Is(err, os.ErrNotExist) {
		return errors.New("backup output must not already exist")
	}
	file, err := os.CreateTemp(filepath.Dir(output), ".unicore-backup-")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	recipient, err := age.NewScryptRecipient(password)
	if err != nil {
		return err
	}
	encrypted, err := age.Encrypt(file, recipient)
	if err != nil {
		return err
	}
	compressed := gzip.NewWriter(encrypted)
	tw := tar.NewWriter(compressed)
	writer := &archiveWriter{tar: tw, manifest: m}
	if err = write(writer); err != nil {
		return err
	}
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	if len(data) > 32<<20 {
		return errors.New("snapshot manifest exceeds 32 MiB")
	}
	if err = tw.WriteHeader(&tar.Header{Name: "manifest.json", Size: int64(len(data)), Mode: 0600, Typeflag: tar.TypeReg}); err != nil {
		return err
	}
	if _, err = tw.Write(data); err != nil {
		return err
	}
	for _, close := range []func() error{tw.Close, compressed.Close, encrypted.Close, file.Sync, file.Close} {
		if err = close(); err != nil {
			return err
		}
	}
	// A hard link publishes atomically and refuses to overwrite a concurrent output.
	return os.Link(file.Name(), output)
}
func readArchive(input, password, staging string, maxBytes int64) (Manifest, error) {
	var manifest Manifest
	if maxBytes <= 0 {
		maxBytes = 1 << 40
	}
	f, err := os.Open(input)
	if err != nil {
		return manifest, err
	}
	defer f.Close()
	identity, err := age.NewScryptIdentity(password)
	if err != nil {
		return manifest, err
	}
	identity.SetMaxWorkFactor(18)
	decrypted, err := age.Decrypt(f, identity)
	if err != nil {
		return manifest, errors.New("cannot decrypt backup; check passphrase or archive integrity")
	}
	gz, err := gzip.NewReader(decrypted)
	if err != nil {
		return manifest, errors.New("invalid backup compression")
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	actual := map[string]Entry{}
	var total int64
	found := false
	for {
		header, e := tr.Next()
		if e == io.EOF {
			break
		}
		if e != nil {
			return manifest, errors.New("invalid backup archive")
		}
		if !safePath(header.Name) || header.Typeflag != tar.TypeReg || header.Size < 0 || found || len(actual) >= 100000 {
			return manifest, errors.New("unsafe or oversized backup archive")
		}
		if _, ok := actual[header.Name]; ok {
			return manifest, errors.New("duplicate backup member")
		}
		if header.Name == "manifest.json" {
			if header.Size > 32<<20 {
				return manifest, errors.New("oversized manifest")
			}
			data, e := io.ReadAll(io.LimitReader(tr, header.Size+1))
			if e != nil {
				return manifest, e
			}
			if e = json.Unmarshal(data, &manifest); e != nil {
				return manifest, errors.New("invalid backup manifest")
			}
			found = true
			continue
		}
		if header.Size > maxBytes-total {
			return manifest, errors.New("backup exceeds configured extraction limit")
		}
		total += header.Size
		hash := sha256.New()
		var dest io.Writer = hash
		var out *os.File
		if staging != "" {
			target := filepath.Join(staging, filepath.FromSlash(header.Name))
			if e = os.MkdirAll(filepath.Dir(target), 0700); e != nil {
				return manifest, e
			}
			out, e = os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if e != nil {
				return manifest, e
			}
			dest = io.MultiWriter(hash, out)
		}
		n, e := io.Copy(dest, tr)
		if out != nil {
			e = errors.Join(e, out.Close())
		}
		if e != nil || n != header.Size {
			return manifest, errors.New("incomplete backup member")
		}
		actual[header.Name] = Entry{Path: header.Name, Size: n, SHA256: hex.EncodeToString(hash.Sum(nil))}
	}
	// Reach the authenticated final chunk, including gzip checksum; tar EOF alone is insufficient.
	if _, err = io.Copy(io.Discard, gz); err != nil {
		return manifest, errors.New("backup authentication or compression checksum failed")
	}
	if !found || manifest.Format != 1 || len(manifest.Files) != len(actual) || manifest.Snapshot == "" || (manifest.Driver != "sqlite" && manifest.Driver != "mysql" && manifest.Driver != "postgres") {
		return manifest, errors.New("incomplete or unsupported backup manifest")
	}
	seen := map[string]bool{}
	for _, expected := range manifest.Files {
		got, exists := actual[expected.Path]
		if !exists || seen[expected.Path] || got != expected {
			return manifest, fmt.Errorf("backup checksum mismatch")
		}
		seen[expected.Path] = true
	}
	return manifest, nil
}

func Verify(input, password string, maxBytes int64) (Manifest, error) {
	return readArchive(input, password, "", maxBytes)
}
