//go:build windows

// Author: yunnuo <ymz@ebox.vip>
// Description: Disk deduplication helper on windows, where mount dedup by path is enough.
package monitor

// sameDevice has no portable device id on windows; dedup stays path-based.
func sameDevice(a, b string) bool { return false }
