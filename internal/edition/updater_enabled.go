//go:build updater

// Author: yunnuo <ymz@ebox.vip>
// Description: Optional release lookup port; application and signature verification are deferred.
package edition

import "context"

const Updater = true

type Release struct {
	Version, UpdateLog string
}

type ReleaseProvider interface {
	Latest(context.Context) (Release, error)
}
