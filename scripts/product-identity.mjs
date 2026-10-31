// Author: yunnuo <ymz@ebox.vip>
// Description: product.identity.json is the single product identity source; validate it strictly and synchronize only declared projections.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

const PATTERNS = {
  text: /^[\p{L}\p{N}][\p{L}\p{N} ._<@>-]{1,79}$/u,
  // Free-form product/CLI descriptions: printable, no control characters.
  message: /^\P{C}{1,200}$/u,
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
  product: { name: 'name', slug: 'slug', vendor: 'slug?', description: 'message' },
  go: { module: 'module' },
  cli: { command: 'slug', opsCommand: 'slug', description: 'message' },
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

// Product-scope CI/CD secrets and compose inputs derive their prefix from the slug (my-product -> MY_PRODUCT).
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

// Replace one HTML string element or attribute; both must occur exactly once.
export function setHTMLString(text, pattern, value) {
  const matches = text.match(new RegExp(pattern, 'g')) ?? [];
  if (matches.length !== 1) throw new Error(`product identity HTML projection matched ${matches.length} occurrences of ${pattern}`);
  return text.replace(new RegExp(pattern), value);
}

const goQuote = value => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t').replaceAll('\r', '\\r');

export function identityGenGo(identity) {
  const rows = [
    ['ProductName', identity.product.name],
    ['ProductSlug', identity.product.slug],
    ['CLIRootCommand', identity.cli.command],
    ['CLIRootDescription', identity.cli.description],
    ['OpsCommandName', identity.cli.opsCommand],
    ['BundleID', identity.desktop.bundleId],
  ];
  const pad = Math.max(...rows.map(([name]) => name.length));
  const body = rows.map(([name, value]) => `\t${name.padEnd(pad)} = "${goQuote(value)}"`).join('\n');
  return `// Code generated by scripts/product-identity.mjs; DO NOT EDIT.\n// Author: yunnuo <ymz@ebox.vip>\n\npackage buildinfo\n\nconst (\n${body}\n)\n`;
}

export function productGenTs(identity) {
  return `// Code generated by scripts/product-identity.mjs; DO NOT EDIT.\n// Author: yunnuo <ymz@ebox.vip>\n\nexport const productName = ${JSON.stringify(identity.product.name)};\nexport const productDescription = ${JSON.stringify(identity.product.description)};\n`;
}

// Deployment launchers carry the product command name in their path; renames stay idempotent.
const deploymentRenames = identity => [
  ['deploy/tar/unicore', `deploy/tar/${identity.cli.command}`, [['unicore_dir', `${identity.product.slug}_dir`]]],
  ['deploy/tar/unicorehelp', `deploy/tar/${identity.cli.command}help`, [['unicore_dir', `${identity.product.slug}_dir`]]],
  ['deploy/tar/unicore.service', `deploy/tar/${identity.deployment.serviceName}.service`, [
    ['/etc/unicore/unicore.env', `/etc/${identity.product.slug}/${identity.product.slug}.env`],
    ['/var/lib/unicore', identity.deployment.dataDirectory],
    ['/opt/unicore', identity.deployment.installDirectory],
    ['User=unicore', `User=${identity.deployment.serviceUser}`],
    ['Group=unicore', `Group=${identity.deployment.serviceUser}`],
    ['Description=Unicore application server', `Description=${identity.product.name} application server`],
  ]],
];

// Token replacements are bounded: explicit tokens on an explicit file list, longest-first.
const tokenProjections = (identity, dir) => {
  const prefix = ciSecretPrefix(identity.product.slug);
  const docs = JSON.parse(readFileSync(`${dir}distribution/manifest.json`, 'utf8'))
    .documents.filter(document => document.audiences.includes('project-template')).map(document => document.target);
  const documentTokens = [
    ['unicore-ops', identity.cli.opsCommand],
    ['unicorehelp', `${identity.cli.command}help`],
    ['deploy/tar/unicore', `deploy/tar/${identity.cli.command}`],
    ['unicore.service', `${identity.deployment.serviceName}.service`],
    ['unicore-desktop', identity.desktop.outputName],
    ['build/bin/unicore', `build/bin/${identity.cli.command}`],
    ['unicore.json', `${identity.product.slug}.json`],
    ['unicore_data', identity.deployment.volume],
    ['/var/lib/unicore', identity.deployment.dataDirectory],
    ['/opt/unicore', identity.deployment.installDirectory],
    ['/etc/unicore', `/etc/${identity.product.slug}`],
    [/(?<![\w@.-])unicore(?![\w./-])/g, identity.cli.command],
  ];
  return [
    ['deploy/docker/compose.yaml', [
      ['UNICORE_IMAGE', `${prefix}_IMAGE`], ['UNICORE_VERSION', `${prefix}_VERSION`], ['UNICORE_COMMIT', `${prefix}_COMMIT`],
      ['UNICORE_BUILD_TIME', `${prefix}_BUILD_TIME`], ['UNICORE_PORT', `${prefix}_PORT`],
      ['unicore:local', `${identity.deployment.image}:local`], ['unicore_data', identity.deployment.volume],
    ]],
    ['deploy/docker/compose.dev.yaml', [['unicore', identity.product.slug]]],
    ['deploy/tar/nginx.conf.example', [['/opt/unicore', identity.deployment.installDirectory]]],
    ['deploy/docker/Dockerfile', [['org.opencontainers.image.title="Unicore"', `org.opencontainers.image.title="${identity.product.name}"`]]],
    ...docs.map(path => [path, documentTokens]),
  ];
};

const applyTokens = (text, tokens) => tokens.reduce((current, [from, to]) => current.replaceAll(from, to), text);
const bareToken = literal => new RegExp(`(?<![\\w@.-])${literal}(?![\\w./-])`, 'g');

// Apply every content projection (fields, generated sources, token maps) except deployment renames and consumer gates.
export function applyIdentityContent(base, identity, check) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const read = path => { try { return readFileSync(`${dir}${path}`, 'utf8'); } catch { return ''; } };
  const update = (path, next) => { if (next !== read(path)) { if (check) throw new Error(`${path} is stale; run pnpm product:generate`); writeFileSync(`${dir}${path}`, next); } };
  const field = (path, keys, value) => update(path, setJSONStringField(read(path), keys, value));
  field('assets/theme/tokens.json', ['brand', 'name'], identity.product.name);
  field('assets/theme/resolved.gen.json', ['brand', 'name'], identity.product.name);
  update('assets/brand/wordmark.svg', setHTMLString(read('assets/brand/wordmark.svg'), '(<text [^>]*>)[^<]*(<tspan)', `$1${identity.product.name}$2`));
  field('assets/brand/identity.json', ['bundleId'], identity.desktop.bundleId);
  field('cmd/desktop/wails.json', ['name'], identity.product.name);
  field('cmd/desktop/wails.json', ['outputfilename'], identity.desktop.outputName);
  field('cmd/desktop/wails.json', ['info', 'productName'], identity.product.name);
  field('cmd/desktop/wails.json', ['info', 'comments'], `${identity.product.name} · Go + React`);
  field('package.json', ['name'], identity.product.slug);
  field('packages/contracts/openapi.json', ['info', 'title'], `${identity.product.name} platform foundation API`);
  for (const app of ['apps/web', 'apps/desktop']) {
    const manifest = JSON.parse(read(`${app}/public/site.webmanifest`));
    manifest.name = identity.product.name;
    manifest.short_name = identity.product.name;
    update(`${app}/public/site.webmanifest`, JSON.stringify(manifest));
  }
  for (const [path, title, described] of [
    ['apps/web/index.html', `${identity.product.name} · 工作空间`, true],
    ['apps/web/admin.html', `${identity.product.name} · 管理后台`, true],
    ['apps/desktop/index.html', `${identity.product.name} · 桌面工作空间`, false],
  ]) {
    let html = setHTMLString(read(path), '<title>[^<]*</title>', `<title>${title}</title>`);
    if (described) html = setHTMLString(html, '(<meta name="description" content=")[^"]*(")', `$1${identity.product.name} · ${identity.product.description}$2`);
    update(path, html);
  }
  for (const [path, content] of [['internal/buildinfo/identity.gen.go', identityGenGo(identity)], ['packages/web-ui/src/product.gen.ts', productGenTs(identity)]]) {
    mkdirSync(dirname(`${dir}${path}`), { recursive: true });
    update(path, content);
  }
  for (const [path, tokens] of tokenProjections(identity, dir)) update(path, applyTokens(read(path), tokens));
}

export function applyIdentity(base, identity, check) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const read = path => { try { return readFileSync(`${dir}${path}`, 'utf8'); } catch { return ''; } };
  const update = (path, next) => { if (next !== read(path)) { if (check) throw new Error(`${path} is stale; run pnpm product:generate`); writeFileSync(`${dir}${path}`, next); } };
  applyIdentityContent(base, identity, check);
  for (const [from, to, tokens] of deploymentRenames(identity)) {
    const current = existsSync(`${dir}${to}`) || !existsSync(`${dir}${from}`) ? read(to) : read(from);
    const next = applyTokens(current, tokens);
    if (from !== to && existsSync(`${dir}${from}`)) {
      if (check) throw new Error(`${from} must be renamed to ${to}; run pnpm product:generate`);
      writeFileSync(`${dir}${to}`, next);
      rmSync(`${dir}${from}`);
    } else update(to, next);
  }
  const module = read('go.mod').match(/^module (.+)$/m)[1].trim();
  if (module !== identity.go.module) throw new Error(`go.mod module ${module} differs from product.identity.json; update them together`);
  if (!read('Makefile').includes('-X $(GO_MODULE)/internal/buildinfo.Version=')) throw new Error('Makefile LDFLAGS must inject versions through $(GO_MODULE); hardcoded module paths defeat the identity source');
}

// Upstream merge support: map product-named files and values back to the framework template naming.
export function reverseRenames(frameworkIdentity, productIdentity) {
  const frameworkSide = deploymentRenames(frameworkIdentity);
  return deploymentRenames(productIdentity)
    .map(([from, to, tokens], index) => ({
      from: to,
      to: from,
      tokens: tokens.map(([fwLiteral, productValue], position) => [productValue, frameworkSide[index][2][position][1]]),
    }))
    .filter(pair => pair.from !== pair.to);
}

export function reverseTokenMaps(frameworkIdentity, productIdentity, dir) {
  const normalized = dir.endsWith('/') ? dir : `${dir}/`;
  const productSide = tokenProjections(productIdentity, normalized);
  const frameworkSide = tokenProjections(frameworkIdentity, normalized);
  return productSide.map(([path, pairs], index) => [
    path,
    pairs
      .map(([fwLiteral, productValue], position) => [fwLiteral instanceof RegExp ? bareToken(productValue) : productValue, frameworkSide[index][1][position][1]])
      .filter(([from, to]) => from !== to),
  ]);
}

export { applyTokens };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const check = process.argv.includes('--check');
    applyIdentity(root, loadIdentity(root), check);
    console.log(`${check ? 'PASS' : 'Synchronized'} product identity projections`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
