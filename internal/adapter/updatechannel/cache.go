// Author: yunnuo <ymz@ebox.vip>
// Description: Atomic private update history cache; a failed network check never erases embedded history.
package updatechannel

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/yunnuo/unicore/internal/updates"
)

type FileCache struct{ Directory string }

func (c FileCache) Load() updates.Catalog {
	var data updates.Catalog
	raw, e := os.ReadFile(filepath.Join(c.Directory, "catalog.json"))
	if e == nil && len(raw) <= 3*1024*1024 {
		_ = json.Unmarshal(raw, &data)
	}
	return data
}
func (c FileCache) Save(data updates.Catalog) error {
	raw, e := json.Marshal(data)
	if e != nil {
		return e
	}
	return Atomic(filepath.Join(c.Directory, "catalog.json"), raw)
}
func Atomic(path string, raw []byte) error {
	if e := os.MkdirAll(filepath.Dir(path), 0700); e != nil {
		return e
	}
	f, e := os.CreateTemp(filepath.Dir(path), ".update-*")
	if e != nil {
		return e
	}
	name := f.Name()
	defer os.Remove(name)
	if e = f.Chmod(0600); e == nil {
		_, e = f.Write(raw)
	}
	if e == nil {
		e = f.Sync()
	}
	closeErr := f.Close()
	if e != nil {
		return e
	}
	if closeErr != nil {
		return closeErr
	}
	return renameOverSharingViolation(name, path)
}

// renameOverSharingViolation replaces path with the fully written temp file.
// On Windows the rename fails while the destination is briefly held open — a
// real-time scanner or the sibling process writing the same state file — so a
// bounded retry resolves the transient window. Every caller writes idempotent
// state, and the old file stays intact until the rename lands.
func renameOverSharingViolation(name, path string) error {
	if runtime.GOOS != "windows" {
		return os.Rename(name, path)
	}
	var err error
	for attempt := 0; attempt < 12; attempt++ {
		if err = os.Rename(name, path); err == nil {
			return nil
		}
		// Real-time scanners hold freshly written files for seconds, not
		// milliseconds: the backoff spreads ~7.5s across twelve attempts.
		time.Sleep(time.Duration(min(100*(attempt+1), 1000)) * time.Millisecond)
	}
	return err
}
