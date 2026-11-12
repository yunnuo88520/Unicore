// Author: yunnuo <ymz@ebox.vip>
// Description: Three-way upstream template sync: normalize to the framework naming, merge, re-apply the product identity; never force or silently drop product work.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyIdentity, applyIdentityContent, applyTokens, loadIdentity, reverseRenames, reverseTokenMaps, validateIdentity, applyRepositoryLinks, replaceModuleReferences } from './product-identity.mjs';
import { scanResiduals } from './check-product-residuals.mjs';
import { regularFile, safePath } from './distribution.mjs';

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
  regularFile(dir, 'distribution/manifest.json');
  const manifest = JSON.parse(readFileSync(`${dir}/distribution/manifest.json`, 'utf8'));
  const paths = [...manifest.template_files.map(entry => typeof entry === 'string' ? entry : entry.target),
    ...manifest.documents.filter(doc => doc.audiences.includes('project-template')).map(doc => doc.target)];
  return [...new Set(paths.map(safePath))]
    .filter(path => /\.(go|mjs|mts|ts|tsx|json|md|ya?ml|html)$/.test(path) || ['Makefile', 'go.mod', 'Dockerfile'].includes(path.split('/').at(-1)))
    .filter(path => existsSync(`${dir}/${path}`)).map(path => { regularFile(dir, path); return path; });
}

function validateProjectionFiles(dir, state) {
  moduleFiles(dir);
  for (const path of ['product.identity.json', 'project.provenance.json', 'assets/brand/wordmark.svg',
    'deploy/tar/unicore.service', `deploy/tar/${state.identity.deployment.serviceName}.service`,
    'packages/web-ui/src/shell-tools.tsx', '.github/ISSUE_TEMPLATE/config.yml', 'SUPPORT.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md']) {
    if (existsSync(join(dir, path))) regularFile(dir, path);
  }
}

function applicationRepository(dir, provenance) {
  if (provenance.repository) return provenance.repository;
  // Older exports did not record the application's repository. Read the public
  // origin identity without fetching it or persisting any embedded credentials.
  let origin;
  try { origin = git(dir, 'remote', 'get-url', 'origin'); } catch { return null; }
  origin = origin.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
  return /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(origin) ? origin : null;
}

function mergeBase(dir, upstream) {
  try { return git(dir, 'merge-base', 'HEAD', upstream); } catch {
    throw Error('No common ancestor with framework-template; this project was exported before the template branch existed. Re-create the project or graft the template history manually.');
  }
}

function previewConflicts(dir, upstream) {
  try { git(dir, 'merge-tree', '--write-tree', '--name-only', '-z', 'HEAD', upstream); return []; } catch (error) {
    if (error.status !== 1) return null; // Older git without merge-tree; conflicts surface during sync.
    const fields = String(error.stdout ?? '').split('\0').slice(1);
    return fields.slice(0, fields.indexOf('') < 0 ? fields.length : fields.indexOf(''));
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

const stateFile = dir => join(dir, 'build/framework-sync-state.json');
const mergePending = dir => existsSync(resolve(dir, git(dir, 'rev-parse', '--git-path', 'MERGE_HEAD')));

function saveState(dir, state) {
  mkdirSync(join(dir, 'build'), { recursive: true });
  writeFileSync(stateFile(dir), JSON.stringify(state, null, 2) + '\n');
}
function pendingState(dir) {
  if (!existsSync(stateFile(dir))) throw Error('No pending framework sync.');
  const state = JSON.parse(readFileSync(stateFile(dir), 'utf8'));
  if (state.project !== realpathSync(dir) || !basename(state.tempRoot ?? '').startsWith('unicore-sync-') || state.worktree !== join(state.tempRoot, 'tree')) throw Error('Invalid framework sync state.');
  const common = root => realpathSync(resolve(root, git(root, 'rev-parse', '--git-common-dir')));
  if (common(dir) !== common(state.worktree)) throw Error('Sync worktree belongs to another repository.');
  return state;
}
function cleanup(dir, state) {
  const warnings = [];
  try { git(dir, 'worktree', 'remove', '--force', state.worktree); }
  catch { return ['Could not remove the sync worktree; use framework:sync --abort to clean it up.']; }
  try { rmSync(state.tempRoot, { recursive: true, force: true }); rmSync(stateFile(dir), { force: true }); }
  catch (error) { warnings.push(`Sync temporary files could not be removed: ${error.message}`); }
  return warnings;
}
function unchanged(dir, state) {
  if (git(dir, 'rev-parse', 'HEAD') !== state.originalHead || git(dir, 'symbolic-ref', '--short', 'HEAD') !== state.originalBranch || git(dir, 'status', '--porcelain')) {
    throw Error('The application branch or working tree changed during sync; restore it before continuing, or abort. Nothing was applied.');
  }
}
function finishSync(dir, state) {
  const stage = state.worktree;
  validateProjectionFiles(stage, state);
  const unresolved = git(stage, 'diff', '--name-only', '--diff-filter=U');
  if (unresolved) throw Error(`Resolve and git add these files in ${stage} before continuing:\n${unresolved}`);
  if (!mergePending(stage)) {
    try { git(stage, 'merge-base', '--is-ancestor', state.upstream, 'HEAD'); }
    catch { throw Error('The staged upstream merge is missing; abort this sync and start again.'); }
  }
  if (state.identity.go.module !== state.frameworkIdentity.go.module) for (const path of moduleFiles(stage)) {
    writeFileSync(join(stage, path), replaceModuleReferences(readFileSync(join(stage, path), 'utf8'), state.frameworkIdentity.go.module, state.identity.go.module));
  }
  // Identity and provenance belong to the application, including new upstream defaults.
  writeFileSync(join(stage, 'product.identity.json'), state.identityContent);
  writeFileSync(join(stage, 'project.provenance.json'), state.provenanceContent);
  applyRepositoryLinks(stage, state.applicationRepository);
  applyIdentity(stage, state.identity, false);
  applyIdentity(stage, state.identity, true);
  const residuals = scanResiduals(stage);
  if (residuals.length) throw Error(`Residue scan after sync failed; application branch unchanged:\n${residuals.join('\n')}`);
  git(stage, 'add', '-A');
  if (mergePending(stage) || git(stage, 'status', '--porcelain')) git(stage, 'commit', '-qm', `Sync framework template ${state.upstreamVersion}`);
  const merged = git(stage, 'rev-parse', 'HEAD');
  const changed = git(stage, 'diff', '--name-only', `${state.originalHead}..${merged}`).split('\n').filter(Boolean);
  unchanged(dir, state);
  git(dir, 'merge', '--ff-only', '--no-overwrite-ignore', merged);
  // All fallible validation precedes the fast-forward. Cleanup/report failures
  // are warnings, never a false claim that an already applied merge failed.
  const warnings = cleanup(dir, state);
  const report = { backup_branch: state.backup, upstream_version: state.upstreamVersion, merged_commit: merged,
    files_changed: changed, warnings };
  try {
    writeFileSync(join(dir, 'build', `sync-report-${state.stamp}.md`), `<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Framework template sync ${state.upstreamVersion}\n\n- backup: ${state.backup}\n- merged: ${merged}\n- residuals: PASS\n\nRun make docs, make test and affected builds before pushing. The backup branch preserves the pre-sync source; database rollback requires its own backup.\n`);
  } catch (error) { warnings.push(`Could not write sync report: ${error.message}`); }
  return { ...report, next_steps: ['make docs', 'make test', 'affected builds', 'push after review'] };
}

export function abortTemplateSync(dir = process.cwd()) {
  const state = pendingState(dir);
  const warnings = cleanup(dir, state);
  if (warnings.length) throw Error(warnings.join('\n'));
  return { aborted: true };
}
export function continueTemplateSync(dir = process.cwd()) {
  const state = pendingState(dir);
  unchanged(dir, state);
  return finishSync(dir, state);
}
export function syncTemplate(dir = process.cwd()) {
  requireDerived(dir);
  if (existsSync(stateFile(dir))) throw Error('A sync is pending. Resolve it with framework:sync --continue or discard its isolated worktree with framework:sync --abort.');
  if (git(dir, 'status', '--porcelain')) throw Error(`Commit or stash local changes before syncing:\n${git(dir, 'status', '--porcelain')}`);
  const originalBranch = git(dir, 'symbolic-ref', '--short', 'HEAD');
  const upstream = fetchTemplate(dir);
  const base = mergeBase(dir, upstream);
  if (base === upstream) return { up_to_date: true, upstream_version: git(dir, 'show', `${upstream}:VERSION`).trim() };
  const applicationRepo = applicationRepository(dir, requireDerived(dir));
  const tempRoot = mkdtempSync(join(tmpdir(), 'unicore-sync-'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + basename(tempRoot).slice(-6);
  const state = { project: realpathSync(dir), tempRoot, worktree: join(tempRoot, 'tree'), stamp,
    applicationRepository: applicationRepo, backup: `backup/pre-sync-${stamp}`, originalHead: git(dir, 'rev-parse', 'HEAD'), originalBranch, upstream,
    identity: loadIdentity(dir), frameworkIdentity: validateIdentity(JSON.parse(git(dir, 'show', `${upstream}:product.identity.json`))),
    identityContent: readFileSync(join(dir, 'product.identity.json'), 'utf8'), provenanceContent: readFileSync(join(dir, 'project.provenance.json'), 'utf8'),
    upstreamVersion: git(dir, 'show', `${upstream}:VERSION`).trim() };
  let keep = false;
  try {
    git(dir, 'branch', state.backup, state.originalHead);
    git(dir, 'worktree', 'add', '--detach', state.worktree, state.originalHead);
    saveState(dir, state);
    const stage = state.worktree;
    validateProjectionFiles(stage, state);
    for (const {from, to, tokens} of reverseRenames(state.frameworkIdentity, state.identity)) {
      if (!existsSync(join(stage, from))) continue;
      mkdirSync(join(stage, dirname(to)), { recursive: true });
      writeFileSync(join(stage, to), applyTokens(readFileSync(join(stage, from), 'utf8'), tokens));
      git(stage, 'rm', '-q', '--', from);
    }
    for (const [path, tokens] of reverseTokenMaps(state.frameworkIdentity, state.identity, stage)) {
      if (existsSync(join(stage, path))) writeFileSync(join(stage, path), applyTokens(readFileSync(join(stage, path), 'utf8'), tokens));
    }
    applyIdentityContent(stage, state.frameworkIdentity, false);
    if (state.identity.go.module !== state.frameworkIdentity.go.module) for (const path of moduleFiles(stage)) {
      writeFileSync(join(stage, path), replaceModuleReferences(readFileSync(join(stage, path), 'utf8'), state.identity.go.module, state.frameworkIdentity.go.module));
    }
    git(stage, 'add', '-A');
    if (git(stage, 'status', '--porcelain')) git(stage, 'commit', '-qm', 'Normalize product identity to the framework template naming');
    try { git(stage, 'merge', '--no-ff', '--no-commit', upstream); }
    catch (error) {
      const conflicts = git(stage, 'diff', '--name-only', '--diff-filter=U');
      if (!conflicts) throw error;
      keep = true;
      throw Error(`Upstream merge conflicts; application branch unchanged. Resolve and git add files in ${stage}, then run framework:sync --continue; or framework:sync --abort.\n${conflicts}`);
    }
    return finishSync(dir, state);
  } catch (error) {
    if (!keep) cleanup(dir, state);
    throw error;
  }
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
      const option = process.argv[3];
      if (option && !['--continue', '--abort'].includes(option)) throw Error('Use framework:sync [--continue|--abort]');
      const report = option === '--continue' ? continueTemplateSync(root) : option === '--abort' ? abortTemplateSync(root) : syncTemplate(root);
      if (report.aborted) { console.log('Aborted isolated framework sync; application branch unchanged.'); process.exit(0); }
      console.log(report.up_to_date
        ? `PASS framework-template already at ${report.upstream_version}`
        : `Synchronized framework template ${report.upstream_version}; backup ${report.backup_branch}; report ${report.files_changed.length} upstream files`);
      console.log(`Next: ${(report.next_steps ?? ['make docs', 'make test']).join('; ')}`);
      for (const warning of report.warnings ?? []) console.warn(warning);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
} else if (command) {
  console.error('Use: framework-sync.mjs check|sync');
  process.exitCode = 1;
}
