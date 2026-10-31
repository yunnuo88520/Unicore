// Author: yunnuo <ymz@ebox.vip>
// Description: product.identity.json is the single product identity source; validate it strictly and synchronize only declared projections.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

const PATTERNS = {
  text: /^[\p{L}\p{N}][\p{L}\p{N} ._<@>-]{1,79}$/u,
  name: /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,39}$/u,
  slug: /^[a-z][a-z0-9-]{1,62}$/,
  module: /^[a-zA-Z0-9][a-zA-Z0-9.-]+\/[a-zA-Z0-9_./-]+$/,
  bundle: /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/,
  image: /^[a-z0-9][a-z0-9._/-]{1,127}$/,
  volume: /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/,
  // Absolute, at least two safe segments; '..' and '.' segments are rejected below.
  directory: /^\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/,
};
const SCHEMA = {
  author: 'text',
  schemaVersion: 'literal',
  product: { name: 'name', slug: 'slug', vendor: 'slug?' },
  go: { module: 'module' },
  cli: { command: 'slug', opsCommand: 'slug' },
  desktop: { bundleId: 'bundle', outputName: 'slug' },
  deployment: {
    serviceName: 'slug', serviceUser: 'slug',
    installDirectory: 'directory', dataDirectory: 'directory',
    image: 'image', volume: 'volume',
  },
  release: { artifactPrefix: 'slug' },
};

function collectErrors(schema, value, trail) {
  const errors = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${trail} must be an object`];
  for (const key of Object.keys(value)) if (!(key in schema)) errors.push(`${trail}${key} is not part of the product identity schema; deployment endpoints and domains are runtime configuration, never identity`);
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in value)) { if (typeof type === 'string' && !type.endsWith('?')) errors.push(`${trail}${key} is required`); continue; }
    if (typeof type === 'object') { errors.push(...collectErrors(type, value[key], `${trail}${key}.`)); continue; }
    const child = value[key], base = type.replace('?', '');
    if (base === 'literal') { if (child !== 1) errors.push(`${trail}${key} must be 1`); continue; }
    if (typeof child !== 'string' || !PATTERNS[base].test(child)) errors.push(`${trail}${key} is invalid: ${JSON.stringify(child)}`);
    else if ((base === 'module' || base === 'directory') && child.split('/').includes('..')) errors.push(`${trail}${key} must not traverse paths`);
  }
  return errors;
}

export function validateIdentity(raw, origin = 'product.identity.json') {
  const errors = collectErrors(SCHEMA, raw, `${origin}: `);
  if (errors.length) throw new Error(errors.join('; '));
  return raw;
}

export function loadIdentity(base = root) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  return validateIdentity(JSON.parse(readFileSync(`${dir}product.identity.json`, 'utf8')));
}

// Product-scope CI/CD secrets derive their prefix from the slug (my-product -> MY_PRODUCT).
export function ciSecretPrefix(slug) {
  const prefix = slug.toUpperCase().replaceAll('-', '_');
  if (!/^[A-Z][A-Z0-9_]*$/.test(prefix)) throw new Error(`slug ${slug} cannot derive a CI secret prefix`);
  return prefix;
}

// Rewrite exactly one string field inside consistently indented JSON, leaving every other byte untouched.
export function setJSONStringField(text, path, value) {
  const lines = text.split('\n');
  let from = 0, to = lines.length, indent = 2;
  for (const key of path.slice(0, -1)) {
    const open = new RegExp(`^ {${indent}}"${key}"\\s*:\\s*\\{$`);
    const close = new RegExp(`^ {${indent}}\\},?$`);
    const starts = [];
    for (let i = from; i < to; i++) if (open.test(lines[i])) starts.push(i);
    if (starts.length !== 1) throw new Error(`product identity field ${path.join('.')}: object "${key}" matched ${starts.length} declarations`);
    let end = -1;
    for (let i = starts[0] + 1; i < to; i++) if (close.test(lines[i])) { end = i; break; }
    if (end < 0) throw new Error(`product identity field ${path.join('.')}: object "${key}" is not closed`);
    from = starts[0] + 1; to = end; indent += 2;
  }
  const field = new RegExp(`^( {${indent}}"${path.at(-1)}"\\s*:\\s*")[^"]*(",?)$`);
  const hits = [];
  for (let i = from; i < to; i++) if (field.test(lines[i])) hits.push(i);
  if (hits.length !== 1) throw new Error(`product identity field ${path.join('.')}: matched ${hits.length} lines; keep one canonical string field`);
  lines[hits[0]] = lines[hits[0]].replace(field, `$1${value}$2`);
  return lines.join('\n');
}

export function identityGenGo(identity) {
  const rows = [
    ['ProductName', identity.product.name],
    ['ProductSlug', identity.product.slug],
    ['CLIRootCommand', identity.cli.command],
    ['OpsCommandName', identity.cli.opsCommand],
    ['BundleID', identity.desktop.bundleId],
  ];
  const body = rows.map(([name, value]) => `\t${name.padEnd(14)} = ${JSON.stringify(value)}`).join('\n');
  return `// Code generated by scripts/product-identity.mjs; DO NOT EDIT.\n// Author: yunnuo <ymz@ebox.vip>\n\npackage buildinfo\n\nconst (\n${body}\n)\n`;
}

// Synchronize the declared projections; mixed files only ever change identity fields.
export function applyIdentity(base, identity, check) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const read = path => { try { return readFileSync(`${dir}${path}`, 'utf8'); } catch { return ''; } };
  const update = (path, next) => { if (next !== read(path)) { if (check) throw new Error(`${path} is stale; run pnpm product:generate`); writeFileSync(`${dir}${path}`, next); } };
  const field = (path, keys, value) => update(path, setJSONStringField(read(path), keys, value));
  field('assets/theme/tokens.json', ['brand', 'name'], identity.product.name);
  field('assets/brand/identity.json', ['bundleId'], identity.desktop.bundleId);
  field('cmd/desktop/wails.json', ['name'], identity.product.name);
  field('cmd/desktop/wails.json', ['outputfilename'], identity.desktop.outputName);
  field('cmd/desktop/wails.json', ['info', 'productName'], identity.product.name);
  update('internal/buildinfo/identity.gen.go', identityGenGo(identity));
  const module = read('go.mod').match(/^module (.+)$/m)[1].trim();
  if (module !== identity.go.module) throw new Error(`go.mod module ${module} differs from product.identity.json; update them together`);
  if (!read('Makefile').includes('-X $(GO_MODULE)/internal/buildinfo.Version=')) throw new Error('Makefile LDFLAGS must inject versions through $(GO_MODULE); hardcoded module paths defeat the identity source');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const check = process.argv.includes('--check');
    applyIdentity(root, loadIdentity(root), check);
    console.log(`${check ? 'PASS' : 'Synchronized'} product identity projections`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
