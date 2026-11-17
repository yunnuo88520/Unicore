// Author: yunnuo <ymz@ebox.vip>
// Description: Verify the release identity chain and every published surface before a release may be declared complete.
// The expected asset matrix is derived from the release's own manifest.json under the same structural rules as
// scripts/release-assets.mjs assemble — never from a hardcoded architecture list. Maintainer tooling; not an automated gate.
// Usage: node scripts/release-completeness.mjs --tag v0.1.6 [--kind preview|stable] [--repo owner/name] [--bundle build/candidate]
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const REQUIRED_NON_ARCHIVE_ASSETS = ['manifest.json', 'checksums.txt', 'update-manifest.json', 'update-manifest.sig'];
const WEB_TARGETS = ['web-platform', 'web-standalone'].flatMap(profile => ['amd64', 'arm64'].map(arch => `${profile}/linux/${arch}`));
const CLI_TARGETS = ['linux', 'darwin', 'windows'].flatMap(os => ['amd64', 'arm64'].map(arch => `cli/${os}/${arch}`));
const DESKTOP_OS = ['linux', 'darwin', 'windows'];

// Structural identity and matrix rules shared with release-assets.mjs assembleRelease:
// 13 archives (web ×4, cli ×6, desktop one per OS at the producing runner's arch), desktop
// downloads are the dmg/portable-exe of the same entry, and every archive carries its digest.
export function expectedFromManifest(manifest, {version, commit, channel}) {
  const errors = [];
  if (manifest.version !== version || manifest.source_commit !== commit) errors.push(`manifest identity mismatch: version ${manifest.version}, source_commit ${String(manifest.source_commit).slice(0, 12)} (expected ${version}, ${String(commit).slice(0, 12)})`);
  if (manifest.channel !== channel) errors.push(`manifest channel ${manifest.channel} does not match the requested ${channel}`);
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (artifacts.length !== 13) errors.push(`release manifest lists ${artifacts.length} artifacts, expected 13`);
  const required = new Set([...WEB_TARGETS, ...CLI_TARGETS]);
  const seenOS = new Set();
  const archives = [], downloads = [], names = new Set();
  for (const item of artifacts) {
    if (!item || typeof item.artifact !== 'string' || !item.artifact.endsWith('.tar.gz') || names.has(item.artifact)) { errors.push(`invalid or duplicate artifact entry: ${item?.artifact}`); continue; }
    names.add(item.artifact);
    const target = `${item.profile}/${item.os}/${item.arch}`;
    if (item.profile === 'desktop') {
      seenOS.add(item.os);
      const format = item.os === 'darwin' ? 'dmg' : item.os === 'windows' ? 'portable-exe' : null;
      const extra = Array.isArray(item.downloads) ? item.downloads : [];
      if (extra.length !== (format ? 1 : 0)) errors.push(`desktop ${item.os} must carry exactly ${format ? 1 : 0} download(s): ${item.artifact}`);
      for (const download of extra) {
        const extension = format === 'dmg' ? '.dmg' : '.exe';
        if (format === null || download.format !== format || download.artifact !== item.artifact.replace(/\.tar\.gz$/, extension)) errors.push(`invalid desktop download for ${item.artifact}: ${download.artifact}`);
        else downloads.push({name: download.artifact, sha256: download.sha256});
      }
    } else required.delete(target);
    archives.push({name: item.artifact, sha256: item.sha256});
  }
  for (const missing of required) errors.push(`missing web/cli target ${missing}`);
  for (const os of DESKTOP_OS) if (!seenOS.has(os)) errors.push(`missing desktop artifact for ${os}`);
  return {errors, archives, downloads};
}

// checksums.txt covers the archives it was generated for; it never covers itself, the
// manifest or the update manifests. Every archive must be covered exactly once and the
// recorded digest must agree with the manifest.
export function checksumCoverage(lines, archives) {
  const recorded = new Map();
  for (const line of lines) {
    if (recorded.has(line.name)) { (recorded.duplicates ??= []).push(line.name); continue; }
    recorded.set(line.name, line.digest);
  }
  const missing = archives.filter(archive => !recorded.has(archive.name)).map(archive => archive.name);
  const archiveNames = new Set(archives.map(archive => archive.name));
  const unknown = lines.filter(line => !archiveNames.has(line.name)).map(line => line.name);
  const conflicting = archives.filter(archive => recorded.has(archive.name) && recorded.get(archive.name) !== archive.sha256).map(archive => archive.name);
  return {missing, unknown, conflicting, duplicates: recorded.duplicates ?? []};
}

function parseChecksums(text) {
  return text.trim().split('\n').filter(Boolean).map(line => {
    const [digest, ...rest] = line.split(/\s+/);
    return {digest, name: rest.join(' ')};
  });
}

// The OCI revision/version labels are the image's only source-identity record; both must
// match the tagged release exactly or the image cannot be attributed to this release.
export function imageIdentityErrors(labels, {version, commit}) {
  const errors = [];
  if (labels['org.opencontainers.image.version'] !== version) errors.push(`image label version ${labels['org.opencontainers.image.version'] ?? '(missing)'} does not match ${version}`);
  if (labels['org.opencontainers.image.revision'] !== commit) errors.push(`image label revision ${labels['org.opencontainers.image.revision'] ?? '(missing)'} does not match the release commit ${commit}`);
  return errors;
}

const REGISTRY_ACCEPT = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';
const PLATFORM_ACCEPT = 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';
const CONFIG_ACCEPT = 'application/vnd.oci.image.config.v1+json, application/vnd.docker.container.image.v1+json';

// Registry client with the standard token flow: request anonymously or with the GitHub
// token; on a 401 challenge exchange credentials at the advertised realm/service/scope
// and retry once. Public images need no credential at all; private ones need a token
// with read:packages. The digest of a tag is its top-level index digest.
export function createRegistryClient({fetchImpl = fetch, githubToken = '', repository}) {
  if (!repository) throw Error('registry client requires a repository');
  let bearerToken = null;
  const parseChallenge = header => {
    const params = Object.fromEntries([...header.matchAll(/(\w+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
    if (params.realm === undefined) throw Error(`unsupported registry challenge: ${header}`);
    return params;
  };
  const authorize = async params => {
    const url = new URL(params.realm);
    url.searchParams.set('service', params.service ?? 'ghcr.io');
    url.searchParams.set('scope', params.scope ?? `repository:${repository}:pull`);
    const response = await fetchImpl(url, {headers: githubToken ? {Authorization: `Bearer ${githubToken}`} : {}});
    if (!response.ok) throw Object.assign(Error(`registry token exchange failed: ${response.status} ${response.statusText}`), {status: response.status});
    const payload = await response.json();
    if (!payload.token) throw Error('registry token exchange returned no token');
    bearerToken = payload.token;
  };
  const request = async (path, accept) => {
    const attempt = () => fetchImpl(`https://ghcr.io/v2/${path}`, {headers: {Accept: accept, ...(bearerToken ? {Authorization: `Bearer ${bearerToken}`} : {})}});
    let response = await attempt();
    if (response.status === 401) {
      const challenge = response.headers.get('www-authenticate');
      if (!challenge) throw Object.assign(Error(`registry rejected the query without a challenge: 401 for ${path}`), {status: 401});
      await authorize(parseChallenge(challenge));
      response = await attempt();
    }
    if (!response.ok) throw Object.assign(Error(`${response.status} ${response.statusText} for ${path}`), {status: response.status});
    return response;
  };
  const platformEntry = (manifest, os, arch) => (manifest.manifests ?? []).find(entry => entry.platform?.os === os && entry.platform?.architecture === arch);
  return {
    // Top-level digest of the tag (an index for multi-arch images).
    async manifestDigest(tag) {
      const response = await request(`${repository}/manifests/${tag}`, REGISTRY_ACCEPT);
      const digest = response.headers.get('docker-content-digest');
      if (!digest) throw Error(`registry returned no docker-content-digest for ${tag}`);
      return digest;
    },
    // Config of one platform's image; a missing architecture is a hard finding.
    async imageConfig(tag, os, arch) {
      const index = await (await request(`${repository}/manifests/${tag}`, REGISTRY_ACCEPT)).json();
      const entry = platformEntry(index, os, arch);
      if (!entry) throw Object.assign(Error(`registry index for ${tag} has no ${os}/${arch} manifest`), {missingArchitecture: `${os}/${arch}`});
      const platformManifest = await (await request(`${repository}/manifests/${entry.digest}`, PLATFORM_ACCEPT)).json();
      const config = await (await request(`${repository}/blobs/${platformManifest.config.digest}`, CONFIG_ACCEPT)).json();
      return {digest: entry.digest, config};
    },
  };
}

export async function verifyPublished({fetchImpl, release, manifest, checksumsText, identity, temporary, record}) {
  const assets = new Map((release.assets ?? []).map(asset => [asset.name, asset]));
  const {errors, archives, downloads} = expectedFromManifest(manifest, identity);
  record('release manifest structure', errors.length === 0 ? 'verified' : 'failed',
    errors.length ? errors.join('; ') : `13 artifacts (${archives.length} archives, ${downloads.length} desktop downloads) match the assemble rules`);
  const necessary = [...REQUIRED_NON_ARCHIVE_ASSETS, ...archives.map(archive => archive.name), ...downloads.map(download => download.name)];
  const missingAssets = necessary.filter(name => !assets.has(name));
  record('necessary assets attached', missingAssets.length === 0 ? 'verified' : 'failed',
    missingAssets.length ? `missing ${missingAssets.join(', ')}` : `${necessary.length} expected assets attached (matrix derived from manifest.json)`);
  const coverage = checksumCoverage(parseChecksums(checksumsText), [...archives, ...downloads]);
  record('checksums.txt coverage', coverage.missing.length === 0 && coverage.unknown.length === 0 && coverage.conflicting.length === 0 && coverage.duplicates.length === 0 ? 'verified' : 'failed',
    [coverage.missing.length && `archives without a checksum line: ${coverage.missing.join(', ')}`,
     coverage.unknown.length && `checksum lines without a manifest archive: ${coverage.unknown.join(', ')}`,
     coverage.conflicting.length && `checksum/manifest digest conflicts: ${coverage.conflicting.join(', ')}`,
     coverage.duplicates.length && `duplicate checksum lines: ${coverage.duplicates.join(', ')}`].filter(Boolean).join('; ') || `all ${archives.length + downloads.length} archives covered`);
  // One download per archive; the bytes must satisfy BOTH digest sources independently.
  const recorded = new Map(parseChecksums(checksumsText).map(line => [line.name, line.digest]));
  let verifiedCount = 0; const digestIssues = [];
  for (const archive of [...archives, ...downloads]) {
    const asset = assets.get(archive.name);
    if (!asset) { digestIssues.push(`${archive.name}: not attached`); continue; }
    try {
      const response = await fetchImpl(asset.browser_download_url);
      if (!response.ok) throw Object.assign(Error(`${response.status} ${response.statusText}`), {status: response.status});
      const digest = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
      if (digest !== archive.sha256) digestIssues.push(`${archive.name}: manifest digest mismatch`);
      else if (recorded.get(archive.name) !== digest) digestIssues.push(`${archive.name}: checksums.txt digest mismatch`);
      else verifiedCount++;
    } catch (error) { digestIssues.push(`${archive.name}: download failed (${error.status ?? error.message})`); }
  }
  const total = archives.length + downloads.length;
  record('published digests', digestIssues.length === 0 && verifiedCount === total ? 'verified' : 'failed',
    digestIssues.length ? digestIssues.join('; ') : `${verifiedCount}/${total} archives downloaded with manifest and checksums.txt digests agreeing`);
}

async function verifyRelease({fetchImpl, release, identity, temporary, record}) {
  const assets = new Map((release.assets ?? []).map(asset => [asset.name, asset]));
  const download = async name => {
    const asset = assets.get(name);
    if (!asset) throw Object.assign(Error(`${name} is not attached`), {status: 404});
    const response = await fetchImpl(asset.browser_download_url);
    if (!response.ok) throw Object.assign(Error(`${response.status} ${response.statusText} for ${name}`), {status: response.status});
    return Buffer.from(await response.arrayBuffer());
  };
  const manifest = JSON.parse(Buffer.from(await download('manifest.json')).toString('utf8'));
  const checksumsText = Buffer.from(await download('checksums.txt')).toString('utf8');
  await verifyPublished({fetchImpl, release, manifest, checksumsText, identity, temporary, record});
}

async function main() {
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
  const fetchImpl = async url => fetch(url, {headers: {Authorization: `Bearer ${token}`}});
  const results = [];
  const record = (item, status, detail) => { results.push({item, status, detail}); console.log(`${status === 'verified' ? 'PASS' : status === 'unverified' ? 'TODO' : 'FAIL'} ${item}: ${detail}`); };
  const version = readFileSync('VERSION', 'utf8').trim();
  const temporary = mkdtempSync(join(tmpdir(), 'unicore-release-check-'));
  try {
    // 1. Source identity: tag, VERSION and the tagged commit must agree.
    const taggedCommit = execFileSync('git', ['rev-list', '-n', '1', tag], {encoding: 'utf8'}).trim();
    const taggedVersion = execFileSync('git', ['show', `${tag}:VERSION`], {encoding: 'utf8'}).trim();
    record('source identity', taggedVersion === version && `v${version}` === tag ? 'verified' : 'failed',
      `tag ${tag} -> commit ${taggedCommit.slice(0, 12)}, tagged VERSION ${taggedVersion}, working VERSION ${version}`);

    // 2. GitHub release: published, channel flag, body.
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/tags/${tag}`);
    if (!response.ok) throw Error(`Release ${tag} not reachable: ${response.status} ${response.statusText}`);
    const release = await response.json();
    const prereleaseExpected = kind === 'preview';
    const releaseOk = !release.draft && release.prerelease === prereleaseExpected && (release.body ?? '').trim().length > 0;
    record('release publication', releaseOk ? 'verified' : 'failed',
      `draft=${release.draft} prerelease=${release.prerelease} (expected ${prereleaseExpected} for ${kind}), notes ${release.body ? 'present' : 'missing'}`);

    // 3-5. Manifest-driven asset matrix, attachment completeness and digests.
    try {
      await verifyRelease({fetchImpl, release, identity: {version, commit: taggedCommit, channel: kind}, temporary, record});
    } catch (error) {
      record('release manifest structure', 'failed', error.message);
      record('necessary assets attached', 'failed', 'manifest.json or checksums.txt is not attached/readable');
      record('published digests', 'failed', 'cannot verify without the release manifest');
    }

    // 6. Rolling template traceability.
    const templateHead = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/framework-template'], {encoding: 'utf8'}).trim().split('\t')[0];
    if (templateHead) {
      execFileSync('git', ['fetch', '--force', 'origin', `${templateHead}:refs/temp/template-check`], {stdio: 'pipe'});
      const source = execFileSync('git', ['log', '-1', '--format=%B', templateHead], {encoding: 'utf8'}).match(/^Source: ([0-9a-f]{40})$/m)?.[1];
      if (!source) record('template source traceability', 'failed', `template head ${templateHead.slice(0, 12)} has no "Source: <sha>" trailer; regenerate with scripts/framework-template.mjs`);
      else {
        let ancestor = false;
        try { execFileSync('git', ['merge-base', '--is-ancestor', taggedCommit, source]); ancestor = true; } catch { ancestor = false; }
        record('template source traceability', ancestor ? 'verified' : 'failed',
          `template ${templateHead.slice(0, 12)} exported from source ${source.slice(0, 12)}; release commit ${ancestor ? 'is an ancestor' : 'is NOT an ancestor (stale template)'}`);
      }
    } else record('template source traceability', 'failed', 'origin has no framework-template branch');

    // 7. Image digests and source identity on GHCR: the exact version tag always; the
    // floating major.minor tag only for stable, and its top-level index digest must equal
    // the version tag's. Every expected platform's identity labels are checked.
    const registryRepository = repository.toLowerCase();
    const client = createRegistryClient({fetchImpl, githubToken: token, repository: registryRepository});
    const imageFinding = async (item, verify) => {
      try { record(item, 'verified', await verify()); }
      catch (error) {
        if (error.status === 404) record(item, 'failed', error.message);
        else if (error.missingArchitecture) record(item, 'failed', error.message);
        else record(item, 'unverified', `registry rejected the query (${error.status ?? error.message}); a private image needs "gh auth refresh -s read:packages"`);
      }
    };
    let versionDigest = null;
    await imageFinding(`image ghcr.io/${registryRepository}:${version}`, async () => {
      versionDigest = await client.manifestDigest(version);
      return `top-level registry digest ${versionDigest.slice(0, 32)}…`;
    });
    for (const arch of ['amd64', 'arm64']) {
      await imageFinding(`image identity linux/${arch}`, async () => {
        if (!versionDigest) throw Object.assign(Error('version tag digest unavailable'), {status: 404});
        const {config} = await client.imageConfig(version, 'linux', arch);
        const errors = imageIdentityErrors(config?.config?.Labels ?? {}, {version, commit: taggedCommit});
        if (errors.length) throw Error(errors.join('; '));
        return `labels version=${version} revision=${taggedCommit.slice(0, 12)} match the release commit`;
      });
    }
    if (kind === 'stable') {
      const floating = version.split('.').slice(0, 2).join('.');
      await imageFinding('image floating tag digest', async () => {
        const floatingDigest = await client.manifestDigest(floating);
        if (!versionDigest || floatingDigest !== versionDigest) throw Error(`floating ${floating} top-level digest ${floatingDigest.slice(0, 32)}… must equal the version tag digest ${(versionDigest ?? '(unavailable)').slice(0, 32)}…`);
        return `floating ${floating} equals the version tag digest ${versionDigest.slice(0, 32)}…`;
      });
    }

    // 8. Optional local candidate bundle cross-check (reuse its own checksums and manifest).
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
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
export {parseChecksums};
