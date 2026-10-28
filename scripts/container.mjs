// Author: yunnuo <ymz@ebox.vip>
// Description: Supply the same VERSION and build metadata to Docker and Compose.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
execFileSync(process.execPath, ['scripts/version.mjs', '--check'], { stdio: 'inherit' });
const version = readFileSync('VERSION', 'utf8').trim();
let commit='dev';
try {commit=execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();} catch { /* Source ZIPs have no Git metadata. */ }
const env = { ...process.env, UNICORE_VERSION: version, UNICORE_COMMIT: commit, UNICORE_BUILD_TIME: new Date().toISOString() };
env.UNICORE_IMAGE ??= `${JSON.parse(readFileSync('package.json', 'utf8')).name}:${version}`;
const action = process.argv[2];
if (action === 'build') {
  const args = ['build','-f','deploy/docker/Dockerfile','-t',env.UNICORE_IMAGE];
  for (const [key, value] of Object.entries({ VERSION: version, COMMIT: env.UNICORE_COMMIT, BUILD_TIME: env.UNICORE_BUILD_TIME, FEATURE_LICENSE: env.FEATURE_LICENSE ?? 'false', FEATURE_UPDATER: env.FEATURE_UPDATER ?? 'false' })) args.push('--build-arg', `${key}=${value}`);
  for (const key of ['GO_IMAGE','NODE_IMAGE','RUNTIME_IMAGE','GOPROXY']) if (env[key]) args.push('--build-arg',`${key}=${env[key]}`);
  if (env.DOCKER_PLATFORM) args.push('--platform',env.DOCKER_PLATFORM);
  execFileSync('docker',[...args,'.'],{stdio:'inherit',env});
} else if (['up','down'].includes(action)) {
  const args=['compose','-f','deploy/docker/compose.yaml'];
  args.push(...(action === 'up' ? ['up','--build','-d'] : ['down']));
  execFileSync('docker',args,{stdio:'inherit',env});
} else throw new Error('Use build, up or down');
