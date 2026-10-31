// Author: yunnuo <ymz@ebox.vip>
// Description: Embed the desktop build separately from the browser entry point.
package desktopassets

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
