// Author: yunnuo <ymz@ebox.vip>
// Description: Embed built browser assets for a single-binary server.
package webassets

import (
	"embed"
	"io/fs"
)

//go:embed all:static
var content embed.FS

func FS() fs.FS {
	assets, err := fs.Sub(content, "static")
	if err != nil {
		panic(err)
	}
	return assets
}
