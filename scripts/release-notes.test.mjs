// Author: yunnuo <ymz@ebox.vip>
// Description: Prevent untranslated release preparation and wrong-source public download instructions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bilingualNotes, versionNotes, renderRelease} from './release-notes.mjs';
const notes = '### 中文\n\n- 修复配置加载，升级前备份。\n\n### English\n\n- Fix configuration loading; back up before upgrading.';
test('missing, empty, unpaired and placeholder translations fail closed', () => {
  for (const bad of ['- English only', '### 中文\n- 修复\n### English\n', notes + '\n- Untranslated addition.', notes.replace('Fix configuration', 'TODO configuration')]) assert.throws(() => bilingualNotes(bad));
  assert.equal(bilingualNotes(notes).en, '- Fix configuration loading; back up before upgrading.');
  const log = `## Unreleased\n\n## 1.2.3 — 2026-10-31\n\n${notes}\n\n## 1.2.2 — 2026-10-28\n\n- Old monolingual history.\n`;
  assert.equal(versionNotes(log, '1.2.3').zh, '- 修复配置加载，升级前备份。');
  assert.throws(() => versionNotes(log, '1.2.4'), /Missing/);
});
test('notes use actual bundle targets and native downloads, with exact provenance', () => {
  const options = {version:'1.2.3', brand:'Sample App', repository:'team/product', ciRun:'123', candidateRun:'456', securityRun:'789', notes, manifest:{version:'1.2.3', source_commit:'a'.repeat(40), artifacts:[{profile:'desktop',os:'darwin',arch:'arm64',artifact:'sample-desktop-darwin-arm64-v1.2.3.tar.gz',platform_signature:'unsigned',downloads:[{format:'dmg',artifact:'sample-desktop-darwin-arm64-v1.2.3.dmg'}]}]}};
  const result = renderRelease(options);
  assert.match(result, /## 中文[\s\S]+## English/);
  assert.match(result, /releases\/download\/v1.2.3\/sample-desktop-darwin-arm64-v1.2.3.dmg/);
  assert.match(result, /actions\/runs\/123/);
  assert.match(result, /actions\/runs\/456/);
  assert.match(result, /actions\/runs\/789/);
  assert.match(result, /--source-digest a{40}/);
  assert(!result.includes('desktop-windows'));
  assert(!result.includes('yunnuo88520'));
  assert(!result.includes('Old monolingual history'));
  assert.throws(() => renderRelease({...options, version:'1.2.4'}));
  assert.throws(() => renderRelease({...options, ciRun:'wrong'}));
  assert.throws(() => renderRelease({...options, repository:'https://example.test'}));
});
