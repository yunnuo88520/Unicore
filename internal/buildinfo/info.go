// Author: yunnuo <ymz@ebox.vip>
// Description: Shared release metadata, injected with Go linker flags.
package buildinfo

var (
	Version   = sourceVersion
	Commit    = "dev"
	BuildTime = "unknown"
)
