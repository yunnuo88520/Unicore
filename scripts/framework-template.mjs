// Author: yunnuo <ymz@ebox.vip>
// Description: Maintain the framework-template branch: an independent whitelist-only history whose commits chain per template update.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { copyDistribution } from './distribution.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// The template tree is the explicit project-template whitelist plus the framework's own product.identity.json.
// History starts from an orphan root commit, so no non-whitelisted file or framework history can leak into it.
// `readmes` seeds the rewritten README pair from the caller (baseline validation reuses the
// candidate template's own READMEs so generator wording changes never fake drift).
export function exportTemplateTree(root = process.cwd(), { readmes } = {}) {
  const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  const sourceCommit = git(root, 'rev-parse', 'HEAD');
  // Staging lives outside the checkout: callers validate baseline ancestors on
  // sources they must not dirty, and build/ is only ignored in the real framework.
  const staging = mkdtempSync(join(tmpdir(), 'unicore-template-export-'));
  try {
    copyDistribution(root, staging, 'project-template');
    cpSync(join(root, 'product.identity.json'), join(staging, 'product.identity.json'));
    // The framework README links maintainer-facing documents that stay outside the
    // template whitelist; the template tree carries a self-contained pair instead.
    const readme = readmes?.md ?? `<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Unicore 应用模板\n\n**简体中文** · [English](README.en.md)\n\n本仓库由 [Unicore](https://github.com/yunnuo88520/Unicore) 框架模板生成：一份核心，运行于 Web、桌面与 CLI。产品身份唯一入口为 \`product.identity.json\`，上游源码同步见 docs/product/framework-upgrade.md。\n\n开发：\n\n\`\`\`sh\nmake install\nmake docs\nmake test\nmake dev-server\n# 第二个终端\nmake dev-web\n\`\`\`\n\n首次启动访问 /install（桌面自动初始化本地数据库，CLI 不连接数据库）。功能边界与部署指南见 [docs/product](docs/product/index.md)。笔记是可选 demo，关闭方法见 [功能裁剪](docs/product/features.md)。\n`;
    const readmeEn = readmes?.en ?? `<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Unicore application template\n\n[简体中文](README.md) · **English**\n\nThis repository is generated from the [Unicore](https://github.com/yunnuo88520/Unicore) framework template: one core serving Web, desktop and CLI. \`product.identity.json\` is the single product-identity entry; see docs/product/framework-upgrade.md for upstream source sync.\n\nDevelopment:\n\n\`\`\`sh\nmake install\nmake docs\nmake test\nmake dev-server\n# In a second terminal:\nmake dev-web\n\`\`\`\n\nOpen /install on first Web launch (desktop initializes its local database; CLI has no database). Boundaries and deployment guides live in [docs/product](docs/product/index.md). Notes is an optional demo; see [feature trimming](docs/product/features.md).\n`;
    writeFileSync(join(staging, 'README.md'), readme);
    writeFileSync(join(staging, 'README.en.md'), readmeEn);
    // The template tree ships its generated AI context so a fresh checkout passes
    // make test without a prior make docs run. Fixtures without the generator skip it.
    if (existsSync(join(root, 'scripts', 'ai-context.mjs'))) {
      execFileSync(process.execPath, [join(root, 'scripts', 'ai-context.mjs')], { cwd: staging, stdio: ['ignore', 'pipe', 'inherit'] });
    }
    git(root, '-C', staging, 'init', '-q');
    git(root, '-C', staging, 'add', '-A');
    // CI runners carry no git identity; the mechanical template export falls back to the project author.
    const gitIdentity = (key, fallback) => { try { const value = git(root, 'config', key); if (value) return value; } catch { /* Unset identity uses the fallback. */ } return fallback; };
    const name = gitIdentity('user.name', 'yunnuo'), email = gitIdentity('user.email', 'ymz@ebox.vip');
    git(root, '-C', staging, '-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-qm', `Framework template export ${version}`);
    // Copy the staging objects into the caller's repository: updateTemplateBranch
    // builds the template commit with commit-tree there, and a returned tree sha
    // is only usable while its objects exist in that object database.
    git(root, 'fetch', staging);
    return { tree: git(root, '-C', staging, 'rev-parse', 'HEAD^{tree}'), version, source_commit: sourceCommit };
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

export function updateTemplateBranch(root = process.cwd()) {
  if (git(root, 'status', '--porcelain')) throw Error('Commit or stash local changes before regenerating framework-template; the template must come from a committed tree.');
  let origin = false;
  try { git(root, 'remote', 'get-url', 'origin'); origin = true; } catch { /* Offline fixtures and first publication. */ }
  if (origin) {
    // Fetch by explicit ref: single-branch/shallow clones may have no tracking ref.
    const published = git(root, 'ls-remote', '--heads', 'origin', 'refs/heads/framework-template');
    if (published) git(root, 'fetch', 'origin', 'refs/heads/framework-template:refs/remotes/origin/framework-template');
  }
  const { tree, version, source_commit: sourceCommit } = exportTemplateTree(root);
  let parent = null;
  try { parent = git(root, 'rev-parse', '--verify', 'refs/heads/framework-template'); } catch { /* First template commit roots an independent history. */ }
  const expected = parent;
  // Fresh clones have only the remote-tracking template ref. Never start a
  // second orphan history when an existing published lineage is available.
  let published = null;
  try { published = git(root, 'rev-parse', '--verify', 'refs/remotes/origin/framework-template'); } catch { /* First publication. */ }
  if (!parent) parent = published;
  else if (published && parent !== published) {
    const ancestor = (a, b) => { try { git(root, 'merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
    if (ancestor(parent, published)) parent = published;
    else if (!ancestor(published, parent)) throw Error('Local and published framework-template histories diverged; reconcile them without force-pushing.');
  }
  if (parent && tree === git(root, 'rev-parse', `${parent}^{tree}`)) { git(root, 'update-ref', 'refs/heads/framework-template', parent, expected ?? '0'.repeat(parent.length)); return { parent, commit: parent, tree, updated: false, version, source_commit: sourceCommit }; }
  const commit = parent
    ? git(root, 'commit-tree', tree, '-p', parent, '-m', `Framework template ${version}`, '-m', `Source: ${sourceCommit}`)
    : git(root, 'commit-tree', tree, '-m', `Framework template ${version}`, '-m', `Source: ${sourceCommit}`);
  git(root, 'update-ref', 'refs/heads/framework-template', commit, expected ?? '0'.repeat(commit.length));
  return { parent, commit, tree, updated: true, version, source_commit: sourceCommit };
}

// pathToFileURL, not a manual file:// concat: Windows drive paths (D:\a\...)
// produce an invalid URL with the naive form and the CLI silently never ran.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    // Baseline validation runs this source checkout's own generator so an old
    // template is compared against what its contemporary generator produced.
    if (process.argv[2] === '--export-tree') {
      const { tree, version, source_commit: sourceCommit } = exportTemplateTree();
      console.log(JSON.stringify({ tree, version, source_commit: sourceCommit }));
      process.exit(0);
    }
    const result = updateTemplateBranch();
    console.log(result.updated
      ? `framework-template ${result.parent ? `${result.parent.slice(0, 12)} -> ` : ''}${result.commit.slice(0, 12)} (tree ${result.tree.slice(0, 12)}, template ${result.version}, source ${result.source_commit.slice(0, 12)})`
      : `framework-template already up to date at ${result.commit.slice(0, 12)} (template ${result.version}, source ${result.source_commit.slice(0, 12)})`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
