// Author: yunnuo <ymz@ebox.vip>
// Description: Export an explicit application template; reject accidental dirty-source copies and retain input provenance.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyDistribution, distributionPlan, regularFile, validateDocuments } from './distribution.mjs';
import { exportTemplateTree } from './framework-template.mjs';
import { applyIdentity, applyRepositoryLinks, validateIdentity, replaceModuleReferences } from './product-identity.mjs';
import { writeAIContext } from './ai-context.mjs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const frameworkRoot = fileURLToPath(new URL('../', import.meta.url));

// The generator owns README rewrites, file mapping and generated context, so a raw
// whitelist diff lies about template drift: compare the candidate template's tree
// against a real fresh export instead. Both sides are tree objects, so no file list
// ever travels on the command line (Windows command-length limit). The README pair
// is seeded from the candidate template itself so generator wording changes never
// fake drift, and the source checkout's own generator runs when it supports it.
function templateDrift(git, source, templateRevision, dirty) {
  let worktree = null;
  try {
    // The ancestor corresponds to the committed state: a reviewed-dirty checkout
    // layers deliberate changes on top, so export HEAD instead of the worktree.
    let exportRoot = source;
    if (dirty) {
      worktree = mkdtempSync(join(tmpdir(), 'unicore-ancestor-'));
      git('worktree', 'add', '--detach', worktree, 'HEAD');
      exportRoot = worktree;
    }
    const readmes = {};
    for (const [key, path] of [['md', 'README.md'], ['en', 'README.en.md']]) {
      // Byte-exact seed: trimming would drop the trailing newline and fake a diff.
      try { readmes[key] = execFileSync('git', ['-C', source, 'show', `${templateRevision}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { /* Old trees without the pair keep the generator default. */ }
    }
    let tree;
    const generator = join(exportRoot, 'scripts', 'framework-template.mjs');
    if (existsSync(generator) && readFileSync(generator, 'utf8').includes('--export-tree')) {
      // The generator defaults to the calling directory's checkout: without cwd the
      // export would read the invoker's VERSION and catalog instead of the source's.
      tree = JSON.parse(execFileSync(process.execPath, [generator, '--export-tree'], { cwd: exportRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).tree;
    } else {
      // Old checkouts predate --export-tree; reconstruct with this checkout's
      // generator (the whitelist, files and AI context still come from the source).
      tree = exportTemplateTree(exportRoot, { readmes: Object.keys(readmes).length ? readmes : undefined }).tree;
    }
    const old = git('rev-parse', `${templateRevision}^{tree}`);
    if (old === tree) return null;
    return git('diff', '--stat', old, tree).trim() || 'the template tree differs from a fresh export of this source checkout';
  } finally {
    if (worktree) {
      try { git('worktree', 'remove', '--force', worktree); } catch { /* best effort cleanup */ }
      rmSync(worktree, { recursive: true, force: true });
    }
  }
}

// `author` is the application team's own identity (identity + provenance): their code,
// SQL and docs are downstream sources and do not carry the framework author header.
// `version` is the application's own product version (VERSION single source); it is
// independent of the framework version recorded in provenance.
export function createProject({ source = frameworkRoot, directory, name, module, bundle, slug, repository, author = 'yunnuo <ymz@ebox.vip>', version = '0.1.0', allowDirty = false }) {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug ?? '')) throw Error('slug must contain 2–40 lowercase letters, digits or hyphens');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,39}$/u.test(name ?? '')) throw Error('name must contain 2–40 letters, digits, spaces, dots, underscores or hyphens');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\/[a-zA-Z0-9_./-]+$/.test(module ?? '') || module.includes('..')) throw Error('module must be a Go module path, e.g. github.com/team/product');
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/.test(bundle ?? '')) throw Error('bundle must be a reverse-domain application identifier');
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '')) throw Error('version must be a numeric SemVer (major.minor.patch); it is the application product version, independent of the framework');
  if (repository !== undefined && (typeof repository !== 'string' || !/^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*\/?$/.test(repository))) throw Error('repository must be an HTTPS GitHub repository URL without credentials, query or fragment');
  const repositoryUrl = repository?.replace(/\/$/, '').replace(/\.git$/, '');
  source = realpathSync(resolve(source)); let target = resolve(directory);
  if (target === source || relative(source, target).split(sep)[0] !== '..' && !isAbsolute(relative(source, target))) throw Error('destination must be outside the framework checkout');
  if (existsSync(target)) throw Error('destination already exists; choose a new directory');
  const plan = distributionPlan(source, 'project-template');
  validateDocuments(source, plan.filter(file => file.target.startsWith('docs/product/')));
  const selected = [...new Set(plan.map(file => file.source))];
  const git = (...args) => execFileSync('git', ['--no-optional-locks', '-C', source, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  let upstream = null, dirty = false, worktreeModified = false, templateRevision = null;
  // "Source is a repository root" is git's own comparison to make: --show-prefix is
  // empty exactly at the toplevel. String-comparing git's printed path with Node's
  // realpath silently fails on Windows (forward slashes, 8.3 short names, case).
  try { if (git('rev-parse', '--show-prefix') === '') upstream = git('rev-parse', '--verify', 'HEAD'); } catch { /* Source archives have no Git identity. */ }
  if (upstream) {
    for (const ref of ['refs/heads/framework-template', 'refs/remotes/origin/framework-template']) {
      try { templateRevision = git('rev-parse', '--verify', ref); break; } catch { /* Template branch not generated in this checkout. */ }
    }
    worktreeModified = Boolean(git('status', '--porcelain'));
    // Hundreds of pathspecs overflow the Windows command line; diff the whole tree
    // (NUL-separated, unquoted) and filter to the selected set here instead.
    const selectedSet = new Set(selected);
    const changed = git('diff', '--name-only', '-z', 'HEAD').split('\0').filter(path => selectedSet.has(path));
    const tracked = new Set(git('ls-files', '--cached', '-z').split('\0'));
    dirty = Boolean(changed.length || selected.some(path => !tracked.has(path)));
    if (dirty && !allowDirty) throw Error('Selected template inputs have uncommitted changes; review them and explicitly use --allow-dirty');
    // The baseline ancestor must correspond to this source state. A rolling template
    // branch moves within one VERSION, so an equal version string proves nothing: a
    // drifted ancestor makes upgrades report spurious deletes and adds. The ancestor
    // is accepted when its commit records this checkout as its Source, or when its
    // tree is byte-identical to this checkout's whitelisted export; anything else is
    // rejected with the recovery instead of producing a misleading common ancestor.
    const trailer = templateRevision ? git('log', '-1', '--format=%B', templateRevision).match(/^Source: ([0-9a-f]{40})$/m)?.[1] : undefined;
    if (templateRevision && trailer !== upstream) {
      // A missing trailer only means an older generator: the candidate is still the
      // correct ancestor when its tree equals a fresh export of this checkout.
      const drift = templateDrift(git, source, templateRevision, worktreeModified);
      if (drift) throw Error(`framework-template ${templateRevision.slice(0, 12)} does not match this source checkout (${upstream.slice(0, 12)}${trailer ? `, it was exported from ${trailer.slice(0, 12)}` : ', it has no Source record'}): ${drift.split('\n').at(-1)}. Regenerate the template from this checkout (node scripts/framework-template.mjs) or create the project from the matching source; otherwise source upgrades report conflicts for files this project never had.`);
    }
  }
  const inputFiles = plan.map(file => ({...file, sha256: createHash('sha256').update(readFileSync(regularFile(source, file.source))).digest('hex')}));
  mkdirSync(dirname(target), { recursive: true });
  target = join(realpathSync(dirname(target)),target.split(sep).at(-1));
  if (target === source || relative(source,target).split(sep)[0] !== '..' && !isAbsolute(relative(source,target))) throw Error('destination resolves inside the framework checkout');
  const staging = target + `.creating-${process.pid}`;
  if (existsSync(staging)) throw Error('staging directory already exists');
  mkdirSync(staging);
  try {
    const oldModule = readFileSync(join(source, 'go.mod'), 'utf8').match(/^module (.+)$/m)[1].trim();
    const frameworkVersion = readFileSync(join(source, 'VERSION'), 'utf8').trim();
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(frameworkVersion)) throw Error('Source VERSION must be numeric SemVer');
    const upstreamUrl = 'https://github.com/yunnuo88520/Unicore';
    copyDistribution(source, staging, 'project-template');
    for (const file of inputFiles) if (createHash('sha256').update(readFileSync(join(staging, file.target))).digest('hex') !== file.sha256) throw Error(`Template input changed during export: ${file.source}`);
    for (const {target: path} of plan) {
      const to = join(staging, path);
      if (/\.(?:go|mjs|mts|ts|tsx|json|md|ya?ml|html)$/.test(path) || ['Makefile','go.mod','Dockerfile'].includes(path.split('/').at(-1))) {
        writeFileSync(to, replaceModuleReferences(readFileSync(to, 'utf8'), oldModule, module));
      }
    }
    const edit = (path, fn) => { const full = join(staging,path); const value = JSON.parse(readFileSync(full,'utf8')); fn(value); writeFileSync(full,JSON.stringify(value,null,2)+'\n'); };
    edit('assets/updates/config.json', p => { p.repository=''; p.keys={}; p.channel='stable'; p.allow_unsigned_platform=true; });
    const identity = validateIdentity({author, schemaVersion: 1, product: {name, slug, description: `${name} workspace`}, go: {module}, cli: {command: slug, opsCommand: `${slug}-ops`, description: `${name} CLI`}, desktop: {bundleId: bundle, outputName: `${slug}-desktop`}, deployment: {serviceName: slug, serviceUser: slug, installDirectory: `/opt/${slug}`, dataDirectory: `/var/lib/${slug}`, image: slug, volume: `${slug}_data`}, release: {artifactPrefix: slug}});
    mkdirSync(join(staging, 'internal/buildinfo'), {recursive: true});
    writeFileSync(join(staging, 'product.identity.json'), JSON.stringify(identity, null, 2)+'\n');
    // One identity pass applies every projection: mixed-file fields, generated sources, deployment renames and doc tokens.
    applyIdentity(staging, identity, false);
    // The FAQ's image registry is the framework's; the application publishes under
    // its own account when a release repository is given, and a placeholder marks
    // the decision as open otherwise. The residue scan rejects any leftover.
    const registryOwner = repositoryUrl?.match(/^https:\/\/github\.com\/([^/]+)\//)?.[1];
    // The image workflow publishes ghcr.io/<owner>/<repository> (lowercased): the
    // repository name may differ from the product slug, so both come from the URL.
    const imageReference = repositoryUrl
      ? `ghcr.io/${repositoryUrl.replace(/^https:\/\/github\.com\//, '').toLowerCase()}`
      : 'ghcr.io/<your-release-account>/<your-image-name>';
    for (const {target: path} of plan) {
      if (!path.endsWith('.md')) continue;
      const to = join(staging, path);
      if (!existsSync(to)) continue;
      // The docs may still carry the framework slug here (identity applies the
      // application slug later, e.g. on the next sync), so match both forms.
      writeFileSync(to, readFileSync(to, 'utf8')
        .replaceAll('ghcr.io/yunnuo88520/unicore', imageReference)
        .replaceAll(`ghcr.io/yunnuo88520/${slug}`, imageReference));
    }
    // The application owns its product version and release history: VERSION starts
    // at the requested version (independent of the framework's), every projection
    // regenerates from it, and the framework's changelog is not the app's history.
    writeFileSync(join(staging, 'VERSION'), `${version}\n`);
    writeFileSync(join(staging, 'CHANGELOG.md'), `<!-- Author: ${author} -->\n# Changelog\n\nAll notable changes to this application are documented here. The framework's own release history lives upstream and reaches this repository through framework source upgrades; it is not part of this file.\n\n## Unreleased\n\n### 中文\n\n- 基于 Unicore ${frameworkVersion} 创建。\n\n### English\n\n- Created from Unicore ${frameworkVersion}.\n`);
    // Real checkouts ship the version synchronizer; minimal fixtures without it have
    // no version projections to regenerate.
    if (existsSync(join(staging, 'scripts', 'version.mjs'))) {
      execFileSync(process.execPath, [join(staging, 'scripts', 'version.mjs')], { cwd: staging, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    // Project-facing help and feedback follow its own repository; upstream attribution stays in provenance.
    applyRepositoryLinks(staging, repositoryUrl);
    edit('package.json', p => { p.license='MIT'; });
    writeFileSync(join(staging, 'project.provenance.json'), JSON.stringify({author, framework: 'Unicore', upstream: upstreamUrl, framework_version: frameworkVersion, generator_version: 1, repository: repositoryUrl ?? null, identity_sha256: createHash('sha256').update(readFileSync(join(staging, 'product.identity.json'))).digest('hex'), template_revision: templateRevision, revision: upstream, source_mode: upstream ? (dirty ? 'reviewed-working-tree' : 'clean-git-inputs') : 'unversioned', worktree_modified: worktreeModified, selected_inputs_modified: dirty, input_files: inputFiles, created_at: new Date().toISOString()}, null, 2)+'\n');
    const repositoryInstructions = repositoryUrl
      ? { zh: `创建器已配置自己的 origin：${repositoryUrl}，只读 framework 远端仍指向上游；没有创建远程仓库或推送代码。源码升级流程见 docs/product/framework-upgrade.md。`, en: `Your origin is configured as ${repositoryUrl}; the read-only framework remote still points upstream. No remote repository was created and no code was pushed. See docs/product/framework-upgrade.md for source upgrades.` }
      : { zh: '创建器已完成 git init 与初始基线提交，并添加只读 framework 远端指向上游；推送前先添加自己的 origin，源码升级流程见 docs/product/framework-upgrade.md。', en: 'The creator has already run git init, committed the initial baseline, and added the read-only framework remote pointing upstream; add your own origin before pushing. See docs/product/framework-upgrade.md for source upgrades.' };
    writeFileSync(join(staging,'README.md'),`<!-- Author: yunnuo <ymz@ebox.vip> -->\n# ${name}\n\n**简体中文** · [English](README.en.md)\n\n基于 Unicore 的应用。上游版本见 project.provenance.json，保留 LICENSE 与框架作者头。\n\nGo module：${module}；桌面标识：${bundle}。产品身份唯一入口为 product.identity.json（名称、CLI 命令与部署标识），变更后运行 pnpm product:generate 并用 pnpm product:check 对账；产品版本独立于框架，根目录 VERSION 是唯一来源（pnpm version:sync 同步投影，pnpm release --release X.Y.Z 发版）；主题色板 assets/theme/tokens.json，图标矢量 assets/brand/identity.json。\n\n开发：\n\n\`\`\`sh\nmake install\nmake docs\nmake doctor\nmake dev-server\n# 第二个终端\nmake dev-web\n\`\`\`\n\nWeb 首次启动访问 /install，选择平台或单机；桌面自动初始化本地数据库，CLI 不连接数据库。业务样板见 docs/product/development.md；框架源码升级、冲突处理与上游反馈见 [框架升级](docs/product/framework-upgrade.md)。\n\n笔记是可选业务 demo；可用 \`FEATURE_NOTES=false make build-web\` 关闭。开发模式需给前后端设置相同开关，完整说明见 docs/product/features.md。\n\n更新渠道默认清空，避免安装上游框架发行包。按 docs/product/updates.md 配置自己的仓库、公钥和发布私钥。\n\n${repositoryInstructions.zh}\n\n提交前执行 make docs、make test 和受影响构建；两份 README 和新增 Changelog 条目须同步中英文。\n`);
    writeFileSync(join(staging,'README.en.md'),`<!-- Author: yunnuo <ymz@ebox.vip> -->\n# ${name}\n\n[简体中文](README.md) · **English**\n\nAn application built with Unicore. See project.provenance.json for the upstream revision. Preserve LICENSE and framework author headers.\n\nGo module: ${module}; desktop bundle: ${bundle}. product.identity.json is the single identity entry (name, CLI commands, deployment names); run pnpm product:generate after changes and reconcile with pnpm product:check. The product version is independent of the framework: root VERSION is the single source (pnpm version:sync regenerates projections; pnpm release --release X.Y.Z cuts a release). Theme palette lives in assets/theme/tokens.json and icon vectors in assets/brand/identity.json.\n\nDevelopment:\n\n\`\`\`sh\nmake install\nmake docs\nmake doctor\nmake dev-server\n# In a second terminal:\nmake dev-web\n\`\`\`\n\nOpen /install on first Web launch and choose the platform or standalone profile. Desktop initializes its local database automatically; CLI has no database. See docs/product/development.md for business development and [framework source upgrades](docs/product/framework-upgrade.md) for upstream integration and feedback.\n\nNotes is an optional demo. Build without it using \`FEATURE_NOTES=false make build-web\`; use matching frontend and backend flags in development. See docs/product/features.md.\n\nUpdate channels default to empty to prevent installation of upstream framework packages. Configure your own repository, public key, and release private key as described in docs/product/updates.md.\n\n${repositoryInstructions.en}\n\nRun make docs, make test, and affected builds before committing. Maintain both READMEs and paired Chinese/English Changelog entries together.\n`);
    if (!existsSync(join(staging, 'docs/product/framework-upgrade.md'))) {
      for (const path of ['README.md', 'README.en.md']) writeFileSync(join(staging,path), readFileSync(join(staging,path),'utf8').replaceAll('[框架升级](docs/product/framework-upgrade.md)', 'docs/product/development.md').replaceAll('[framework source upgrades](docs/product/framework-upgrade.md)', 'docs/product/development.md'));
    }
    if (!templateRevision) {
      const notices = {
        'README.md': '\n\n此导出没有模板共同祖先，不能自动合并框架源码更新。需要持续升级时，请从包含 framework-template 历史的正常 Git clone 创建项目。\n',
        'README.en.md': '\n\nSource upgrades are unavailable: this export has no template ancestor. Create upgradeable projects from a normal Git clone that includes framework-template.\n',
      };
      for (const [path,notice] of Object.entries(notices)) writeFileSync(join(staging,path),readFileSync(join(staging,path),'utf8')+notice);
    }
    writeAIContext(staging);
    // Initialize the independent Git workspace: one baseline commit from the whitelisted export, plus the read-only framework remote.
    const targetGit = (...args) => execFileSync('git', ['-C', staging, ...args], {encoding: 'utf8', stdio: ['ignore','pipe','pipe']}).trim();
    try { targetGit('version'); } catch { throw Error('git is required to initialize the project workspace'); }
    targetGit('init', '-q', '--initial-branch=main');
    if (templateRevision) {
      // Base the baseline commit on the template commit so upstream merges have a true common ancestor.
      targetGit('fetch', source, templateRevision);
      const templateVersion = targetGit('show', 'FETCH_HEAD:VERSION').trim();
      if (templateVersion !== frameworkVersion) process.stderr.write(`Warning: framework-template is at ${templateVersion} while the source checkout is ${frameworkVersion}; regenerate the template branch.\n`);
      targetGit('reset', '--soft', 'FETCH_HEAD');
    }
    targetGit('add', '-A');
    try {
      targetGit('commit', '-q', '-m', `Initial baseline from Unicore ${frameworkVersion}`);
    } catch (error) {
      throw Error(`Initial baseline commit failed; configure git user.name and user.email (or GIT_AUTHOR_*/GIT_COMMITTER_* environment) and retry. ${error.stderr ?? error.message}`);
    }
    targetGit('remote', 'add', 'framework', upstreamUrl);
    targetGit('remote', 'set-url', '--push', 'framework', 'disabled://framework');
    if (repositoryUrl) targetGit('remote', 'add', 'origin', `${repositoryUrl}.git`);
    // No source-tree scripts are executed; the trusted context renderer only reads template data.
    // Sources are exported only; package installation and code execution remain explicit next steps.
    renameSync(staging,target);
    return target;
  } catch(error) { rmSync(staging,{recursive:true,force:true}); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (args[i] === '--allow-dirty') { options.allowDirty = true; i--; continue; }
      if (!['--directory', '--name', '--module', '--bundle', '--slug', '--repository', '--author', '--version'].includes(args[i]) || !args[i + 1]) throw Error('Use --directory PATH --name NAME --slug SLUG --module MODULE --bundle ID [--version 0.1.0] [--repository https://github.com/OWNER/REPO] [--author "Team <email>"]');
      options[args[i].slice(2)] = args[i + 1];
    }
    if (!options.directory) throw Error('--directory is required');
    console.log(`Created ${createProject(options)}\nInitial baseline committed on main; the read-only framework remote points upstream. ${options.repository ? 'Your origin is configured; no repository was created and no code was pushed.' : 'Add your own origin before pushing.'}\nNext: cd into the project; make install; make docs; make doctor`);
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
