// Author: yunnuo <ymz@ebox.vip>
// Description: Atomic private update history cache; a failed network check never erases embedded history.
package updatechannel

import (
	"encoding/json"
	"github.com/yunnuo/unicore/internal/updates"
	"os"
	"path/filepath"
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
	return os.Rename(name, path)
}
