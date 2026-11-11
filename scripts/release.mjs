// Author: yunnuo <ymz@ebox.vip>
// Description: Build Web and CLI archives and manifests; native GUI is built on native CI runners.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFeatures } from './build-features.mjs';
import { copyDistribution } from './distribution.mjs';
import { installationReadme, checkReleaseLayout } from './release-layout.mjs';
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
rmSync('build/staging', { recursive: true, force: true });
const artifacts = [];
for (const target of targets) {
  const [os, arch] = target.split('/');
  const profiles = selectedProfiles.filter(profile => os === 'linux' || profile === 'cli');
  for (const profile of profiles) {
    const name = `${product}-${profile}-${os}-${arch}-v${version}`;
    const dir = `build/staging/${name}`;
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const executable = identity.cli.command;
    const profileFlags = profile === 'cli' ? ldflags : `${ldflags} -X ${identity.go.module}/internal/runtime.DefaultWebProfile=${profile}`;
    execFileSync('go', ['build','-trimpath','-tags',profile === 'cli' ? '' : edition.tags,'-ldflags',profileFlags,'-o',`${dir}/${executable}${os === 'windows' ? '.exe' : ''}`,profile === 'cli' ? './cmd/cli' : './cmd/server'], { env: { ...process.env, CGO_ENABLED: '0', GOOS: os, GOARCH: arch }, stdio: 'inherit' });
    copyDistribution(process.cwd(), dir, 'user-release');
    writeFileSync(`${dir}/README.md`, installationReadme({identity, profile, os, arch, version}));
    writeFileSync(`${dir}/VERSION`, `${version}\n`);
    if (profile !== 'cli') {
      mkdirSync(`${dir}/deploy`);
      for (const entry of [`${identity.deployment.serviceName}.service`, 'nginx.conf.example']) cpSync(`deploy/tar/${entry}`, `${dir}/deploy/${entry}`);
    }
    const manifest = { version, channel: 'development', profile, os, arch, commit, build_time: buildTime, features: { authentication: profile === 'web-platform', installation: profile !== 'cli', database: profile !== 'cli', email_accounts: profile === 'web-platform', oidc: profile === 'web-platform', license: profile !== 'cli' && edition.features.license, updater: profile !== 'cli' && edition.features.updater }, min_upgrade_version: null, // Catalog world: one version per namespace, so both levels are 1 (cli has no database).
    business_migration_level: profile === 'cli' ? 0 : 1, offline_backup: profile !== 'cli', migration_level: profile === 'cli' ? 0 : 1, signature: null, platform_signature: 'unsigned', release_notes: releaseNotes };
    writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2)+'\n');
    checkReleaseLayout(dir, {profile, os, identity});
    const artifact = `${name}.tar.gz`;
    execFileSync('tar',['--no-xattrs','--no-acls','-czf',`build/releases/${artifact}`,'-C','build/staging',name], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const sha256 = createHash('sha256').update(readFileSync(`build/releases/${artifact}`)).digest('hex');
    artifacts.push({ ...manifest, artifact, sha256 });
    console.log(`Built ${artifact}`);
  }
}
writeFileSync('build/releases/checksums.txt', artifacts.map(a => `${a.sha256}  ${a.artifact}`).join('\n')+'\n');
writeFileSync('build/releases/manifest.json', JSON.stringify({ version, artifacts }, null, 2)+'\n');
