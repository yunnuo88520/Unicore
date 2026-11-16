//go:build (desktop || bindings) && !darwin && !windows

// Author: yunnuo <ymz@ebox.vip>
// Description: Tray menu language detection from the POSIX locale environment.
package main

import (
	"os"
	"strings"
)

// systemLangZh reports whether the POSIX locale environment prefers Chinese.
func systemLangZh() bool {
	for _, key := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		if value, ok := os.LookupEnv(key); ok && strings.HasPrefix(strings.ToLower(value), "zh") {
			return true
		}
	}
	return false
}
