// Author: yunnuo <ymz@ebox.vip>
// Description: Build Web and CLI archives and manifests; native GUI is built on native CI runners.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const version = readFileSync('VERSION', 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('VERSION must be SemVer');
const targets = (process.env.RELEASE_TARGETS ?? 'linux/amd64,linux/arm64,darwin/amd64,darwin/arm64,windows/amd64,windows/arm64').split(',');
const knownTargets = new Set(['linux/amd64','linux/arm64','darwin/amd64','darwin/arm64','windows/amd64','windows/arm64']);
for (const target of targets) if (!knownTargets.has(target)) throw new Error(`Unsupported target ${target}`);
let commit = 'dev';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { /* Uncommitted bootstrap checkout. */ }
const buildTime = new Date().toISOString();
const ldflags = `-s -w -X github.com/yunnuo/unicore/internal/buildinfo.Version=${version} -X github.com/yunnuo/unicore/internal/buildinfo.Commit=${commit} -X github.com/yunnuo/unicore/internal/buildinfo.BuildTime=${buildTime}`;
execFileSync('pnpm', ['--filter','@unicore/web','build'], { stdio: 'inherit' });
mkdirSync('build/releases', { recursive: true });
const artifacts = [];
for (const target of targets) {
  const [os, arch] = target.split('/');
  const profiles = os === 'linux' ? ['web-platform', 'web-standalone', 'cli'] : ['cli'];
  for (const profile of profiles) {
    const name = `unicore-${profile}-${os}-${arch}-v${version}`;
    const dir = `build/staging/${name}`;
    rmSync(dir, { recursive: true, force: true }); mkdirSync(`${dir}/bin`, { recursive: true });
    const executable = profile === 'cli' ? 'unicore' : 'server';
    const profileFlags = profile === 'cli' ? ldflags : `${ldflags} -X github.com/yunnuo/unicore/internal/runtime.DefaultWebProfile=${profile}`;
    execFileSync('go', ['build','-trimpath','-ldflags',profileFlags,'-o',`${dir}/bin/${executable}${os === 'windows' ? '.exe' : ''}`,profile === 'cli' ? './cmd/cli' : './cmd/server'], { env: { ...process.env, CGO_ENABLED: '0', GOOS: os, GOARCH: arch }, stdio: 'inherit' });
    cpSync('docs/03-runbooks/deployment.md', `${dir}/README_DEPLOY.md`);
    writeFileSync(`${dir}/VERSION`, `${version}\n`);
    if (profile !== 'cli') { cpSync('apps/web/static', `${dir}/web`, { recursive: true }); cpSync('deploy/tar', `${dir}/deploy`, { recursive: true }); }
    const manifest = { version, channel: 'development', stage: 'M1', profile, os, arch, commit, build_time: buildTime, features: { authentication: false, database: false, license: false, updater: false }, min_upgrade_version: null, migration_level: 0, signature: null, release_notes: 'M1 developer preview. No installation, authentication or persistence. Not a production release.' };
    writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2)+'\n');
    const artifact = `${name}.tar.gz`;
    execFileSync('tar',['-czf',`build/releases/${artifact}`,'-C','build/staging',name]);
    const sha256 = createHash('sha256').update(readFileSync(`build/releases/${artifact}`)).digest('hex');
    artifacts.push({ ...manifest, artifact, sha256 });
    console.log(`Built ${artifact}`);
  }
}
writeFileSync('build/releases/checksums.txt', artifacts.map(a => `${a.sha256}  ${a.artifact}`).join('\n')+'\n');
writeFileSync('build/releases/manifest.json', JSON.stringify({ version, artifacts }, null, 2)+'\n');
