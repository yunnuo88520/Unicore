// Author: yunnuo <ymz@ebox.vip>
// Description: Reverse tests prove nested design violations cannot evade source discovery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkDesign, checkDesignSources, designSources } from './check-design.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'unicore-design-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };
  put('packages/theme/src/tokens.gen.css', ':root { --surface: white; --primary: blue; --chart-1: purple; }');
  return { root, put };
}

test('accepts nested declarations and recursive token use in every shared source root', t => {
  const { root, put } = fixture(t);
  put('packages/theme/src/nested/roles.css', ':root { --surface-hover: var(--surface); }');
  for (const name of ['ui', 'form', 'web-ui']) put(`packages/${name}/src/nested/deeper/view.tsx`, '<div style={{ color: "var( --primary)", background: "var(--surface-hover)" }} />');
  assert.equal(checkDesignSources(root), 5);
  assert.equal(designSources(root).length, 5);
});

for (const extension of ['tsx', 'ts', 'jsx', 'css']) test(`rejects undefined tokens in deeply nested ${extension}`, t => {
  const { root, put } = fixture(t);
  put(`packages/ui/src/a/b/view.${extension}`, 'var( --not-defined)');
  assert.throws(() => checkDesignSources(root), /a\/b\/view\..*: undefined design token --not-defined/);
});

for (const literal of ['#abc', '#123456', '#12345678', 'rgb(1 2 3)', 'rgba(1,2,3,.2)', 'hsl(30 50% 50%)', 'oklch(0.5 0.1 20)']) test(`rejects nested raw palette ${literal}`, t => {
  const { root, put } = fixture(t);
  put('packages/form/src/nested/view.tsx', `<div style={{ color: '${literal}' }} />`);
  assert.throws(() => checkDesignSources(root), /move raw palette colors/);
});

test('rejects emoji in nested source', t => {
  const { root, put } = fixture(t);
  put('packages/web-ui/src/nested/icon.tsx', '<span>\u{1f680}</span>');
  assert.throws(() => checkDesignSources(root), /use Lucide\/SVG icons/);
});

test('allows raw generated palettes, runtime Radix variables, dynamic presets and test fixtures', t => {
  const { root, put } = fixture(t);
  put('packages/theme/src/nested/palette.gen.css', ':root { --extra: #ffffff; }');
  put('packages/ui/src/nested/view.tsx', 'var(--radix-popover-content-available-height) var(--preset-${id}) var(--chart-1, var(--primary))');
  put('packages/ui/src/nested/view.test.tsx', '#ffffff var(--fixture-only) \u{1f680}');
  assert.doesNotThrow(() => checkDesignSources(root));
});

test('ignores source symlinks and dependencies instead of traversing outside its boundary', t => {
  const { root, put } = fixture(t);
  put('outside/bad.tsx', '#ffffff');
  put('packages/ui/src/node_modules/vendor/bad.tsx', '#ffffff');
  symlinkSync(join(root, 'outside'), join(root, 'packages/ui/src/linked'));
  assert.doesNotThrow(() => checkDesignSources(root));
});

test('brand check still rejects a desynchronized desktop icon', t => {
  const { root, put } = fixture(t);
  for (const [source, target] of [['mark.svg', 'favicon.svg'], ['favicon.ico', 'favicon.ico'], ['icon-180.png', 'apple-touch-icon.png'], ['icon-192.png', 'icon-192.png'], ['icon-512.png', 'icon-512.png']]) {
    put(`assets/brand/${source}`, 'same');
    for (const app of ['web', 'desktop']) put(`apps/${app}/public/${target}`, 'same');
  }
  assert.doesNotThrow(() => checkDesign(root));
  put('apps/desktop/public/icon-192.png', 'changed');
  assert.throws(() => checkDesign(root), /desktop\/icon-192.png is stale/);
});
