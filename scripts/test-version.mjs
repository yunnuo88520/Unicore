// Author: yunnuo <ymz@ebox.vip>
// Description: Test release preparation and drift rejection in a throwaway source tree.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'unicore-version-'));
const files=['scripts/version.mjs','scripts/release-notes.mjs','VERSION','CHANGELOG.md','package.json','apps/web/package.json','apps/desktop/package.json','packages/contracts/package.json','packages/sdk/package.json','packages/web-ui/package.json','packages/contracts/openapi.json','cmd/desktop/wails.json','internal/buildinfo/version.gen.go'];
for(const path of files){mkdirSync(dirname(join(dir,path)),{recursive:true});cpSync(path,join(dir,path));}
const run=args=>execFileSync(process.execPath,['scripts/version.mjs',...args],{cwd:dir,stdio:'pipe'});
const rejects=args=>assert.notEqual(spawnSync(process.execPath,['scripts/version.mjs',...args],{cwd:dir,stdio:'pipe'}).status,0);
try {
  run(['--check']);
  const original=readFileSync(join(dir,'VERSION'),'utf8').trim();
  rejects(['--release',original]);rejects(['--release','invalid']);
  writeFileSync(join(dir,'VERSION'),'9.8.7\n');rejects(['--check']);
  run([]);run(['--check']);
  assert.equal(JSON.parse(readFileSync(join(dir,'packages/contracts/openapi.json'))).info.version,'9.8.7');
  assert.equal(JSON.parse(readFileSync(join(dir,'cmd/desktop/wails.json'))).info.productVersion,'9.8.7');
  writeFileSync(join(dir,'CHANGELOG.md'),'# Changelog\n\n## Unreleased\n\n');rejects(['--release','9.8.8']);
  assert.equal(readFileSync(join(dir,'VERSION'),'utf8'),'9.8.7\n');
  writeFileSync(join(dir,'CHANGELOG.md'),'# Changelog\n\n## Unreleased\n\n- English only.\n');rejects(['--release','9.8.8']);
  assert.equal(readFileSync(join(dir,'VERSION'),'utf8'),'9.8.7\n');
  writeFileSync(join(dir,'CHANGELOG.md'),'# Changelog\n\n## Unreleased\n\n### 中文\n\n- 部署后保留设置。\n\n### English\n\n- Preserve settings after deployment.\n\n## 9.8.6 — 2026-01-01\n\n- Older release.\n');
  run(['--release','9.8.8']);run(['--check']);
  assert.equal(readFileSync(join(dir,'VERSION'),'utf8'),'9.8.8\n');
  assert.match(readFileSync(join(dir,'CHANGELOG.md'),'utf8'),/## Unreleased\n\n## 9\.8\.8 — \d{4}-\d{2}-\d{2}\n[\s\S]*- Preserve settings after deployment\./);
  assert.match(readFileSync(join(dir,'CHANGELOG.md'),'utf8'),/## 9\.8\.6 — 2026-01-01\n\n- Older release\./);
  rejects(['--release','9.8.8']);rejects(['--release','9.8.7']);
  console.log('PASS version drift rejection, isolated release preparation, changelog preservation and invalid/empty/downgrade rejection');
} finally {rmSync(dir,{recursive:true,force:true});}
