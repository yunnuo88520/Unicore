// Author: yunnuo <ymz@ebox.vip>
// Description: Immutable, dialect-specific migrations embedded in Web/Desktop binaries.
package migrations

import "embed"

//go:embed sqlite/*.sql postgres/*.sql mysql/*.sql
var Files embed.FS
