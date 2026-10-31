// Author: yunnuo <ymz@ebox.vip>
// Description: Wiki links preserve repository boundaries, anchors, images, external URLs and fenced examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateWiki, renderMarkdown, repositoryName, wikiLink } from './wiki.mjs';

test('Wiki link mapping preserves navigation and rejects escaping paths', () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'unicore-wiki-links-'));
  try {
    mkdirSync(join(sourceRoot, 'docs')); mkdirSync(join(sourceRoot, 'assets'));
    for (const file of ['README.md', 'docs/page.md', 'assets/logo.png']) writeFileSync(join(sourceRoot, file), 'fixture');
    const options = { sourceRoot, source: 'docs/page.md', repository: 'team/example', pages: new Map([['README.md', 'Getting-Started']]) };
    assert.equal(wikiLink('../README.md#安装', options), 'https://github.com/team/example/wiki/Getting-Started#安装');
    assert.equal(wikiLink('../assets/logo.png', { ...options, image: true }), 'https://raw.githubusercontent.com/team/example/main/assets/logo.png');
    assert.equal(wikiLink('../assets', options), 'https://github.com/team/example/tree/main/assets');
    assert.equal(wikiLink('https://example.test/doc?a=b#c', options), 'https://example.test/doc?a=b#c');
    assert.equal(wikiLink('#local', options), '#local');
    assert.throws(() => wikiLink('../../escape.md', options));
    assert.throws(() => wikiLink('/private.md', options));
    assert.throws(() => wikiLink('//other.example/path', options));
    assert.throws(() => wikiLink('missing.md', options));
    const code = '```md\n[example](missing.md)\n```';
    assert.equal(renderMarkdown(code, options), code);
    assert.equal(renderMarkdown('[start](../README.md)\n![logo](../assets/logo.png)', options), '[start](https://github.com/team/example/wiki/Getting-Started)\n![logo](https://raw.githubusercontent.com/team/example/main/assets/logo.png)');
  } finally { rmSync(sourceRoot, { recursive: true, force: true }); }
});
test('Wiki configuration renders all pages and validates target identity', () => {
  const pages = generateWiki({ check: true });
  assert(pages.has('Home.md')); assert(pages.has('_Sidebar.md')); assert(pages.has('_Footer.md'));
  assert.match(pages.get('Deployment.md'), /仓库源码/);
  assert.match(pages.get('_Sidebar.md'), /wiki\/Backup-Restore/);
  assert.equal(pages.size, 10);
  for (const name of ['Commercial-Audit.md', 'Acceptance-R0.md', 'AI-Context.md', 'Wiki-Maintenance.md']) assert(!pages.has(name));
  for (const content of pages.values()) assert.doesNotMatch(content, /docs\/04-ai|docs\/adr|Commercial-Audit|workspace-preservation/);
  for (const value of ['../repo', 'https://github.com/team/repo', 'team/repo.git', 'team/repo/extra']) assert.throws(() => repositoryName(value));
  assert.equal(repositoryName('team/my-app'), 'team/my-app');
});
