// Author: yunnuo <ymz@ebox.vip>
// Description: Classification regressions for cross-platform tool spawning: not-found, non-zero
// exit and successful runs stay distinct, and argument vectors survive a Windows shell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnTool } from './tool-spawn.mjs';

test('a missing command is classified as not-found with an actionable reason', () => {
  const run = spawnTool('unicore-definitely-not-a-tool-7f3a', ['--version']);
  assert.equal(run.ok, false);
  assert.equal(run.kind, 'not-found');
  assert.match(run.reason, /not installed or not on PATH/);
});

test('a non-zero exit keeps stdout and is not reported as missing', () => {
  const runner = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'exit 3'] : ['-c', 'echo payload >&2; exit 3'];
  const run = spawnTool(runner, args, { shell: false });
  assert.equal(run.ok, false);
  assert.equal(run.kind, 'exit');
  assert.match(run.reason, /exited with status 3/);
  if (process.platform !== 'win32') assert.match(run.output, /payload/);
});

test('node resolves with its version on both platforms through the same entry point', () => {
  const run = spawnTool(process.execPath.replace(/(^.+?)[\\/](node|node\.exe)$/, '$2') === 'node' ? 'node' : process.execPath, ['--version']);
  assert.equal(run.ok, true);
  assert.match(run.output, /^v\d+\.\d+\.\d+/);
});
