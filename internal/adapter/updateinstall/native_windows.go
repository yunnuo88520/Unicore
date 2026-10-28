//go:build windows

// Author: yunnuo <ymz@ebox.vip>
// Description: Windows keeps the directory stable and replaces the exited desktop executable atomically.
package updateinstall

import (
	"os"
	"os/exec"
	"syscall"
)

func detach(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x08000000 | 0x00000200}
}
func exchange(a, b string) error { return os.Rename(b, a) }
