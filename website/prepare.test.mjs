// Author: yunnuo <ymz@ebox.vip>
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { pageLink, pagePath, prepareSite, rewriteMarkdown, siteDocuments } from './prepare.mjs';
import { inventory } from '../scripts/distribution.mjs';
import { publicNavigation } from './navigation.mjs';

function fixture(run) {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'unicore-docs-site-'));
  const put = (path, body) => { mkdirSync(join(sourceRoot, path, '..'), { recursive: true }); writeFileSync(join(sourceRoot, path), body); };
  const config = {
    format_version: 1,
    documents: [
      { source: 'docs/product/index.md', target: 'docs/product/index.md', title: 'Guide', slug: 'Home', audiences: ['public-wiki', 'public-site'] },
      { source: 'docs/product/configuration.md', target: 'docs/product/configuration.md', title: 'Configuration', audiences: ['public-site'] },
    ],
    template_files: [],
    site_assets: [{ source: 'assets/brand/mark.svg', target: 'brand/mark.svg' }],
  };
  put('docs/product/index.md', '<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Guide\n\n[Configuration](configuration.md#database)\n[Source](../../README.md#start)\n![Logo](../../assets/brand/mark.svg)\n');
  put('docs/product/configuration.md', '# Configuration\n\n## Database\n');
  put('README.md', '# Source\n');
  put('assets/brand/mark.svg', '<svg />');
  put('docs/04-ai/private.md', 'must not be copied');
  const save = () => put('distribution/manifest.json', JSON.stringify(config));
  save();
  try { run({ sourceRoot, config, put, save }); } finally { rmSync(sourceRoot, { recursive: true, force: true }); }
}

test('publishes only selected pages/assets and rewrites internal, source and fragment links', () => fixture(({ sourceRoot }) => {
  const output = prepareSite({ sourceRoot, ref: 'release/docs' });
  assert.deepEqual(inventory(join(sourceRoot, 'build/docs-site')), ['product/configuration.md', 'product/index.md', 'public/CNAME', 'public/brand/mark.svg', 'public/robots.txt']);
  const home = output.get('product/index.md');
  assert.match(home, /sourcePath: "docs\/product\/index.md"/);
  assert.match(home, /editURL: "https:\/\/github.com\/yunnuo88520\/Unicore\/edit\/release%2Fdocs\/docs\/product\/index.md"/);
  assert.match(home, /\[Configuration\]\(\/product\/configuration#database\)/);
  assert.match(home, /https:\/\/github.com\/yunnuo88520\/Unicore\/blob\/release%2Fdocs\/README.md#start/);
  assert.match(home, /!\[Logo\]\(\/brand\/mark.svg\)/);
  assert.equal(readFileSync(join(sourceRoot, 'build/docs-site/public/CNAME'), 'utf8'), 'unicore.ebox.vip\n');
}));

test('index routes retain directory structure without truncating other filenames', () => {
  assert.equal(pageLink({ target: 'docs/index.md' }), '/');
  assert.equal(pageLink({ target: 'docs/product/index.md' }), '/product/');
  assert.equal(pageLink({ target: 'docs/reference/module-index.md' }), '/reference/module-index');
});

test('canonical public references remain local in a preview, without rewriting other hosts', () => fixture(({ sourceRoot, put }) => {
  put('docs/product/index.md', '[Reference](https://unicore.ebox.vip/product/configuration#database)\n[Other](https://example.com/product/configuration)\n');
  const page = prepareSite({ sourceRoot, write: false }).get('product/index.md');
  assert.match(page, /\[Reference\]\(\/product\/configuration#database\)/);
  assert.match(page, /\[Other\]\(https:\/\/example.com\/product\/configuration\)/);
}));

test('examples remain unchanged while prose links are transformed', () => {
  const input = '[Link](guide.md)\n\n```md\n[Example](private.md)\n```\n\n`[inline](private.md)`\n';
  assert.equal(rewriteMarkdown(input, value => '/public/' + value), input.replace('[Link](guide.md)', '[Link](/public/guide.md)'));
});

test('check mode validates without writing and removed pages disappear on regeneration', () => fixture(({ sourceRoot, config, save }) => {
  prepareSite({ sourceRoot });
  config.documents.pop(); save();
  // The old link must be removed too; a missing target may not silently survive regeneration.
  writeFileSync(join(sourceRoot, 'docs/product/index.md'), '# Guide\n');
  prepareSite({ sourceRoot, write: false });
  assert(inventory(join(sourceRoot, 'build/docs-site')).includes('product/configuration.md'));
  prepareSite({ sourceRoot });
  assert(!inventory(join(sourceRoot, 'build/docs-site')).includes('product/configuration.md'));
}));

test('rejects missing references, unsafe URLs, private audiences and symlink inputs', () => fixture(({ sourceRoot, config, put, save }) => {
  put('docs/product/index.md', '[Broken](missing.md)');
  assert.throws(() => prepareSite({ sourceRoot, write: false }), /ENOENT/);
  put('docs/product/index.md', '[Unsafe](javascript:alert)');
  assert.throws(() => prepareSite({ sourceRoot, write: false }), /Unsafe site link/);
  config.documents.push({ source: 'docs/04-ai/private.md', target: 'docs/private.md', title: 'Private', audiences: ['public-site'] }); save();
  assert.throws(() => prepareSite({ sourceRoot, write: false }), /Internal documentation/);
  config.documents.pop(); save();
  rmSync(join(sourceRoot, 'docs/product/index.md'));
  symlinkSync(join(sourceRoot, 'README.md'), join(sourceRoot, 'docs/product/index.md'));
  assert.throws(() => prepareSite({ sourceRoot, write: false }), /links are forbidden/);
}));

test('preserves home frontmatter and disallows non-image public assets', () => fixture(({ sourceRoot, config, put, save }) => {
  put('docs/product/index.md', '---\nlayout: home\n---\n<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Home\n');
  assert.match(prepareSite({ sourceRoot, write: false }).get('product/index.md'), /^---\nsourcePath: .*\neditURL: .*\nlayout: home\n---\n# Home/);
  config.site_assets.push({ source: 'README.md', target: 'readme.md' }); save();
  assert.throws(() => prepareSite({ sourceRoot, write: false }), /Invalid site asset/);
}));


test('public pages have task-specific sidebars and all section entries resolve', () => {
  const documents = siteDocuments();
  const { nav, sidebar } = publicNavigation(documents);
  const links = new Set(documents.map(pageLink));
  const groups = new Map(documents.map(doc => [pageLink(doc), doc.site_group]));
  const routes = new Map(documents.map(doc => ['/' + pagePath(doc), pageLink(doc)]));
  for (const section of nav) {
    assert(links.has(section.link), section.link);
    assert(sidebar[[...routes].find(([, route]) => route === section.link)[0]]);
  }
  for (const [sourcePath, sections] of Object.entries(sidebar)) {
    const route = routes.get(sourcePath);
    assert(route, sourcePath);
    // VitePress chooses by prefix, so each real source path must match exactly
    // one key. A /product/ catch-all would hide section-specific sidebars.
    assert.equal(Object.keys(sidebar).filter(key => sourcePath.startsWith(key)).length, 1, sourcePath);
    const siblings = sections.flatMap(section => section.items);
    assert(siblings.some(item => item.link === route), route);
    assert.equal(nav.filter(item => new RegExp(item.activeMatch).test(route)).length, 1, route);
    for (const item of siblings) assert(links.has(item.link), item.link);
  }
  // Deployment readers should not have to navigate framework implementation rules.
  assert(sidebar['/product/deployment.md'].flatMap(group => group.items).every(item => ['deploy', 'operate'].includes(groups.get(item.link))));
  assert(sidebar['/product/development.md'].flatMap(group => group.items).some(item => item.link === '/product/features'));
  const { site_group, ...orphan } = documents.find(doc => doc.source === 'docs/product/development.md');
  assert.throws(() => publicNavigation(documents.map(doc => doc.source === orphan.source ? orphan : doc)), /Missing public navigation group/);
});

test('maintainer and agent documents are absent from actual site output', () => {
  const output = prepareSite({ write: false });
  for (const name of ['deployment', 'storage', 'backup', 'updates', 'framework-upgrade', 'documentation-site']) {
    assert(!output.has(`03-runbooks/${name}.md`), name);
  }
  assert(!output.has('02-standards/coding.md'));
  assert([...output.keys()].every(path => !/(?:^|\/)(?:04-ai|adr|00-product)(?:\/|$)/.test(path)));
});
