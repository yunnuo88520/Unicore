//go:build (desktop || bindings) && windows

// Author: yunnuo <ymz@ebox.vip>
// Description: Tray menu language detection via the Windows user interface language.
package main

import "golang.org/x/sys/windows"

var userDefaultUILanguage = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetUserDefaultUILanguage")

// systemLangZh reports whether the Windows UI language is Chinese.
func systemLangZh() bool {
	language, _, _ := userDefaultUILanguage.Call()
	return uint16(language)&0x03ff == 0x0004
}
