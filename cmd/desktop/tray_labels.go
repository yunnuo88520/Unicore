//go:build desktop || bindings

// Author: yunnuo <ymz@ebox.vip>
// Description: Tray menu labels shared by the per-OS tray implementations.
package main

import "github.com/yunnuo/unicore/assets/theme"

func trayOpenLabel() string {
	if systemLangZh() {
		return "打开 " + theme.Current.Brand.Name
	}
	return "Open " + theme.Current.Brand.Name
}

func trayQuitLabel() string {
	if systemLangZh() {
		return "退出"
	}
	return "Quit"
}
