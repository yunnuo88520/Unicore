// Author: yunnuo <ymz@ebox.vip>
// Description: Identify the exact signed target executable during interrupted-update recovery.
package updateinstall

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func archiveExecutableHash(archivePath string, p Plan) (string, error) {
	file, e := os.Open(archivePath)
	if e != nil {
		return "", e
	}
	defer file.Close()
	z, e := gzip.NewReader(file)
	if e != nil {
		return "", e
	}
	defer z.Close()
	r := tar.NewReader(z)
	suffix := "/" + filepath.ToSlash(p.RelativeExecutable)
	for {
		h, e := r.Next()
		if e != nil {
			return "", e
		}
		if h.Typeflag == tar.TypeReg && strings.HasSuffix(h.Name, suffix) {
			hash := sha256.New()
			_, e = io.Copy(hash, io.LimitReader(r, 256*1024*1024))
			return hex.EncodeToString(hash.Sum(nil)), e
		}
	}
}
