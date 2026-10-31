// Author: yunnuo <ymz@ebox.vip>
// Description: Materialize real whitelist outputs and reject leaks, broken closure, traversal, links and stale Wiki pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { copyDistribution, inventory, readDistribution } from './distribution.mjs';
import { generateWiki } from './wiki.mjs';

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'unicore-distribution-'));
  const root = join(directory, 'source'); mkdirSync(root);
  const put = (path, text) => {mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), text);};
  const config = {format_version: 1, documents: [{source: 'docs/public/start.md', target: 'docs/public/start.md', audiences: ['user-release', 'project-template', 'public-wiki'], slug: 'Home', title: 'Guide'}], template_files: ['LICENSE', 'VERSION']};
  const save = () => put('distribution/manifest.json', JSON.stringify(config));
  put('LICENSE', 'MIT'); put('VERSION', '0.1.1\n'); put('docs/public/start.md', '# Start\n'); save();
  try {run({root, directory, put, config, save});} finally {rmSync(directory, {recursive: true, force: true});}
}
test('tracked and untracked research never expand any actual output whitelist', () => fixture(({root, directory, put}) => {
  put('docs/04-ai/documentation-productization-audit.md', 'private audit sentinel');
  put('docs/maintainer/new-research.md', 'future tracked research');
  put('unknown.txt', 'not selected');
  // A fixture repository only: the real workspace index is never touched.
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '--', 'docs/maintainer/new-research.md']);
  for (const audience of ['user-release', 'project-template']) {
    const output = join(directory, audience);
    copyDistribution(root, output, audience);
    assert.deepEqual(inventory(output), audience === 'user-release' ? ['LICENSE', 'docs/public/start.md'] : ['LICENSE', 'VERSION', 'docs/public/start.md']);
    assert(!existsSync(join(output, 'docs/04-ai')));
  }
  const output = join(directory, 'wiki'); generateWiki({sourceRoot: root, output});
  assert.deepEqual(inventory(output), ['Home.md', '_Footer.md', '_Sidebar.md']);
  assert(!readFileSync(join(output, 'Home.md'), 'utf8').includes('sentinel'));
}));
for (const target of ['../04-ai/missing.md', '../04-ai/%61cceptance-r0.md', 'https://github.com/team/repo/blob/main/docs/04-ai/audit.md', 'https://github.com/team/repo/tree/main/docs', 'https://github.com/team/repo/wiki/Release', '/private.md', '//other.example/file', 'javascript:alert']) {
  test(`public output rejects cross-link ${target}`, () => fixture(({root, directory, put}) => {
    put('docs/public/start.md', `[leak](${target})`);
    assert.throws(() => copyDistribution(root, join(directory, 'release'), 'user-release'), /link|whitelist/i);
    assert.throws(() => generateWiki({sourceRoot: root, output: join(directory, 'wiki')}), /link|whitelist/i);
    assert(!existsSync(join(directory, 'release')));
  }));
}
for (const text of ['[leak][ref]\n\n[ref]: ../04-ai/audit.md', '<a href="../04-ai/audit.md">leak</a>', '<img src="../04-ai/private.png">']) {
  test('unsupported reference/HTML links cannot bypass public closure', () => fixture(({root, directory, put}) => {
    put('docs/public/start.md', text);
    assert.throws(() => generateWiki({sourceRoot: root, output: join(directory, 'wiki')}), /syntax/);
  }));
}
for (const text of ['https://github.com/team/repo/blob/main/docs/maintainer/strategy.md', '<https://raw.githubusercontent.com/team/repo/main/docs/04-ai/audit.md>']) {
  test('bare URLs and autolinks cannot reintroduce internal source chains', () => fixture(({root, directory, put}) => {
    put('docs/public/start.md', text);
    assert.throws(() => generateWiki({sourceRoot: root, output: join(directory, 'wiki')}), /Non-public/);
  }));
}
test('internal config entries, duplicate targets, traversal and source/output links fail closed', () => fixture(({root, directory, put, config, save}) => {
  config.template_files.push('docs/04-ai/evidence/test.json'); save(); assert.throws(() => readDistribution(root), /Forbidden/);
  config.template_files.pop(); config.documents[0].target = '../outside.md'; save(); assert.throws(() => readDistribution(root), /Unsafe/);
  config.documents[0].target = 'docs/public/start.md'; config.template_files.push('LICENSE'); save();
  assert.throws(() => copyDistribution(root, join(directory, 'duplicate'), 'project-template'), /Duplicate/);
  config.template_files.pop(); save();
  config.template_files.push({source: '.env', target: 'renamed-config.json'}); save();
  assert.throws(() => readDistribution(root), /Forbidden/);
  config.template_files.pop(); save();
  rmSync(join(root, 'docs/public/start.md')); symlinkSync(join(root, 'LICENSE'), join(root, 'docs/public/start.md'));
  assert.throws(() => copyDistribution(root, join(directory, 'link'), 'user-release'), /links/);
  rmSync(join(root, 'docs/public/start.md')); put('docs/public/start.md', '# Start');
  const outside = join(directory, 'outside'); mkdirSync(outside); symlinkSync(outside, join(directory, 'linked-output'));
  assert.throws(() => copyDistribution(root, join(directory, 'linked-output'), 'user-release'), /link/);
  assert.deepEqual(inventory(outside), []);
}));
test('stale Wiki files are refused rather than silently carried into a public candidate', () => fixture(({root, directory}) => {
  const output = join(directory, 'wiki'); mkdirSync(output); writeFileSync(join(output, 'Commercial-Audit.md'), 'do not overwrite');
  assert.throws(() => generateWiki({sourceRoot: root, output}), /non-whitelisted/);
  assert.equal(readFileSync(join(output, 'Commercial-Audit.md'), 'utf8'), 'do not overwrite');
}));
test('reused release/template output cannot silently retain internal documents', () => fixture(({root, directory}) => {
  const output = join(directory, 'output'); mkdirSync(join(output, 'docs/04-ai'), {recursive: true});
  writeFileSync(join(output, 'docs/04-ai/audit.md'), 'preserve existing file');
  assert.throws(() => copyDistribution(root, output, 'user-release'), /non-whitelisted/);
  assert.throws(() => copyDistribution(root, output, 'project-template'), /empty/);
  assert.equal(readFileSync(join(output, 'docs/04-ai/audit.md'), 'utf8'), 'preserve existing file');
}));
