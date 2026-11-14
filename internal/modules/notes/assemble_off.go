//go:build no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Keep only the disabled capability descriptor when notes are omitted.
package notes

import "github.com/yunnuo/unicore/internal/module"

var Module = module.Module{Slug: "notes", Edition: "notes", Enabled: false}
