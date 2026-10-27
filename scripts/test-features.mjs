// Author: yunnuo <ymz@ebox.vip>
// Description: Build all editions and prove omitted UI/Go files plus real PC/mobile placeholder behavior.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

function run(command, args, env, capture = false) {
  return execFileSync(command, args, { env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
}
for (const [license, updater] of [[true, true], [true, false], [false, true], [false, false]]) {
  const env = { ...process.env, FEATURE_LICENSE: String(license), FEATURE_UPDATER: String(updater) };
  run('make', ['build-web'], env);
  const manifest = JSON.parse(readFileSync('apps/web/static/features.json', 'utf8'));
  assert.equal(manifest.license, license); assert.equal(manifest.updater, updater);
  const files = readdirSync('apps/web/static/assets').filter(name => name.endsWith('.js'));
  const source = files.map(name => readFileSync(`apps/web/static/assets/${name}`, 'utf8')).join('\n');
  assert.equal(source.includes('尚未接入授权服务'), license, 'license UI exclusion');
  assert.equal(source.includes('暂无版本服务返回的更新日志'), updater, 'updater UI exclusion');
  const tags = [license && 'license', updater && 'updater'].filter(Boolean).join(',');
  const edition = JSON.parse(run('go', ['list', '-json', '-tags', tags, './internal/edition'], env, true));
  for (const [feature, enabled] of Object.entries({ license, updater })) {
    assert(edition.GoFiles.includes(`${feature}_${enabled ? 'enabled' : 'disabled'}.go`));
    assert(!edition.GoFiles.includes(`${feature}_${enabled ? 'disabled' : 'enabled'}.go`));
  }
  run('pnpm', ['exec', 'playwright', 'test', 'tests/e2e/settings.spec.ts', '--grep', 'site identity'], env);
  console.log(`PASS edition license=${license}, updater=${updater}`);
}
