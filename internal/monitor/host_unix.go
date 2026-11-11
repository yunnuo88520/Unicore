//go:build unix

// Author: yunnuo <ymz@ebox.vip>
// Description: Same-device detection for disk deduplication on unix platforms.
package monitor

import "syscall"

// sameDevice reports whether two paths live on one filesystem instance; APFS
// firmlinks (macOS / vs /System/Volumes/Data) and bind mounts share a device.
func sameDevice(a, b string) bool {
	var first, second syscall.Stat_t
	if err := syscall.Stat(a, &first); err != nil {
		return false
	}
	if err := syscall.Stat(b, &second); err != nil {
		return false
	}
	return first.Dev == second.Dev
}
