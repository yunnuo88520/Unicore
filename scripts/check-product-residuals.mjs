// Author: yunnuo <ymz@ebox.vip>
// Description: Fail a derived project whose product-visible surfaces still carry the framework identity; skip non-derived checkouts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

// Explicit whitelist: framework authorship, internal package naming, mechanism names and upstream attribution stay.
const ALLOWED = [
  /Author: yunnuo/, /ymz@ebox\.vip/, /yunnuo88520/,
  /@[uU]nicore\//, /x-unicore/i, /__UNICORE_[A-Z_]+__/,
  /\bUNICORE_[A-Z_]+\b/,
  /unicore(_administrator)?_session/, /cid:unicore-brand/, /unicore\.db/,
  /unicore\.preferences\.v1/, /unicore\.theme/, /unicore:preferences/, /unicore\.session\.changed/,
  /基于 Unicore/, /built with Unicore/i,
];

function violationsFor(path, text, framework, module) {
  const violations = [];
  text.split('\n').forEach((line, index) => {
    // Product documentation must explain the stable SQL namespace. Remove only
    // those technical tokens, so an unrelated visible brand on the same line is
    // still reported. UI strings do not receive this documentation exemption.
    const technical = module ? line.replaceAll(module, '') : line;
    const visible = path.startsWith('docs/')
      ? technical.replace(/\bunicore_(?:[a-z][a-z0-9_]*)?\b/g, '')
      : technical;
    if (!new RegExp(framework, 'i').test(visible)) return;
    if (ALLOWED.some(pattern => pattern.test(line))) return;
    violations.push(`${path}:${index + 1}: ${line.trim().slice(0, 160)}`);
  });
  return violations;
}

// Returns the list of residue violations; empty means the product surfaces are clean.
export function scanResiduals(base = root) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const read = path => readFileSync(`${dir}${path}`, 'utf8');
  const provenance = JSON.parse(read('project.provenance.json'));
  const framework = provenance.framework;
  if (!framework || !/^[a-zA-Z][a-zA-Z0-9 ._-]{1,39}$/.test(framework)) throw new Error('project.provenance.json must name the upstream framework');
  const identity = JSON.parse(read('product.identity.json'));
  const violations = [];
  const required = [
    'README.md', 'README.en.md', 'package.json', 'Makefile', 'product.identity.json', 'go.mod',
    'internal/buildinfo/identity.gen.go', 'packages/web-ui/src/product.gen.ts',
    'assets/theme/resolved.gen.json', 'assets/brand/wordmark.svg',
    'apps/web/index.html', 'apps/web/admin.html', 'apps/desktop/index.html',
    'apps/web/public/site.webmanifest', 'apps/desktop/public/site.webmanifest',
    'cmd/desktop/wails.json', 'packages/contracts/openapi.json',
    `deploy/tar/${identity.deployment.serviceName}.service`,
    'deploy/tar/nginx.conf.example', 'deploy/docker/compose.yaml', 'deploy/docker/compose.dev.yaml', 'deploy/docker/Dockerfile',
  ];
  for (const path of required) {
    if (!existsSync(`${dir}${path}`)) { violations.push(`${path}: missing product-visible file`); continue; }
    violations.push(...violationsFor(path, read(path), framework, identity.go?.module));
  }
  for (const document of JSON.parse(read('distribution/manifest.json')).documents.filter(entry => entry.audiences.includes('project-template'))) {
    if (!existsSync(`${dir}${document.target}`)) { violations.push(`${document.target}: missing template document`); continue; }
    violations.push(...violationsFor(document.target, read(document.target), framework, identity.go?.module));
  }
  // UI rewrites can introduce visible literals without changing generated HTML or identity files.
  const manifest = JSON.parse(read('distribution/manifest.json'));
  for (const entry of manifest.template_files ?? []) {
    const path = typeof entry === 'string' ? entry : entry.target;
    if (path !== 'cmd/server/commands.go' && (!/^(?:packages\/(?:web-ui|ui|form|theme)\/src\/)/.test(path) || !/\.(?:tsx?|mjs|json)$/.test(path) || /(?:\.test\.|\.gen\.)/.test(path))) continue;
    if (!existsSync(`${dir}${path}`)) { violations.push(`${path}: missing product UI source`); continue; }
    violations.push(...violationsFor(path, read(path), framework, identity.go?.module));
  }
  for (const entry of readdirSync(`${dir}deploy/tar`)) if (new RegExp(framework, 'i').test(entry)) violations.push(`deploy/tar/${entry}: deployment file name still carries the framework identity`);
  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!existsSync(`${root}project.provenance.json`)) { console.log('SKIP product residue scan (framework checkout, not a derived project)'); process.exitCode = 0; }
    else {
      const violations = scanResiduals(root);
      if (violations.length) { console.error(`Product identity residue found:\n${violations.join('\n')}`); process.exitCode = 1; }
      else console.log('PASS product-visible surfaces carry no framework identity');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
