// Author: yunnuo <ymz@ebox.vip>
// Description: Reject tampering, unsafe members and incomplete manifests before publishing any restored directory.
package maintenance

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"filippo.io/age"
)

func TestArchiveIntegrity(t *testing.T) {
	root := t.TempDir()
	archive := filepath.Join(root, "valid.age")
	m := Manifest{Format: 1, Snapshot: "test", Driver: "sqlite"}
	if err := writeArchive(archive, testPassphrase, &m, func(a *archiveWriter) error { return a.add("data/payload", 5, bytes.NewBufferString("bytes")) }); err != nil {
		t.Fatal(err)
	}
	if _, err := Verify(archive, testPassphrase, 5); err != nil {
		t.Fatal(err)
	}
	if _, err := Verify(archive, testPassphrase, 4); err == nil {
		t.Fatal("extraction limit ignored")
	}
	encrypted, _ := os.ReadFile(archive)
	for name, raw := range map[string][]byte{"truncated": encrypted[:len(encrypted)-10], "corrupt": append(append([]byte{}, encrypted[:len(encrypted)-1]...), encrypted[len(encrypted)-1]^1)} {
		p := filepath.Join(root, name)
		os.WriteFile(p, raw, 0600)
		if _, err := Verify(p, testPassphrase, 100); err == nil {
			t.Fatal(name, "accepted")
		}
	}
	for _, name := range []string{"../escape", "data/../../escape", "/data/escape", "data\\escape", "objects/a/../b", "database.sql:bad"} {
		if safePath(name) {
			t.Fatal("unsafe path", name)
		}
	}
	for _, test := range []struct {
		name, path string
		kind       byte
		files      []Entry
	}{
		{"traversal", "../escape", tar.TypeReg, nil},
		{"symlink", "data/link", tar.TypeSymlink, nil},
		{"missing-member", "data/payload", tar.TypeReg, []Entry{{Path: "data/missing", Size: 5, SHA256: "unknown"}}},
		{"zero-entry", "data/payload", tar.TypeReg, []Entry{{}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			p := filepath.Join(root, test.name+".age")
			f, e := os.Create(p)
			if e != nil {
				t.Fatal(e)
			}
			recipient, _ := age.NewScryptRecipient(testPassphrase)
			recipient.SetWorkFactor(10)
			encrypted, e := age.Encrypt(f, recipient)
			if e != nil {
				t.Fatal(e)
			}
			gz := gzip.NewWriter(encrypted)
			tw := tar.NewWriter(gz)
			size := int64(5)
			if test.kind == tar.TypeSymlink {
				size = 0
			}
			tw.WriteHeader(&tar.Header{Name: test.path, Typeflag: test.kind, Size: size, Linkname: "../../escape", Mode: 0600})
			if size > 0 {
				io.WriteString(tw, "bytes")
			}
			manifest := Manifest{Format: 1, Snapshot: "test", Driver: "sqlite", Files: test.files}
			raw, _ := json.Marshal(manifest)
			tw.WriteHeader(&tar.Header{Name: "manifest.json", Size: int64(len(raw)), Typeflag: tar.TypeReg, Mode: 0600})
			tw.Write(raw)
			tw.Close()
			gz.Close()
			encrypted.Close()
			f.Close()
			destination := filepath.Join(root, "restore-"+test.name)
			if _, e = Restore(nil, RestoreOptions{Input: p, DataDir: destination, Password: testPassphrase}); e == nil {
				t.Fatal("unsafe snapshot accepted")
			}
			if _, e = os.Stat(destination); !os.IsNotExist(e) {
				t.Fatal("failed restore published destination")
			}
		})
	}
}
