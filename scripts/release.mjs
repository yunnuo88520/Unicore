// Author: yunnuo <ymz@ebox.vip>
// Description: Build Web and CLI archives and manifests; native GUI is built on native CI runners.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, cpSync, rmSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFeatures } from './build-features.mjs';
import { copyDistribution } from './distribution.mjs';
import { loadIdentity } from './product-identity.mjs';
const edition = readFeatures();
const identity = loadIdentity();

const product = JSON.parse(readFileSync('package.json', 'utf8')).name;
if (!/^[a-z][a-z0-9-]{1,39}$/.test(product)) throw new Error('package.name must be a portable product slug');
const version = readFileSync('VERSION', 'utf8').trim();
execFileSync(process.execPath, ['scripts/version.mjs', '--check'], { stdio: 'inherit' });
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('VERSION must be SemVer');
const targets = (process.env.RELEASE_TARGETS ?? 'linux/amd64,linux/arm64,darwin/amd64,darwin/arm64,windows/amd64,windows/arm64').split(',');
const knownTargets = new Set(['linux/amd64','linux/arm64','darwin/amd64','darwin/arm64','windows/amd64','windows/arm64']);
for (const target of targets) if (!knownTargets.has(target)) throw new Error(`Unsupported target ${target}`);
const selectedProfiles = (process.env.RELEASE_PROFILES ?? 'web-platform,web-standalone,cli').split(',');
for (const profile of selectedProfiles) if (!['web-platform','web-standalone','cli'].includes(profile)) throw new Error(`Unsupported profile ${profile}`);
if (!targets.some(target => target.startsWith('linux/') || selectedProfiles.includes('cli'))) throw new Error('No supported profile/target combination selected');
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const releaseNotes = changelog.match(/## Unreleased\n([\s\S]*?)(?=\n## |$)/)?.[1].trim() || changelog.split(`## ${version} — `)[1]?.split(/\n## /)[0].split('\n').slice(1).join('\n').trim();
if (!releaseNotes) throw new Error('Missing CHANGELOG release notes');
let commit = 'dev';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { /* Uncommitted bootstrap checkout. */ }
const buildTime = new Date().toISOString();
const ldflags = `-s -w -X ${identity.go.module}/internal/buildinfo.Version=${version} -X ${identity.go.module}/internal/buildinfo.Commit=${commit} -X ${identity.go.module}/internal/buildinfo.BuildTime=${buildTime}`;
if (targets.some(target => target.startsWith('linux/')) && selectedProfiles.some(profile => profile !== 'cli')) execFileSync('pnpm', ['--filter','@unicore/web','build'], { stdio: 'inherit' });
rmSync('build/releases', { recursive: true, force: true });
mkdirSync('build/releases', { recursive: true });
const artifacts = [];
for (const target of targets) {
  const [os, arch] = target.split('/');
  const profiles = selectedProfiles.filter(profile => os === 'linux' || profile === 'cli');
  for (const profile of profiles) {
    const name = `${product}-${profile}-${os}-${arch}-v${version}`;
    const dir = `build/staging/${name}`;
    rmSync(dir, { recursive: true, force: true }); mkdirSync(`${dir}/bin`, { recursive: true });
    const executable = profile === 'cli' ? identity.cli.command : 'server';
    const profileFlags = profile === 'cli' ? ldflags : `${ldflags} -X ${identity.go.module}/internal/runtime.DefaultWebProfile=${profile}`;
    execFileSync('go', ['build','-trimpath','-tags',profile === 'cli' ? '' : edition.tags,'-ldflags',profileFlags,'-o',`${dir}/bin/${executable}${os === 'windows' ? '.exe' : ''}`,profile === 'cli' ? './cmd/cli' : './cmd/server'], { env: { ...process.env, CGO_ENABLED: '0', GOOS: os, GOARCH: arch }, stdio: 'inherit' });
    if (profile !== 'cli') execFileSync('go', ['build','-trimpath','-ldflags',ldflags,'-o',`${dir}/bin/${identity.cli.opsCommand}`,'./cmd/ops'], { env: { ...process.env, CGO_ENABLED: '0', GOOS: os, GOARCH: arch }, stdio: 'inherit' });
    copyDistribution(process.cwd(), dir, 'user-release');
    writeFileSync(`${dir}/README_DEPLOY.md`, `<!-- Author: yunnuo <ymz@ebox.vip> -->\n# ${identity.product.name} ${version}\n\n默认 profile：${profile}；目标：${os}/${arch}。\n\n${profile === 'cli' ? `运行 bin/${identity.cli.command} version 或 bin/${identity.cli.command} execute --text "Hello ${identity.product.name}"（Windows 为 .exe）。` : `帮助：./${identity.cli.command}help；生成可选配置：./${identity.cli.command} config generate；加载配置：./${identity.cli.command} --config ${identity.product.slug}.json。首次试运行：APP_DATA_DIR=/你的私有数据目录 ./${identity.cli.command}，访问 http://127.0.0.1:8080/install，从该目录 bootstrap.token 读取安装凭据。生产请按手册配置 systemd/Nginx 和 HTTPS。`}\n\n[部署手册](docs/product/deployment.md) · [构建与发版](docs/product/build.md) · [变更记录](CHANGELOG.md)。本包是系统未签名的开发预览；OTA 以完整 Release 的发行者签名清单为准。数据和密钥必须保存在包目录之外。\n\n## English\n\nDevelopment preview for ${profile} on ${os}/${arch}. ${profile === 'cli' ? `Run bin/${identity.cli.command} version or bin/${identity.cli.command} execute --text "Hello ${identity.product.name}" (add .exe on Windows).` : `Run ./${identity.cli.command}help for help, ./${identity.cli.command} config generate for optional configuration, and ./${identity.cli.command} --config ${identity.product.slug}.json to start. Open /install; read bootstrap.token from your private data directory for first-time setup. Configure systemd/Nginx and HTTPS for deployment.`} Keep data and keys outside the extracted package. OS binaries are unsigned; OTA requires the publisher-signed manifest from the complete Release. Detailed guides under docs/product are currently in Chinese. See CHANGELOG.md for paired release entries.\n`);
    cpSync('CHANGELOG.md', `${dir}/CHANGELOG.md`);
    writeFileSync(`${dir}/VERSION`, `${version}\n`);
    if (profile !== 'cli') {
      cpSync('apps/web/static', `${dir}/web`, { recursive: true }); cpSync('deploy/tar', `${dir}/deploy`, { recursive: true });
      for (const entry of [identity.cli.command, `${identity.cli.command}help`]) { cpSync(`deploy/tar/${entry}`, `${dir}/${entry}`); chmodSync(`${dir}/${entry}`,0o755); }
    }
    const manifest = { version, channel: 'development', profile, os, arch, commit, build_time: buildTime, features: { authentication: profile === 'web-platform', installation: profile !== 'cli', database: profile !== 'cli', email_accounts: profile === 'web-platform', oidc: profile === 'web-platform', license: profile !== 'cli' && edition.features.license, updater: profile !== 'cli' && edition.features.updater }, min_upgrade_version: null, business_migration_level: profile === 'cli' ? 0 : 2, offline_backup: profile !== 'cli', migration_level: profile === 'cli' ? 0 : profile === 'web-platform' ? 12 : 1, signature: null, platform_signature: 'unsigned', release_notes: releaseNotes };
    writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2)+'\n');
    const artifact = `${name}.tar.gz`;
    execFileSync('tar',['-czf',`build/releases/${artifact}`,'-C','build/staging',name], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const sha256 = createHash('sha256').update(readFileSync(`build/releases/${artifact}`)).digest('hex');
    artifacts.push({ ...manifest, artifact, sha256 });
    console.log(`Built ${artifact}`);
  }
}
writeFileSync('build/releases/checksums.txt', artifacts.map(a => `${a.sha256}  ${a.artifact}`).join('\n')+'\n');
writeFileSync('build/releases/manifest.json', JSON.stringify({ version, artifacts }, null, 2)+'\n');
