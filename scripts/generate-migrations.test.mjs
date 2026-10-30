// Author: yunnuo <ymz@ebox.vip>
// Description: Verify single-source ordering, byte checksums, strict catalog rejection and reproducible projections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMetadata, generateMigrations } from './generate-migrations.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'unicore-catalog-'));
  try {
    mkdirSync(join(root, 'migrations'));
    for (const path of ['catalog.json', 'core', 'platform', 'modules']) cpSync(join(source, 'migrations', path), join(root, 'migrations', path), { recursive: true });
    const catalogPath = join(root, 'migrations/catalog.json');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    run(root, catalog, () => writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n'));
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('repeated generation is identical, check mode detects tampering, raw-byte SHA-256 includes CRLF', () => fixture((root, c) => {
  const first = generateMigrations(root), go = readFileSync(join(root, 'migrations/catalogdata/catalog.gen.go'));
  const json = readFileSync(join(root, 'migrations/metadata.gen.json'));
  generateMigrations(root + '/'); generateMigrations(root, true);
  assert.deepEqual(readFileSync(join(root, 'migrations/catalogdata/catalog.gen.go')), go);
  assert.deepEqual(readFileSync(join(root, 'migrations/metadata.gen.json')), json);
  const path = join(root, 'migrations', c.namespaces[0].migrations[0].files.sqlite);
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('\n', '\r\n'));
  const changed = buildMetadata(root).generation_anchor.checksums.sqlite;
  assert.equal(changed, createHash('sha256').update(readFileSync(path)).digest('hex'));
  assert.notEqual(changed, first.generation_anchor.checksums.sqlite);
  assert.throws(() => generateMigrations(root, true), /stale/);
  generateMigrations(root);
  writeFileSync(join(root, 'migrations/metadata.gen.json'), '{}');
  assert.throws(() => generateMigrations(root, true), /stale/);
}));
test('profile members and namespace declaration order cannot become a second ordering source', () => fixture((root, c, save) => {
  const before = buildMetadata(root);
  c.namespaces.reverse();
  for (const p of Object.values(c.profiles)) { p.namespaces.reverse(); p.dialects.reverse(); }
  c.dialects.reverse(); c.sql_roots.reverse(); save();
  assert.deepEqual(buildMetadata(root), before);
  assert.deepEqual(before.profiles['web-platform'].order, ['core', 'module.notes', 'platform']);
  const platform = c.namespaces.find(n => n.id === 'platform');
  platform.depends_on.push('module.notes'); save();
  assert.deepEqual(buildMetadata(root).profiles['web-platform'].order, ['core', 'module.notes', 'platform']);
}));
test('legacy SQL is excluded from registration while new unregistered SQL fails', () => fixture((root) => {
  mkdirSync(join(root, 'migrations/sqlite')); writeFileSync(join(root, 'migrations/sqlite/0001_old.sql'), 'not SQL');
  assert.doesNotThrow(() => buildMetadata(root));
  writeFileSync(join(root, 'migrations/core/sqlite/0002_hidden.sql'), '-- hidden');
  assert.throws(() => buildMetadata(root), /unregistered/);
}));
test('dependency edges alone change execution order for an additional module', () => fixture((root, c, save) => {
  const files = {};
  for (const dialect of c.dialects) {
    const path = `modules/extra/${dialect}/0001_initial.sql`;
    mkdirSync(join(root, 'migrations', `modules/extra/${dialect}`), { recursive: true });
    writeFileSync(join(root, 'migrations', path), '-- Author: yunnuo <ymz@ebox.vip>\nCREATE TABLE extra (id INTEGER PRIMARY KEY);\n');
    files[dialect] = path;
  }
  const extra = { id: 'module.extra', depends_on: ['core'], migrations: [{ version: 1, files }] };
  c.namespaces.push(extra); c.profiles['web-platform'].namespaces.push('module.extra'); save();
  assert.deepEqual(buildMetadata(root).profiles['web-platform'].order, ['core', 'module.extra', 'module.notes', 'platform']);
  extra.depends_on = ['platform']; save();
  assert.deepEqual(buildMetadata(root).profiles['web-platform'].order, ['core', 'module.notes', 'platform', 'module.extra']);
}));
const invalid = [
  ['unknown fields', c => { c.max_version = 1; }, /unknown field/],
  ['manual checksum', c => { c.namespaces[0].migrations[0].checksum = 'bad'; }, /unknown field/],
  ['duplicate namespace', c => { c.namespaces.push(c.namespaces[0]); }, /duplicate/],
  ['missing dialect', c => { delete c.namespaces[0].migrations[0].files.mysql; }, /missing field/],
  ['fractional version', c => { c.namespaces[0].migrations[0].version = 1.1; }, /integer/],
  ['version gap', c => { c.namespaces[0].migrations[0].version = 2; }, /noncontiguous/],
  ['duplicate version', c => { c.namespaces[0].migrations.push(c.namespaces[0].migrations[0]); }, /duplicate/],
  ['dependency cycle', c => { c.namespaces[0].depends_on = ['platform']; }, /cycle/],
  ['unknown dependency', c => { c.namespaces[1].depends_on.push('module.unknown'); }, /unknown/],
  ['missing profile dependency', c => { c.namespaces[2].depends_on = ['platform']; }, /missing dependency/],
  ['platform profile leak', c => { c.profiles.desktop.namespaces.push('platform'); }, /profile leak/],
  ['CLI database dependency', c => { c.profiles.cli.namespaces.push('core'); }, /membership/],
  ['desktop external driver', c => { c.profiles.desktop.dialects.push('mysql'); }, /support/],
  ['path traversal', c => { c.namespaces[0].migrations[0].files.sqlite = 'core/sqlite/../../0001_initial.sql'; }, /unsafe path/],
  ['absolute SQL path', c => { c.namespaces[0].migrations[0].files.sqlite = '/tmp/untrusted.sql'; }, /path mismatch/],
  ['wrong filename version', c => { c.namespaces[0].migrations[0].files.sqlite = 'core/sqlite/0002_initial.sql'; }, /filename/],
  ['extra ledger column', c => { c.ledger.columns.push({ name: 'generation' }); }, /ledger/],
  ['nullable ledger field', c => { c.ledger.columns[0].nullable = true; }, /ledger/],
  ['missing generation anchor', c => { delete c.generation_anchor; }, /missing field/],
  ['non-string generation label', c => { c.schema_generation = null; }, /generation/]
];
for (const [name, mutate, error] of invalid) test(`rejects ${name}`, () => fixture((root, c, save) => { mutate(c); save(); assert.throws(() => buildMetadata(root), error); }));
test('duplicate JSON property names and symlink inputs/outputs fail closed', () => fixture((root, c, save) => {
  const path = join(root, 'migrations/catalog.json');
  writeFileSync(path, readFileSync(path, 'utf8').replace('"format_version": 1', '"format_version": 1, "format_version": 1'));
  assert.throws(() => buildMetadata(root), /duplicate JSON/); save();
  const file = join(root, 'migrations/core/sqlite/0001_initial.sql');
  rmSync(file); symlinkSync(join(source, 'migrations/core/sqlite/0001_initial.sql'), file);
  assert.throws(() => buildMetadata(root), /link/);
  rmSync(file); cpSync(join(source, 'migrations/core/sqlite/0001_initial.sql'), file);
  const outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(root, 'migrations/catalogdata'));
  assert.throws(() => generateMigrations(root), /parent link/);
}));
test('dangling generated-output links are rejected before any file is written', () => fixture(root => {
  const outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(join(outside, 'new.json'), join(root, 'migrations/metadata.gen.json'));
  assert.throws(() => generateMigrations(root), /output link/);
  assert.throws(() => readFileSync(join(outside, 'new.json')), /ENOENT/);
  assert.throws(() => readFileSync(join(root, 'migrations/catalogdata/catalog.gen.go')), /ENOENT/);
}));
