//go:build linux || darwin

// Author: yunnuo <ymz@ebox.vip>
// Description: Detached update helper and atomic directory exchange on supported native filesystems.
package updateinstall

import (
	"os/exec"
	"syscall"
)

func detach(command *exec.Cmd) { command.SysProcAttr = &syscall.SysProcAttr{Setsid: true} }
