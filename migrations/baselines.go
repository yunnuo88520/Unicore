// Author: yunnuo <ymz@ebox.vip>
// Description: Embed the Catalog SQL trees used by installation and startup; never imported by CLI.
package migrations

import "embed"

//go:embed core platform modules
var Baselines embed.FS
