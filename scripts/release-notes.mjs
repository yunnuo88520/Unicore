// Author: yunnuo <ymz@ebox.vip>
// Description: Validate paired Changelog entries and render bilingual GitHub notes from the verified bundle.
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function bilingualNotes(text) {
  const match = text.trim().match(/^### 中文\n([\s\S]+?)\n### English\n([\s\S]+)$/);
  if (!match) throw Error('Release notes require ### 中文 and ### English sections');
  const [zh, en] = match.slice(1).map(value => value.trim());
  const count = value => [...value.matchAll(/^- .+/gm)].length;
  if (!/\p{Script=Han}/u.test(zh) || !/[A-Za-z]{3}/.test(en) || !count(zh) || count(zh) !== count(en)) throw Error('Translate every release entry: nonempty paired lists with equal item counts are required');
  if (/\b(?:TODO|TBD)\b|待补充|待翻译/i.test(text)) throw Error('Release notes contain placeholders');
  return {zh, en};
}
export function versionNotes(changelog, version) {
  const section = changelog.split(/^## /m).find(value => value.startsWith(`${version} — `));
  if (!section) throw Error(`Missing Changelog section for ${version}`);
  return bilingualNotes(section.slice(section.indexOf('\n') + 1));
}
export function checkNotes(root = process.cwd()) {
  const log = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  versionNotes(log, version);
  const pending = log.match(/^## Unreleased\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1].trim();
  if (pending) bilingualNotes(pending);
  for (const [file, link] of [['README.md', 'README.en.md'], ['README.en.md', 'README.md']]) {
    if (!readFileSync(join(root, file), 'utf8').includes(`](${link})`)) throw Error(`${file} must link to ${link}`);
  }
  console.log(`PASS bilingual README links and release notes for ${version}`);
}
export function renderRelease({version, brand, repository, manifest, notes, ciRun, candidateRun, securityRun}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(manifest.source_commit) || manifest.version !== version || !/^\d+$/.test(ciRun) || !/^\d+$/.test(candidateRun) || !/^\d+$/.test(securityRun)) throw Error('Exact version, repository, source commit and successful run IDs are required');
  const {zh, en} = bilingualNotes(notes);
  const base = `https://github.com/${repository}`;
  const download = file => {
    if (!/^[A-Za-z0-9._-]+\.(?:tar\.gz|dmg|exe)$/.test(file)) throw Error('Invalid download filename');
    return `[${file}](${base}/releases/download/v${version}/${file})`;
  };
  const rows = manifest.artifacts.flatMap(item => [
    `| ${item.profile} | ${item.os}/${item.arch} | ${download(item.artifact)} |`,
    ...(item.downloads ?? []).map(extra => `| desktop (${extra.format}) | ${item.os}/${item.arch} | ${download(extra.artifact)} |`)
  ]).join('\n');
  const signatures = [...new Set(manifest.artifacts.map(item => item.platform_signature ?? 'unsigned'))].join(', ');
  const table = header => `${header}\n| --- | --- | --- |\n${rows}`;
  return `# ${brand} v${version}\n\n[中文](#中文) · [English](#english)\n\n## 中文\n\n开发预览；不是稳定版。\n\n### 本版变化\n\n${zh}\n\n### 下载与安装\n\n${table('| 形态 | 系统/架构 | 文件 |')}\n\nmacOS 下载 DMG，将 app 拖到 Applications；Windows 下载 EXE 直接运行（需要 WebView2）；Linux 桌面解包运行，需要 GTK3/WebKitGTK 4.0。Web 解包后用 ./unicorehelp 查看帮助，./unicore config generate 生成可选配置，./unicore --config unicore.json 启动，然后访问 /install。CLI 运行 bin/unicore（Windows 为 .exe）。请使用匹配 CPU 架构的文件。\n\n### 升级与限制\n\n升级前停服并成套备份数据库、私有数据目录与密钥，在隔离副本验证；数据库回退需恢复升级前快照与匹配旧程序。tar 继续供 OTA 使用；独立 Windows EXE 缺少完整发行目录时只支持检查更新。Docker 由外部替换镜像，不在容器内覆盖程序。\n\n本候选包含经可信公钥验证的 Ed25519 OTA 清单；系统签名状态为 ${signatures}，unsigned 不代表 Apple/Windows 已签名或公证。原生构建、窗口启动与完整 GUI 更新/失败恢复是不同验收，不承诺所有 OS/架构或外部云存储均已实测。没有公开注册表镜像或真实授权服务，不包含生产部署。\n\n[使用与部署](${base}/blob/v${version}/docs/product/index.md) · [支持范围](${base}/blob/v${version}/docs/support.md) · [完整变更](${base}/blob/v${version}/CHANGELOG.md)\n\n## English\n\nDevelopment preview; not a stable release.\n\n### Changes\n\n${en}\n\n### Downloads and installation\n\n${table('| Profile | OS/architecture | File |')}\n\nOn macOS, download the DMG and drag the app into Applications. On Windows, run the EXE directly (WebView2 required). Extract the Linux desktop archive; GTK3/WebKitGTK 4.0 is required. For Web, extract the archive, run ./unicorehelp, optionally create configuration with ./unicore config generate, start with ./unicore --config unicore.json, and open /install. For CLI, run bin/unicore (with .exe on Windows). Choose the file matching your CPU architecture.\n\n### Upgrades and limitations\n\nStop the service and back up the database, private data directory and keys together before upgrading; validate on an isolated copy. Database rollback requires the pre-upgrade snapshot and matching old program. Tar archives remain the OTA transport. A standalone Windows EXE only checks for updates without the full release directory. Replace Docker images externally; never overwrite the running program inside a container.\n\nThis candidate includes an Ed25519 OTA manifest verified against the trusted public key. OS signature status: ${signatures}; unsigned does not mean Apple/Windows signing or notarization. Native builds, window startup, and complete GUI update/failure recovery are separate checks. Not every OS/architecture or external cloud service has been exercised. No public registry image, live licensing service, or production deployment is included.\n\n[Usage and deployment (Chinese)](${base}/blob/v${version}/docs/product/index.md) · [Support boundaries (Chinese)](${base}/blob/v${version}/docs/support.md) · [Full Changelog](${base}/blob/v${version}/CHANGELOG.md)\n\n## 构建与校验 / Build and verification\n\n- 源码 / Source: [${manifest.source_commit}](${base}/commit/${manifest.source_commit})\n- 质量与原生构建 / Quality and native builds: [CI](${base}/actions/runs/${ciRun})\n- 依赖安全 / Dependency security: [Actions](${base}/actions/runs/${securityRun})\n- 签名候选与来源证明 / Signed candidate and provenance: [Actions](${base}/actions/runs/${candidateRun})\n- 下载后核对 checksums.txt；OTA 签名独立校验，SHA-256 不替代签名。 / Check checksums.txt after downloading; verify the OTA signature independently. SHA-256 does not replace signatures.\n\n\`\`\`sh\ngh attestation verify ./DOWNLOADED_FILE --repo ${repository} --source-ref refs/heads/main \\\n  --source-digest ${manifest.source_commit} \\\n  --signer-workflow ${repository}/.github/workflows/release.yml --deny-self-hosted-runners\n\`\`\`\n`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === '--check') checkNotes();
  else {
    const directory = process.argv[2];
    if (!directory) throw Error('Use release-notes.mjs --check | <verified-bundle-directory>');
    const version = readFileSync('VERSION', 'utf8').trim();
    const log = readFileSync('CHANGELOG.md', 'utf8');
    const {zh, en} = versionNotes(log, version);
    const body = renderRelease({version, brand: JSON.parse(readFileSync('assets/theme/tokens.json')).brand.name, repository: process.env.GITHUB_REPOSITORY, manifest: JSON.parse(readFileSync(join(directory, 'manifest.json'))), notes: `### 中文\n${zh}\n### English\n${en}`, ciRun: process.env.CI_RUN_ID, candidateRun: process.env.GITHUB_RUN_ID, securityRun: process.env.SECURITY_RUN_ID});
    writeFileSync(join(directory, 'RELEASE_NOTES.md'), body);
  }
}
