// Author: yunnuo <ymz@ebox.vip>
// Description: Cross-platform spawning for package-manager shims (pnpm.cmd/npm.cmd) with
// accurate failure classification: not-found, launch-failed and non-zero exit stay distinct.
// Arguments must be argument vectors without shell metacharacters; Windows runs them through
// the command interpreter because Node refuses to spawn .cmd shims directly (EINVAL,
// CVE-2024-27980), POSIX keeps direct execution so exit codes and stdio stay untouched.
import { spawnSync } from 'node:child_process';

export function spawnTool(name, args, { encoding = 'utf8', timeout, input, cwd } = {}) {
  const result = spawnSync(name, args, { encoding, timeout, input, cwd, shell: process.platform === 'win32' });
  return classify(name, result);
}

export function classify(name, result) {
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  if (result.error) {
    if (result.error.code === 'ENOENT') return { ok: false, kind: 'not-found', output, reason: `${name} is not installed or not on PATH` };
    return { ok: false, kind: 'launch-failed', output, reason: `${name} failed to start (${result.error.code})` };
  }
  if (result.status !== 0) return { ok: false, kind: 'exit', output, reason: `${name} exited with status ${result.status}` };
  return { ok: true, kind: 'ok', output };
}
