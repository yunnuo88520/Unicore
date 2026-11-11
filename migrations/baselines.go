// Author: yunnuo <ymz@ebox.vip>
// Description: Embed the new-generation baseline trees alongside the legacy assets; consumed by the catalog runner, not by the legacy Store.Migrate.
package migrations

import "embed"

//go:embed core platform modules
var Baselines embed.FS
