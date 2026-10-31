// Author: yunnuo <ymz@ebox.vip>
// Description: Three-way upstream template sync: normalize to the framework naming, merge, re-apply the product identity; never force or silently drop product work.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyIdentity, applyIdentityContent, applyTokens, loadIdentity, reverseRenames, reverseTokenMaps } from './product-identity.mjs';
import { scanResiduals } from './check-product-residuals.mjs';

// In the framework checkout these commands are inactive: without project.provenance.json there is no derived project to sync.
function requireDerived(dir) {
  if (!existsSync(`${dir}/project.provenance.json`)) throw Error('This command runs inside a derived project; project.provenance.json is missing.');
  return JSON.parse(readFileSync(`${dir}/project.provenance.json`, 'utf8'));
}

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fetchTemplate(dir) {
  let remote;
  try { remote = git(dir, 'remote', 'get-url', 'framework'); } catch { throw Error('Add the read-only framework remote first: git remote add framework <upstream-url>'); }
  try { git(dir, 'fetch', 'framework', 'framework-template'); } catch (error) {
    throw Error(`Fetching framework-template from ${remote} failed; check network and the remote. ${error.stderr ?? error.message}`);
  }
  return git(dir, 'rev-parse', 'FETCH_HEAD');
}

function moduleFiles(dir) {
  const templateFiles = JSON.parse(readFileSync(`${dir}/distribution/manifest.json`, 'utf8')).template_files;
  return templateFiles.filter(path => /\.(go|mjs|mts|ts|tsx|json|md|ya?ml|html)$/.test(path) || ['Makefile', 'go.mod', 'Dockerfile'].includes(path.split('/').at(-1)))
    .filter(path => existsSync(`${dir}/${path}`));
}

function mergeBase(dir, upstream) {
  try { return git(dir, 'merge-base', 'HEAD', upstream); } catch {
    throw Error('No common ancestor with framework-template; this project was exported before the template branch existed. Re-create the project or graft the template history manually.');
  }
}

function previewConflicts(dir, upstream) {
  try { git(dir, 'merge-tree', '--write-tree', '--name-only', 'HEAD', upstream); return []; } catch (error) {
    if (error.status !== 1) return null; // Older git without merge-tree; conflicts surface during sync.
    return String(error.stdout ?? '').split('\n').filter(Boolean).slice(1);
  }
}

export function checkTemplate(dir = process.cwd()) {
  const provenance = requireDerived(dir);
  const upstream = fetchTemplate(dir);
  const base = mergeBase(dir, upstream);
  const changed = git(dir, 'diff', '--name-only', `${base}..${upstream}`).split('\n').filter(Boolean);
  return {
    framework_version: provenance.framework_version,
    local_template_version: git(dir, 'show', `${base}:VERSION`).trim(),
    upstream_template_version: git(dir, 'show', `${upstream}:VERSION`).trim(),
    upstream_commits: Number(git(dir, 'rev-list', '--count', `${base}..${upstream}`)),
    changed_files: changed,
    worktree_clean: git(dir, 'status', '--porcelain') === '',
    up_to_date: base === upstream,
    conflict_files: previewConflicts(dir, upstream),
  };
}

export function syncTemplate(dir = process.cwd()) {
  requireDerived(dir);
  const identity = loadIdentity(dir);
  if (git(dir, 'status', '--porcelain')) throw Error(`Commit or stash local changes before syncing:\n${git(dir, 'status', '--porcelain')}`);
  const upstream = fetchTemplate(dir);
  const base = mergeBase(dir, upstream);
  if (base === upstream) return { up_to_date: true, upstream_version: git(dir, 'show', `${upstream}:VERSION`).trim() };
  const frameworkIdentity = JSON.parse(git(dir, 'show', `${upstream}:product.identity.json`));
  const upstreamVersion = git(dir, 'show', `${upstream}:VERSION`).trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `backup/pre-sync-${stamp}`;
  git(dir, 'branch', backup, 'HEAD');
  const original = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  const temp = `unicore-sync-${stamp}`;
  git(dir, 'switch', '-c', temp);
  const restore = () => {
    try { if (existsSync(`${dir}/.git/MERGE_HEAD`)) git(dir, 'merge', '--abort'); } catch { /* merge already aborted */ }
    try { git(dir, 'switch', original); } catch { /* already on the original branch */ }
    try { git(dir, 'branch', '-D', temp); } catch { /* temp branch already deleted */ }
  };
  try {
    // Normalize the product tree to the framework template naming so the three-way merge only sees real content changes.
    for (const {from, to, tokens} of reverseRenames(frameworkIdentity, identity)) {
      if (!existsSync(`${dir}/${from}`)) continue;
      mkdirSync(join(dir, dirname(to)), { recursive: true });
      writeFileSync(`${dir}/${to}`, applyTokens(readFileSync(`${dir}/${from}`, 'utf8'), tokens));
      git(dir, 'rm', '-q', '--', from);
    }
    for (const [path, tokens] of reverseTokenMaps(frameworkIdentity, identity, dir)) {
      if (!existsSync(`${dir}/${path}`)) continue;
      writeFileSync(`${dir}/${path}`, applyTokens(readFileSync(`${dir}/${path}`, 'utf8'), tokens));
    }
    applyIdentityContent(dir, frameworkIdentity, false);
    const productModule = identity.go.module, frameworkModule = frameworkIdentity.go.module;
    if (productModule !== frameworkModule) for (const path of moduleFiles(dir)) {
      writeFileSync(`${dir}/${path}`, readFileSync(`${dir}/${path}`, 'utf8').replaceAll(productModule, frameworkModule));
    }
    git(dir, 'add', '-A');
    if (git(dir, 'status', '--porcelain')) git(dir, 'commit', '-qm', 'Normalize product identity to the framework template naming');
    let conflictFiles = [];
    try { git(dir, 'merge', '--no-ff', '--no-commit', upstream); } catch {
      conflictFiles = git(dir, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    }
    if (conflictFiles.length) {
      restore();
      throw Error(`Upstream merge conflicts; nothing was changed. Resolve these files manually (or align them upstream) and re-run:\n${conflictFiles.map(file => `  ${file}`).join('\n')}`);
    }
    if (productModule !== frameworkModule) for (const path of moduleFiles(dir)) {
      writeFileSync(`${dir}/${path}`, readFileSync(`${dir}/${path}`, 'utf8').replaceAll(frameworkModule, productModule));
    }
    applyIdentity(dir, identity, false);
    git(dir, 'add', '-A');
    if (git(dir, 'status', '--porcelain')) git(dir, 'commit', '-qm', `Sync framework template ${upstreamVersion}`);
    git(dir, 'switch', original);
    git(dir, 'merge', '--ff-only', temp);
    git(dir, 'branch', '-D', temp);
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('Upstream merge conflicts'))) restore();
    throw error;
  }
  applyIdentity(dir, identity, true);
  const residuals = scanResiduals(dir);
  if (residuals.length) throw Error(`Residue scan after sync failed:\n${residuals.join('\n')}`);
  const report = {
    backup_branch: backup,
    upstream_version: upstreamVersion,
    merged_commit: git(dir, 'rev-parse', 'HEAD'),
    files_changed: git(dir, 'diff', '--name-only', `${base}..HEAD`).split('\n').filter(Boolean),
  };
  mkdirSync(`${dir}/build`, { recursive: true });
  writeFileSync(`${dir}/build/sync-report-${stamp}.md`, `<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Framework template sync ${upstreamVersion}\n\n- backup: ${backup}\n- merged: ${report.merged_commit}\n- upstream files: ${report.files_changed.length}\n- residuals: PASS\n\nRun make docs and make test before pushing. Rollback: git reset --hard ${backup}.\n`);
  return { ...report, next_steps: ['make docs', 'make test', 'affected builds', 'push after review'] };
}

const root = fileURLToPath(new URL('../', import.meta.url));
const command = process.argv[2];
if (command === 'check' || command === 'sync') {
  try {
    if (!existsSync(`${root}project.provenance.json`)) {
      console.log(`SKIP framework ${command} (framework checkout, not a derived project)`);
    } else if (command === 'check') {
      const report = checkTemplate(root);
      console.log(report.up_to_date
        ? `PASS framework-template is up to date (${report.local_template_version}); worktree ${report.worktree_clean ? 'clean' : 'dirty'}`
        : `TODO framework-template ${report.local_template_version} -> ${report.upstream_template_version}: ${report.upstream_commits} commits, ${report.changed_files.length} files; worktree ${report.worktree_clean ? 'clean' : 'dirty'}`);
      if (report.conflict_files?.length) console.log(`Preview conflicts in:\n${report.conflict_files.map(file => `  ${file}`).join('\n')}`);
    } else {
      const report = syncTemplate(root);
      console.log(report.up_to_date
        ? `PASS framework-template already at ${report.upstream_version}`
        : `Synchronized framework template ${report.upstream_version}; backup ${report.backup_branch}; report ${report.files_changed.length} upstream files`);
      console.log(`Next: ${(report.next_steps ?? ['make docs', 'make test']).join('; ')}`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
} else if (command) {
  console.error('Use: framework-sync.mjs check|sync');
  process.exitCode = 1;
}
