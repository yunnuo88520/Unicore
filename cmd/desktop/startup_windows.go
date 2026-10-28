//go:build (desktop || bindings) && windows

// Author: yunnuo <ymz@ebox.vip>
// Description: Surface startup failures even when a Windows GUI binary has no console.
package main

import (
	"strings"

	"github.com/yunnuo/unicore/assets/theme"
	"golang.org/x/sys/windows"
)

func showStartupError(err error) {
	title, _ := windows.UTF16PtrFromString(theme.Current.Brand.Name + " · 启动失败")
	message, _ := windows.UTF16PtrFromString("应用无法启动，请检查数据目录权限，或确认没有其他实例正在使用同一目录。\n\n错误详情：\n" + strings.ReplaceAll(err.Error(), "\x00", ""))
	_, _ = windows.MessageBox(0, message, title, windows.MB_OK|windows.MB_ICONERROR|windows.MB_SETFOREGROUND)
}
