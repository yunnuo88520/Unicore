// Author: yunnuo <ymz@ebox.vip>
// Description: Regression tests for the release completeness checker: the published asset matrix comes from
// the release manifest under the assemble rules, checksums.txt must cover every archive without covering itself,
// and each archive must satisfy both digest sources. Injected fetchers make the scenarios deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checksumCoverage, expectedFromManifest, imageIdentityErrors, parseChecksums } from './release-completeness.mjs';

const COMMIT = 'a'.repeat(40);
const IDENTITY = { version: '1.2.3', commit: COMMIT, channel: 'preview' };
const digest = name => createHash('sha256').update(name).digest('hex');
const tar = (profile, os, arch, downloads = []) => ({
  profile, os, arch,
  artifact: `acme-${profile}-${os}-${arch}-v1.2.3.tar.gz`,
  sha256: digest(`acme-${profile}-${os}-${arch}-v1.2.3.tar.gz`),
  ...(downloads.length ? { downloads: downloads.map(artifact => ({ artifact, sha256: digest(artifact), format: artifact.endsWith('.dmg') ? 'dmg' : 'portable-exe' })) } : {}),
});
const manifest = () => ({
  version: '1.2.3', source_commit: COMMIT, channel: 'preview',
  artifacts: [
    ...['web-platform', 'web-standalone'].flatMap(profile => ['amd64', 'arm64'].map(arch => tar(profile, 'linux', arch))),
    ...['linux', 'darwin', 'windows'].flatMap(os => ['amd64', 'arm64'].map(arch => tar('cli', os, arch))),
    tar('desktop', 'linux', 'amd64'),
    tar('desktop', 'darwin', 'arm64', [`acme-desktop-darwin-arm64-v1.2.3.dmg`]),
    tar('desktop', 'windows', 'amd64', [`acme-desktop-windows-amd64-v1.2.3.exe`]),
  ],
});
const allArchives = doc => doc.artifacts.flatMap(item => [item.artifact, ...((item.downloads ?? []).map(download => download.artifact))]);
const checksumsText = doc => allArchives(doc).map(name => `${digest(name)}  ${name}`).join('\n') + '\n';

test('the manifest-derived matrix accepts a well-formed release and rejects structural drift', () => {
  const document = manifest();
  const expected = expectedFromManifest(document, IDENTITY);
  assert.deepEqual(expected.errors, []);
  assert.equal(expected.archives.length, 13);
  assert.equal(expected.downloads.length, 2);
  // Missing a web target or a desktop OS must fail with the specific gap.
  document.artifacts = document.artifacts.filter(item => !(item.profile === 'web-platform' && item.arch === 'arm64'));
  const drift = expectedFromManifest(document, IDENTITY);
  assert.ok(drift.errors.some(error => error.includes('missing web/cli target web-platform/linux/arm64')), drift.errors.join('; '));
  const withoutDarwin = expectedFromManifest({ ...manifest(), artifacts: manifest().artifacts.filter(item => !(item.profile === 'desktop' && item.os === 'darwin')) }, IDENTITY);
  assert.ok(withoutDarwin.errors.some(error => error.includes('missing desktop artifact for darwin')), withoutDarwin.errors.join('; '));
  // Desktop entries must carry their dmg/exe download, and identity must match the tag.
  const missingDownload = expectedFromManifest({ ...manifest(), artifacts: manifest().artifacts.map(item => item.profile === 'desktop' && item.os === 'darwin' ? { ...item, downloads: [] } : item) }, IDENTITY);
  assert.ok(missingDownload.errors.some(error => error.includes('must carry exactly 1 download')), missingDownload.errors.join('; '));
  assert.ok(expectedFromManifest(manifest(), { ...IDENTITY, version: '9.9.9' }).errors.some(error => error.includes('identity mismatch')));
  assert.ok(expectedFromManifest(manifest(), { ...IDENTITY, channel: 'stable' }).errors.some(error => error.includes('does not match the requested stable')));
});

test('checksums.txt must cover every archive, may not cover unrelated files, and must not cover itself', () => {
  const document = manifest();
  const { archives, downloads } = expectedFromManifest(document, IDENTITY);
  const covered = [...archives, ...downloads];
  // A well-formed checksums file passes; adding itself or foreign lines is an anomaly.
  const good = parseChecksums(checksumsText(document));
  assert.deepEqual(checksumCoverage(good, covered), { missing: [], unknown: [], conflicting: [], duplicates: [] });
  const withSelf = parseChecksums(checksumsText(document) + `${digest('checksums.txt')}  checksums.txt\n`);
  assert.deepEqual(checksumCoverage(withSelf, covered).unknown, ['checksums.txt']);
  const withForeign = parseChecksums(checksumsText(document) + `${digest(' rogue.tar.gz')}  rogue.tar.gz\n`);
  assert.deepEqual(checksumCoverage(withForeign, covered).unknown, ['rogue.tar.gz']);
  // 漏校验: dropping one archive line is reported by name.
  const lacking = parseChecksums(checksumsText(document).split('\n').filter(line => !line.includes('acme-cli-windows-arm64')).join('\n'));
  assert.deepEqual(checksumCoverage(lacking, covered).missing, ['acme-cli-windows-arm64-v1.2.3.tar.gz']);
  // Digest conflicts between checksums.txt and the manifest are surfaced, not averaged away.
  const conflicting = parseChecksums(checksumsText(document).replace(/^[0-9a-f]+(  acme-cli-windows-arm64)/m, `${digest('wrong')}$1`));
  assert.deepEqual(checksumCoverage(conflicting, covered).conflicting, ['acme-cli-windows-arm64-v1.2.3.tar.gz']);
  const duplicated = parseChecksums(checksumsText(document) + checksumsText(document).split('\n')[0] + '\n');
  assert.deepEqual(checksumCoverage(duplicated, covered).duplicates, [document.artifacts[0].artifact]);
});

const fakeRelease = document => ({
  assets: ['manifest.json', 'checksums.txt', 'update-manifest.json', 'update-manifest.sig', ...allArchives(document)]
    .map(name => ({ name, browser_download_url: `fixture://${name}` })),
});
const fakeFetch = files => async url => {
  const name = url.replace('fixture://', '');
  if (!(name in files)) return { ok: false, status: 404, statusText: 'Not Found' };
  return { ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => files[name] };
};
async function runAssetChecks(release, document, checksums) {
  const results = [];
  const record = (item, status, detail) => results.push({ item, status, detail });
  const files = { 'manifest.json': Buffer.from(JSON.stringify(document)), 'checksums.txt': Buffer.from(checksums) };
  for (const asset of release.assets) if (!(asset.name in files)) files[asset.name] = Buffer.from(asset.name);
  const { verifyPublished } = await import('./release-completeness.mjs');
  await verifyPublished({ fetchImpl: fakeFetch(files), release, manifest: document, checksumsText: checksums, identity: IDENTITY, temporary: '/tmp', record });
  return Object.fromEntries(results.map(entry => [entry.item, entry]));
}

test('published asset verification passes a complete release and fails closed on tampering', async () => {
  const document = manifest();
  const complete = await runAssetChecks(fakeRelease(document), document, checksumsText(document));
  assert.equal(complete['release manifest structure'].status, 'verified');
  assert.equal(complete['necessary assets attached'].status, 'verified');
  assert.equal(complete['checksums.txt coverage'].status, 'verified');
  assert.equal(complete['published digests'].status, 'verified');

  // 缺包: a missing archive is reported by name at both the attachment and digest checks.
  const withoutExe = structuredClone(document);
  const release = fakeRelease(withoutExe);
  release.assets = release.assets.filter(asset => asset.name !== 'acme-desktop-windows-amd64-v1.2.3.exe');
  const missing = await runAssetChecks(release, withoutExe, checksumsText(withoutExe));
  assert.equal(missing['necessary assets attached'].status, 'failed');
  assert.match(missing['necessary assets attached'].detail, /acme-desktop-windows-amd64-v1\.2\.3\.exe/);
  assert.equal(missing['published digests'].status, 'failed');
  assert.match(missing['published digests'].detail, /not attached/);

  // 漏校验: removing one checksum line fails the coverage check while digests stay verifiable.
  const lackingChecksums = checksumsText(document).split('\n').filter(line => !line.includes('acme-desktop-darwin-arm64-v1.2.3.dmg')).join('\n');
  const lacking = await runAssetChecks(fakeRelease(document), document, lackingChecksums);
  assert.equal(lacking['checksums.txt coverage'].status, 'failed');
  assert.match(lacking['checksums.txt coverage'].detail, /without a checksum line: acme-desktop-darwin-arm64-v1\.2\.3\.dmg/);
  assert.equal(lacking['published digests'].status, 'failed');
  assert.match(lacking['published digests'].detail, /checksums\.txt digest mismatch/);

  // 摘要错误: a tampered archive satisfies neither digest source.
  const tampered = structuredClone(document);
  tampered.artifacts.find(item => item.artifact === 'acme-cli-linux-amd64-v1.2.3.tar.gz').sha256 = digest('attacker-payload');
  const mismatched = await runAssetChecks(fakeRelease(tampered), tampered, checksumsText(tampered));
  assert.equal(mismatched['published digests'].status, 'failed');
  assert.match(mismatched['published digests'].detail, /manifest digest mismatch/);
});

test('image source identity must match the release version and tagged commit', () => {
  const labels = {'org.opencontainers.image.version': '1.2.3', 'org.opencontainers.image.revision': COMMIT};
  assert.deepEqual(imageIdentityErrors(labels, IDENTITY), []);
  assert.deepEqual(
    imageIdentityErrors({'org.opencontainers.image.version': '1.2.3', 'org.opencontainers.image.revision': 'dev'}, IDENTITY),
    [`image label revision dev does not match the release commit ${COMMIT}`],
    'an image built without the commit build-arg must fail the identity check, not pass silently');
  const missing = imageIdentityErrors({}, IDENTITY);
  assert.ok(missing.some(error => error.includes('version (missing)')) && missing.some(error => error.includes('revision (missing)')));
  assert.ok(imageIdentityErrors({...labels, 'org.opencontainers.image.version': '9.9.9'}, IDENTITY).some(error => error.includes('does not match 1.2.3')));
});
