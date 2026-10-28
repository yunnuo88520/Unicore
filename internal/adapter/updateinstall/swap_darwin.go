//go:build darwin

// Author: yunnuo <ymz@ebox.vip>
// Description: Exchange complete signed app bundles without a missing-installation window.
package updateinstall

import "golang.org/x/sys/unix"

func exchange(a, b string) error { return unix.RenamexNp(a, b, unix.RENAME_SWAP) }
