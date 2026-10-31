//go:build linux

// Author: yunnuo <ymz@ebox.vip>
// Description: Atomic exchange keeps the installation path valid even if the host loses power.
package updateinstall

import "golang.org/x/sys/unix"

func exchange(a, b string) error {
	return unix.Renameat2(unix.AT_FDCWD, a, unix.AT_FDCWD, b, unix.RENAME_EXCHANGE)
}
