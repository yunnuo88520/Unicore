// Author: yunnuo <ymz@ebox.vip>
// Description: Maintain the framework-template branch: an independent whitelist-only history whose commits chain per template update.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { copyDistribution } from './distribution.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// The template tree is the explicit project-template whitelist plus the framework's own product.identity.json.
// History starts from an orphan root commit, so no non-whitelisted file or framework history can leak into it.
export function updateTemplateBranch(root = process.cwd()) {
  if (git(root, 'status', '--porcelain')) throw Error('Commit or stash local changes before regenerating framework-template; the template must come from a committed tree.');
  const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  const staging = join(root, 'build/framework-template-export');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  copyDistribution(root, staging, 'project-template');
  cpSync(join(root, 'product.identity.json'), join(staging, 'product.identity.json'));
  git(root, '-C', staging, 'init', '-q');
  git(root, '-C', staging, 'add', '-A');
  const name = git(root, 'config', 'user.name'), email = git(root, 'config', 'user.email');
  git(root, '-C', staging, '-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-qm', `Framework template export ${version}`);
  git(root, 'fetch', staging);
  const tree = git(root, '-C', staging, 'rev-parse', 'HEAD^{tree}');
  rmSync(staging, { recursive: true, force: true });
  let parent = null;
  try { parent = git(root, 'rev-parse', '--verify', 'refs/heads/framework-template'); } catch { /* First template commit roots an independent history. */ }
  if (parent && tree === git(root, 'rev-parse', `${parent}^{tree}`)) return { parent, commit: parent, tree, updated: false, version };
  const commit = parent
    ? git(root, 'commit-tree', tree, '-p', parent, '-m', `Framework template ${version}`)
    : git(root, 'commit-tree', tree, '-m', `Framework template ${version}`);
  git(root, 'update-ref', 'refs/heads/framework-template', commit);
  return { parent, commit, tree, updated: true, version };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const result = updateTemplateBranch();
    console.log(result.updated
      ? `framework-template ${result.parent ? `${result.parent.slice(0, 12)} -> ` : ''}${result.commit.slice(0, 12)} (tree ${result.tree.slice(0, 12)}, template ${result.version})`
      : `framework-template already up to date at ${result.commit.slice(0, 12)} (template ${result.version})`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
