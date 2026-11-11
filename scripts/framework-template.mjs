// Author: yunnuo <ymz@ebox.vip>
// Description: Maintain the framework-template branch: an independent whitelist-only history whose commits chain per template update.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  // The framework README links maintainer-facing documents that stay outside the
  // template whitelist; the template tree carries a self-contained pair instead.
  const readme = `<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Unicore 应用模板\n\n**简体中文** · [English](README.en.md)\n\n本仓库由 [Unicore](https://github.com/yunnuo88520/Unicore) 框架模板生成：一份核心，运行于 Web、桌面与 CLI。产品身份唯一入口为 \`product.identity.json\`，上游同步见 docs/product/updates.md。\n\n开发：\n\n\`\`\`sh\nmake install\nmake docs\nmake test\nmake dev-server\n# 第二个终端\nmake dev-web\n\`\`\`\n\n首次启动访问 /install（桌面自动初始化本地数据库，CLI 不连接数据库）。功能边界与部署指南见 [docs/product](docs/product/index.md)。\n`;
  const readmeEn = `<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Unicore application template\n\n[简体中文](README.md) · **English**\n\nThis repository is generated from the [Unicore](https://github.com/yunnuo88520/Unicore) framework template: one core serving Web, desktop and CLI. \`product.identity.json\` is the single product-identity entry; see docs/product/updates.md for upstream sync.\n\nDevelopment:\n\n\`\`\`sh\nmake install\nmake docs\nmake test\nmake dev-server\n# In a second terminal:\nmake dev-web\n\`\`\`\n\nOpen /install on first Web launch (desktop initializes its local database; CLI has no database). Boundaries and deployment guides live in [docs/product](docs/product/index.md).\n`;
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
  const name = gitIdentity('config', 'user.name', 'yunnuo'), email = gitIdentity('config', 'user.email', 'ymz@ebox.vip');
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
