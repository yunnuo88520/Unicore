// Author: yunnuo <ymz@ebox.vip>
// Description: Verify the release identity chain and every published surface before a release may be declared complete:
// source SHA <-> VERSION <-> tag, the GitHub release assets against their checksums, the rolling template's
// source-commit traceability, and the GHCR image digests. Maintainer tooling; not part of any distributed output.
// Usage: node scripts/release-completeness.mjs --tag v0.1.6 [--kind preview|stable] [--repo owner/name] [--bundle build/candidate]
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const arguments_ = process.argv.slice(2);
const value = name => { const index = arguments_.indexOf(name); return index >= 0 ? arguments_[index + 1] : undefined; };
const tag = value('--tag');
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) throw Error('Use --tag vMAJOR.MINOR.PATCH');
const kind = value('--kind') ?? 'preview';
if (!['preview', 'stable'].includes(kind)) throw Error('--kind must be preview or stable');
const repository = value('--repo') ?? (() => {
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], {encoding: 'utf8'}).trim();
  const match = url.match(/github\.com[/:](.+?\/.+?)(?:\.git)?$/);
  if (!match) throw Error('Cannot derive the GitHub repository from origin; pass --repo owner/name');
  return match[1];
})();
const bundle = value('--bundle') ? resolve(value('--bundle')) : null;
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? execFileSync('gh', ['auth', 'token'], {encoding: 'utf8'}).trim();
const authorization = {Authorization: `Bearer ${token}`};
const getJson = async url => {
  const response = await fetch(url, {headers: authorization});
  if (!response.ok) throw Object.assign(Error(`${response.status} ${response.statusText} for ${url}`), {status: response.status});
  return response.json();
};
const download = async (url, destination) => {
  const response = await fetch(url, {headers: authorization});
  if (!response.ok) throw Object.assign(Error(`${response.status} ${response.statusText} for ${url}`), {status: response.status});
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
};
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const results = [];
const record = (item, status, detail) => { results.push({item, status, detail}); console.log(`${status === 'verified' ? 'PASS' : status === 'unverified' ? 'TODO' : 'FAIL'} ${item}: ${detail}`); };

const version = readFileSync('VERSION', 'utf8').trim();
const product = JSON.parse(readFileSync('package.json', 'utf8')).name;
const temporary = mkdtempSync(join(tmpdir(), 'unicore-release-check-'));
try {
  // 1. Source identity: tag, VERSION and the tagged commit's tree must agree.
  const taggedCommit = execFileSync('git', ['rev-list', '-n', '1', tag], {encoding: 'utf8'}).trim();
  const taggedVersion = execFileSync('git', ['show', `${tag}:VERSION`], {encoding: 'utf8'}).trim();
  record('source identity', taggedVersion === version && `v${version}` === tag ? 'verified' : 'failed',
    `tag ${tag} -> commit ${taggedCommit.slice(0, 12)}, tagged VERSION ${taggedVersion}, working VERSION ${version}`);

  // 2. GitHub release: published, channel flag, body, and every expected asset.
  const release = await getJson(`https://api.github.com/repos/${repository}/releases/tags/${tag}`);
  const prereleaseExpected = kind === 'preview';
  const releaseOk = !release.draft && release.prerelease === prereleaseExpected && (release.body ?? '').trim().length > 0;
  record('release publication', releaseOk ? 'verified' : 'failed',
    `draft=${release.draft} prerelease=${release.prerelease} (expected ${prereleaseExpected} for ${kind}), notes ${release.body ? 'present' : 'missing'}`);
  const expected = ['manifest.json', 'checksums.txt', 'update-manifest.json', 'update-manifest.sig'];
  for (const profile of ['web-platform', 'web-standalone']) for (const arch of ['amd64', 'arm64']) expected.push(`${product}-${profile}-linux-${arch}-v${version}.tar.gz`);
  for (const os of ['linux', 'darwin', 'windows']) for (const arch of ['amd64', 'arm64']) expected.push(`${product}-cli-${os}-${arch}-v${version}.tar.gz`);
  for (const arch of ['amd64', 'arm64']) expected.push(`${product}-desktop-linux-${arch}-v${version}.tar.gz`);
  for (const arch of ['amd64', 'arm64']) expected.push(`${product}-desktop-darwin-${arch}-v${version}.tar.gz`, `${product}-desktop-darwin-${arch}-v${version}.dmg`);
  for (const arch of ['amd64', 'arm64']) expected.push(`${product}-desktop-windows-${arch}-v${version}.tar.gz`);
  expected.push(`${product}-desktop-windows-amd64-v${version}.exe`);
  const assets = new Map((release.assets ?? []).map(asset => [asset.name, asset]));
  const missing = expected.filter(name => !assets.has(name));
  const unexpected = [...assets.keys()].filter(name => !expected.includes(name));
  record('release assets', missing.length === 0 && unexpected.length === 0 ? 'verified' : 'failed',
    missing.length ? `missing ${missing.join(', ')}` : unexpected.length ? `unexpected ${unexpected.join(', ')}` : `${expected.length} assets present`);

  // 3. Downloaded assets must match their published checksums.
  const checksumsAsset = assets.get('checksums.txt');
  if (checksumsAsset) {
    const directory = join(temporary, 'assets');
    mkdirSync(directory, {recursive: true});
    await download(checksumsAsset.browser_download_url, join(directory, 'checksums.txt'));
    const lines = readFileSync(join(directory, 'checksums.txt'), 'utf8').trim().split('\n').map(line => line.split(/\s+/));
    let verifiedCount = 0; const mismatches = [];
    for (const [digest, name] of lines) {
      const asset = assets.get(name);
      if (!asset) { mismatches.push(`${name}: listed but not attached`); continue; }
      try {
        await download(asset.browser_download_url, join(directory, name));
        if (sha256(join(directory, name)) === digest) verifiedCount++; else mismatches.push(`${name}: digest mismatch`);
      } catch (error) { mismatches.push(`${name}: download failed (${error.status ?? error.message})`); }
    }
    record('downloaded asset checksums', mismatches.length === 0 && verifiedCount === expected.length ? 'verified' : 'failed',
      mismatches.length ? mismatches.join('; ') : `${verifiedCount}/${expected.length} downloaded and verified`);
  } else record('downloaded asset checksums', 'failed', 'checksums.txt is not attached');

  // 4. Rolling template traceability: the template head must record a source commit at
  // or after the release commit, so an identical "Framework template <version>" title
  // alone is never treated as content equality.
  const templateHead = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/framework-template'], {encoding: 'utf8'}).trim().split('\t')[0];
  if (templateHead) {
    execFileSync('git', ['fetch', '--force', 'origin', `${templateHead}:refs/temp/template-check`], {stdio: 'pipe'});
    const message = execFileSync('git', ['log', '-1', '--format=%B', templateHead], {encoding: 'utf8'});
    const source = message.match(/^Source: ([0-9a-f]{40})$/m)?.[1];
    if (!source) record('template source traceability', 'failed', `template head ${templateHead.slice(0, 12)} has no "Source: <sha>" trailer; regenerate with scripts/framework-template.mjs`);
    else {
      // merge-base --is-ancestor exits non-zero when the release commit is not contained.
      let ancestor = false;
      try { execFileSync('git', ['merge-base', '--is-ancestor', taggedCommit, source]); ancestor = true; } catch { ancestor = false; }
      record('template source traceability', ancestor ? 'verified' : 'failed',
        `template ${templateHead.slice(0, 12)} exported from source ${source.slice(0, 12)}; release commit ${ancestor ? 'is an ancestor' : 'is NOT an ancestor (stale template)'}`);
    }
  } else record('template source traceability', 'failed', 'origin has no framework-template branch');

  // 5. Image digests on GHCR: the exact version tag always; the floating major.minor tag only for stable.
  const expectedTags = [`ghcr.io/${repository.toLowerCase()}:${version}`, ...(kind === 'stable' ? [`ghcr.io/${repository.toLowerCase()}:${version.split('.').slice(0, 2).join('.')}`] : [])];
  for (const image of expectedTags) {
    const reference = image.split(':');
    try {
      const response = await fetch(`https://ghcr.io/v2/${reference[0].replace('ghcr.io/', '')}/manifests/${reference[1]}`, {headers: {...authorization, Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'}});
      if (!response.ok) throw Object.assign(Error(`${response.status} ${response.statusText}`), {status: response.status});
      const digest = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
      record(`image ${image}`, 'verified', `manifest digest sha256:${digest.slice(0, 24)}…`);
    } catch (error) {
      record(`image ${image}`, 'unverified', `registry rejected the query (${error.status ?? error.message}); run "gh auth refresh -s read:packages" or "docker login ghcr.io" and re-run`);
    }
  }

  // 6. Optional local candidate bundle cross-check (reuse its own checksums and manifest).
  if (bundle) {
    const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8'));
    const manifestOk = manifest.source_commit === taggedCommit && manifest.version === version && manifest.channel === kind;
    record('candidate bundle identity', manifestOk ? 'verified' : 'failed',
      `manifest source_commit ${String(manifest.source_commit).slice(0, 12)}, version ${manifest.version}, channel ${manifest.channel}`);
    execFileSync('sh', ['-c', 'cd "$1" && sha256sum --check checksums.txt', 'check', bundle], {stdio: 'pipe'});
    record('candidate bundle checksums', 'verified', 'sha256sum --check passed');
  }

  const failed = results.filter(entry => entry.status === 'failed');
  const unverified = results.filter(entry => entry.status === 'unverified');
  console.log(`\n${results.length - failed.length - unverified.length}/${results.length} verified, ${unverified.length} unverified, ${failed.length} failed`);
  if (failed.length || unverified.length) {
    console.error('The release must NOT be declared complete while items are failed or unverified.');
    process.exitCode = 1;
  } else console.log('Release identity chain, assets, template traceability and image digests are complete.');
} finally {
  try { execFileSync('git', ['update-ref', '-d', 'refs/temp/template-check']); } catch { /* The ref only exists after a template fetch. */ }
  rmSync(temporary, {recursive: true, force: true});
}
