// Author: yunnuo <ymz@ebox.vip>
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { pageLink, prepareSite, rewriteMarkdown } from './prepare.mjs';
import { inventory } from '../scripts/distribution.mjs';

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
