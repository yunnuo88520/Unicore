// Author: yunnuo <ymz@ebox.vip>
// Description: Preserve native operating-system verification when a release claims platform signing.
package updateinstall

import (
	"context"
	"github.com/yunnuo/unicore/internal/updates"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

func verifyPlatform(p Plan, trust updates.Trust) error {
	if p.Target.Profile != "desktop" || runtime.GOOS == "linux" {
		return nil
	}
	if p.Payload.Artifact.PlatformSignature == "unsigned" {
		if trust.AllowUnsignedPlatform {
			return nil
		}
		return updates.ErrRejected
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if runtime.GOOS == "darwin" {
		if p.Payload.Artifact.PlatformSignature != "developer-id-notarized" {
			return updates.ErrRejected
		}
		if exec.CommandContext(ctx, "/usr/bin/codesign", "--verify", "--strict", "--deep", "-R", `=identifier "`+trust.Application+`"`, p.NewRoot).Run() != nil {
			return updates.ErrRejected
		}
		if exec.CommandContext(ctx, "/usr/sbin/spctl", "--assess", "--type", "execute", p.NewRoot).Run() != nil {
			return updates.ErrRejected
		}
	} else if runtime.GOOS == "windows" {
		if p.Payload.Artifact.PlatformSignature != "authenticode" {
			return updates.ErrRejected
		}
		script := `$s=Get-AuthenticodeSignature -LiteralPath $env:UNICORE_VERIFY_TARGET; if ($s.Status -ne 'Valid') { exit 1 }`
		command := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
		command.Env = append(os.Environ(), "UNICORE_VERIFY_TARGET="+filepath.Join(p.NewRoot, p.RelativeExecutable))
		if command.Run() != nil {
			return updates.ErrRejected
		}
	}
	return nil
}
