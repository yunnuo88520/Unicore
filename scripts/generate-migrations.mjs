// Author: yunnuo <ymz@ebox.vip>
// Description: Validate the new-generation catalog and generate data only; never connect to a database.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dialects = ['mysql', 'postgres', 'sqlite'];
const author = 'yunnuo <ymz@ebox.vip>';
const fail = message => { throw Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = list => [...list].sort();
function keys(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`missing field ${key}`);
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`unknown field ${key}`);
}
function unique(values, label) {
  if (!Array.isArray(values) || values.some(v => typeof v !== 'string') || new Set(values).size !== values.length) fail(`invalid or duplicate ${label}`);
  return sorted(values);
}
function parseCatalog(text) {
  const parsed = JSON.parse(text);
  // JSON.parse alone silently accepts duplicate object keys. Inspect string tokens after syntax validation.
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g) ?? [], stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ':') {
      const name = JSON.parse(token), seen = stack.at(-1);
      if (seen.has(name)) fail(`duplicate JSON key ${name}`);
      seen.add(name);
    }
  }
  return parsed;
}
function regularPath(base, relative, directory = false) {
  if (typeof relative !== 'string' || !/^[a-z0-9_./-]+$/.test(relative) || relative.split('/').some(p => !p || p === '.' || p === '..')) fail(`unsafe path ${relative}`);
  let current = base;
  for (const part of relative.split('/')) {
    current = join(current, part);
    if (!existsSync(current) || lstatSync(current).isSymbolicLink()) fail(`missing path or link ${relative}`);
  }
  const stat = lstatSync(current);
  if (directory ? !stat.isDirectory() : !stat.isFile()) fail(`not a regular ${directory ? 'directory' : 'file'}: ${relative}`);
  return current;
}
function walkSQL(base, directory) {
  const output = [];
  for (const entry of readdirSync(regularPath(base, directory, true), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) fail(`links forbidden in managed roots: ${path}`);
    if (entry.isDirectory()) output.push(...walkSQL(base, path));
    else if (entry.isFile() && entry.name.endsWith('.sql')) output.push(path);
    else if (!entry.isFile()) fail(`special file in managed roots: ${path}`);
  }
  return sorted(output);
}
function topological(namespaces) {
  const pending = new Map(namespaces.map(n => [n.id, new Set(n.depends_on)])), order = [];
  while (pending.size) {
    const next = sorted([...pending].filter(([, deps]) => deps.size === 0).map(([id]) => id))[0];
    if (!next) fail('namespace dependency cycle');
    order.push(next); pending.delete(next);
    for (const deps of pending.values()) deps.delete(next);
  }
  return order;
}
function ledgerDDL(ledger, dialect) {
  const columns = ledger.columns.map(c => `  ${c.name} ${c.type.toUpperCase()}${c.length ? `(${c.length})` : ''} NOT NULL`);
  columns.push(`  PRIMARY KEY (${ledger.primary_key.join(', ')})`);
  return `CREATE TABLE ${ledger.table} (\n${columns.join(',\n')}\n)${dialect === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin' : ''};\n`;
}

export function buildMetadata(project = root) {
  const base = join(project, 'migrations');
  if (lstatSync(base).isSymbolicLink() || !lstatSync(base).isDirectory()) fail('migration root must be a real directory');
  const c = parseCatalog(readFileSync(regularPath(base, 'catalog.json'), 'utf8'));
  keys(c, ['author', 'format_version', 'schema_generation', 'generation_anchor', 'checksum_algorithm', 'dialects', 'sql_roots', 'ledger', 'profiles', 'namespaces']);
  if (c.author !== author || c.format_version !== 1 || typeof c.schema_generation !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(c.schema_generation) || c.checksum_algorithm !== 'sha256-raw-v1') fail('unsupported catalog format, author, generation or checksum algorithm');
  if (JSON.stringify(unique(c.dialects, 'dialects')) !== JSON.stringify(dialects)) fail('all three dialects required');
  const roots = unique(c.sql_roots, 'SQL roots');
  if (JSON.stringify(roots) !== JSON.stringify(['core', 'modules', 'platform'])) fail('managed SQL roots must isolate core/platform/modules from 0.x');
  const expectedLedger = {
    table: 'schema_migrations', columns: [
      { name: 'namespace', type: 'varchar', length: 96, nullable: false },
      { name: 'version', type: 'bigint', nullable: false },
      { name: 'checksum', type: 'varchar', length: 64, nullable: false },
      { name: 'applied_at', type: 'bigint', nullable: false }
    ], primary_key: ['namespace', 'version'], applied_at_unit: 'utc_unix_seconds'
  };
  keys(c.ledger, Object.keys(expectedLedger));
  if (c.ledger.table !== expectedLedger.table || c.ledger.applied_at_unit !== expectedLedger.applied_at_unit || JSON.stringify(c.ledger.primary_key) !== JSON.stringify(expectedLedger.primary_key) || !Array.isArray(c.ledger.columns) || c.ledger.columns.length !== 4) fail('four-column ledger contract required');
  c.ledger.columns.forEach((column, i) => {
    const expected = expectedLedger.columns[i]; keys(column, Object.keys(expected));
    if (Object.keys(expected).some(k => column[k] !== expected[k])) fail('invalid ledger column');
  });
  if (!Array.isArray(c.namespaces) || !c.namespaces.length) fail('namespaces required');
  const ids = unique(c.namespaces.map(n => n.id), 'namespace ids'), files = new Set();
  for (const n of c.namespaces) {
    keys(n, ['id', 'depends_on', 'migrations']);
    if (!/^(core|platform|module\.[a-z][a-z0-9_-]{0,63})$/.test(n.id)) fail(`invalid namespace ${n.id}`);
    n.depends_on = unique(n.depends_on, 'dependencies');
    if (n.depends_on.some(id => !ids.includes(id) || id === n.id)) fail('unknown or self dependency');
    if (!Array.isArray(n.migrations) || !n.migrations.length) fail('migrations required');
    if (n.migrations.some(m => !Number.isSafeInteger(m.version) || m.version < 1)) fail('positive integer migration versions required');
    n.migrations.sort((a, b) => a.version - b.version);
    n.migrations = n.migrations.map((m, index) => {
      keys(m, ['version', 'files']);
      if (m.version !== index + 1) fail('duplicate or noncontiguous migration versions');
      keys(m.files, dialects);
      const generated = {};
      for (const dialect of dialects) {
        const path = m.files[dialect];
        const prefix = n.id === 'core' || n.id === 'platform' ? n.id : `modules/${n.id.slice(7)}`;
        if (typeof path !== 'string' || !path.startsWith(`${prefix}/${dialect}/`) || !/^\d{4,}_[a-z0-9_]+\.sql$/.test(path.split('/').at(-1))) fail('SQL namespace/dialect path mismatch');
        if (Number(path.split('/').at(-1).split('_')[0]) !== m.version) fail('SQL filename/version mismatch');
        if (files.has(path)) fail('SQL referenced more than once');
        files.add(path);
        const bytes = readFileSync(regularPath(base, path));
        if (!bytes.length || !bytes.subarray(0, 1200).toString().includes(`Author: ${author}`)) fail(`missing SQL content/author ${path}`);
        generated[dialect] = { path, bytes: bytes.length, checksum: sha256(bytes) };
      }
      return { version: m.version, files: generated };
    });
  }
  if (!ids.includes('core') || !ids.includes('platform') || !ids.includes('module.notes')) fail('required namespaces missing');
  const order = topological(c.namespaces);
  const allSQL = roots.flatMap(r => walkSQL(base, r));
  if (allSQL.length !== files.size || allSQL.some(p => !files.has(p))) fail('unregistered SQL in new-generation roots');
  keys(c.generation_anchor, ['namespace', 'version']);
  if (c.generation_anchor.namespace !== 'core' || c.generation_anchor.version !== 1) fail('generation must anchor immutable core version 1');
  const core = c.namespaces.find(n => n.id === 'core');
  if (core.depends_on.length) fail('core must not depend on other namespaces');
  const checksums = Object.fromEntries(dialects.map(d => [d, core.migrations[0].files[d].checksum]));
  keys(c.profiles, ['web-platform', 'web-standalone', 'desktop', 'cli']);
  const profiles = {};
  for (const id of sorted(Object.keys(c.profiles))) {
    const p = c.profiles[id]; keys(p, ['dialects', 'namespaces']);
    const ds = unique(p.dialects, 'profile dialects'), members = unique(p.namespaces, 'profile namespace members');
    const supported = id === 'cli' ? [] : id === 'desktop' ? ['sqlite'] : dialects;
    if (JSON.stringify(ds) !== JSON.stringify(supported)) fail('profile dialect support mismatch');
    if (id === 'cli' ? members.length : !members.includes('core') || !members.includes('module.notes')) fail('profile required membership mismatch');
    if ((id === 'web-platform') !== members.includes('platform')) fail('platform namespace profile leak or omission');
    if (members.some(n => !ids.includes(n))) fail('unknown profile namespace');
    if (members.some(n => c.namespaces.find(x => x.id === n).depends_on.some(d => !members.includes(d)))) fail('profile missing dependency');
    profiles[id] = { dialects: ds, namespaces: members, order: order.filter(n => members.includes(n)), levels: Object.fromEntries(members.map(n => [n, c.namespaces.find(x => x.id === n).migrations.at(-1).version])) };
  }
  return {
    author, generated: true, format_version: c.format_version, schema_generation: c.schema_generation,
    checksum_algorithm: c.checksum_algorithm, generation_anchor: { ...c.generation_anchor, checksums },
    dialects, sql_roots: roots, ledger: { ...c.ledger, ddl: Object.fromEntries(dialects.map(d => [d, ledgerDDL(c.ledger, d)])) },
    namespaces: order.map(id => c.namespaces.find(n => n.id === id)), profiles
  };
}

const records = {
  Descriptor: { author: 'string', generated: 'bool', format_version: 'int', schema_generation: 'string', checksum_algorithm: 'string', generation_anchor: 'GenerationAnchor', dialects: '[]string', sql_roots: '[]string', ledger: 'Ledger', namespaces: '[]Namespace', profiles: 'map[string]Profile' },
  GenerationAnchor: { namespace: 'string', version: 'int', checksums: 'map[string]string' },
  Ledger: { table: 'string', columns: '[]LedgerColumn', primary_key: '[]string', applied_at_unit: 'string', ddl: 'map[string]string' },
  LedgerColumn: { name: 'string', type: 'string', length: 'int', nullable: 'bool' },
  Namespace: { id: 'string', depends_on: '[]string', migrations: '[]Migration' },
  Migration: { version: 'int', files: 'map[string]SQLFile' },
  SQLFile: { path: 'string', bytes: 'int', checksum: 'string' },
  Profile: { dialects: '[]string', namespaces: '[]string', order: '[]string', levels: 'map[string]int' }
};
const goName = key => key.split('_').map(p => p[0].toUpperCase() + p.slice(1)).join('');
function goValue(value, type) {
  if (type === 'string') return JSON.stringify(value ?? '');
  if (type === 'int') return String(value ?? 0);
  if (type === 'bool') return String(value ?? false);
  if (type.startsWith('[]')) return `${type}{${(value ?? []).map(v => goValue(v, type.slice(2))).join(',')}${value?.length ? ',' : ''}}`;
  if (type.startsWith('map[string]')) return `${type}{${sorted(Object.keys(value)).map(k => `${JSON.stringify(k)}:${goValue(value[k], type.slice(11))},`).join('')}}`;
  return `${type}{${Object.entries(records[type]).filter(([k]) => value[k] !== undefined).map(([k, t]) => `${goName(k)}:${goValue(value[k], t)},`).join('')}}`;
}
function goDescriptor(metadata) {
  const types = Object.entries(records).map(([name, fields]) => `type ${name} struct {\n${Object.entries(fields).map(([key, type]) => `${goName(key)} ${type} \`json:"${key}${key === 'length' ? ',omitempty' : ''}"\``).join('\n')}\n}`).join('\n\n');
  return execFileSync('gofmt', { input: `// Author: ${author}\n// Code generated by scripts/generate-migrations.mjs. DO NOT EDIT.\n// Data only: not imported by the legacy executor or CLI.\npackage catalogdata\n\n${types}\n\nvar Catalog = ${goValue(metadata, 'Descriptor')}\n`, encoding: 'utf8' });
}
export function generateMigrations(project = root, check = false) {
  project = resolve(project);
  const metadata = buildMetadata(project);
  const outputs = {
    'migrations/metadata.gen.json': JSON.stringify(metadata, null, 2) + '\n',
    'migrations/catalogdata/catalog.gen.go': goDescriptor(metadata)
  };
  for (const [path, content] of Object.entries(outputs)) {
    const full = join(project, path);
    for (let parent = dirname(full); parent !== project; parent = dirname(parent)) {
      const stat = lstatSync(parent, { throwIfNoEntry: false });
      if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) fail(`generated output parent link or special file ${path}`);
    }
    const stat = lstatSync(full, { throwIfNoEntry: false });
    if (stat && (stat.isSymbolicLink() || !stat.isFile())) fail(`generated output link or special file ${path}`);
    if (check) {
      if (!existsSync(full) || readFileSync(full, 'utf8') !== content) fail(`stale generated metadata: ${path}`);
    }
  }
  if (!check) for (const [path, content] of Object.entries(outputs)) {
    const full = join(project, path);
    mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, content);
  }
  return metadata;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(a => a !== '--check')) fail('Usage: node scripts/generate-migrations.mjs [--check]');
    const c = generateMigrations(root, args.includes('--check'));
    console.log(`PASS migration catalog, raw-byte SHA-256 and ${args.includes('--check') ? 'generated metadata check' : 'metadata generation'} (${c.namespaces.reduce((n, v) => n + v.migrations.length * dialects.length, 0)} SQL files)`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
