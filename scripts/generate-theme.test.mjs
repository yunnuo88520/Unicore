// Author: yunnuo <ymz@ebox.vip>
// Description: Source-schema, generation, scaling and downstream theme compatibility regressions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compile } from 'tailwindcss';
import { compileTheme, validateThemeSource, typographyRoles } from './generate-theme.mjs';
const source = JSON.parse(readFileSync(new URL('../assets/theme/tokens.json', import.meta.url), 'utf8'));
const candidate = () => structuredClone(source);

test('valid source compiles deterministic artifacts and flat Go mode maps', () => {
  assert.equal(validateThemeSource(source), source);
  const files = compileTheme(source);
  assert.deepEqual(compileTheme(source), files);
  for (const [path, content] of Object.entries(files)) assert.equal(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), content, `${path} must be generated`);
  const resolved = JSON.parse(files['assets/theme/resolved.gen.json']);
  assert.equal(resolved.brand.accent, '#6662ec');
  for (const mode of ['light', 'dark']) {
    assert.ok(Object.values(resolved[mode]).every(value => typeof value === 'string'));
    for (let i = 1; i <= 8; i++) assert.match(resolved[mode][`chart-${i}`], /^#[0-9a-f]{6}$/i);
  }
});

test('role sizes and radius/spacing tokens honor source and device scales', () => {
  const input = candidate();
  input.typography.scale = 1.25;
  input.shape.scale = 1.5;
  input.spacing.scale = 0.9;
  const css = compileTheme(input)['packages/theme/src/tokens.gen.css'];
  assert.ok(css.includes('--font-13: calc(16.25px * var(--ui-font-scale, 1));'));
  assert.ok(css.includes('--radius-8: calc(12px * var(--ui-radius-scale, 1));'));
  assert.ok(css.includes('--space-unit: calc(1px * 0.9 * var(--ui-space-scale, 1));'));
  for (const role of typographyRoles) assert.ok(css.includes(`--type-${role}-size: var(--font-${input.typography.roles[role].size});`));
});

const invalid = [
  ['null source', () => null],
  ['array modes', s => { s.modes = []; }],
  ['missing mode', s => { delete s.modes.dark; }],
  ['unknown source property', s => { s.extra = true; }],
  ['nested mode value', s => { s.modes.light.surface = { color: '#ffffff' }; }],
  ['unknown mode key', s => { s.modes.light.extra = '#ffffff'; }],
  ['missing chart color', s => { delete s.modes.dark['chart-8']; }],
  ['duplicate chart colors', s => { s.modes.dark['chart-8'] = s.modes.dark['chart-1']; }],
  ['shorthand color', s => { s.brand.accent = '#fff'; }],
  ['CSS color injection', s => { s.modes.light.bg = '#ffffff; color:red'; }],
  ['reserved preset', s => { s.presets.brand = '#ffffff'; }],
  ['preset selector injection', s => { s.presets['red]'] = '#ffffff'; }],
  ['font injection', s => { s.typography.sans = 'sans-serif; color:red'; }],
  ['nonfinite scale', s => { s.typography.scale = Infinity; }],
  ['negative scale', s => { s.spacing.scale = -1; }],
  ['string scale', s => { s.shape.scale = '1'; }],
  ['unsorted sizes', s => { s.typography.sizes.reverse(); }],
  ['duplicate sizes', s => { s.typography.sizes.push(32); }],
  ['missing legacy alias', s => { s.typography.sizes = s.typography.sizes.filter(n => n !== 13); }],
  ['fractional radius', s => { s.shape.radii[0] = 3.5; }],
  ['missing role', s => { delete s.typography.roles.caption; }],
  ['unscaled role size', s => { s.typography.roles.title.size = 26; }],
  ['role hierarchy', s => { s.typography.roles.title.size = 32; }],
  ['role line height', s => { s.typography.roles.body.lineHeight = 0; }],
  ['role tracking injection', s => { s.typography.roles.body.tracking = '0em; color:red'; }],
  ['invalid role weight', s => { s.typography.roles.body.weight = 1000; }],
  ['negative duration', s => { s.motion.fast = '-1ms'; }],
  ['unordered durations', s => { s.motion.fast = '1s'; }],
  ['invalid bezier', s => { s.motion.easeEnter = 'cubic-bezier(2, 0, 0, 1)'; }],
  ['invalid length', s => { s.layout.sidebar = 'var(--unknown)'; }],
  ['empty spacing', s => { s.spacing.unit = '0px'; }],
];
for (const [name, mutate] of invalid) test(`rejects ${name} before compilation`, () => {
  const input = candidate(), result = mutate(input);
  assert.throws(() => compileTheme(result === null ? null : input), /Invalid theme source:/);
});

test('Tailwind compiles semantic surface, chart, role and complete shadow utilities', async () => {
  const require = createRequire(import.meta.url);
  const themePath = new URL('../packages/theme/src/theme.css', import.meta.url);
  const theme = readFileSync(themePath, 'utf8');
  const compiler = await compile(theme, {
    loadStylesheet: async id => {
      const path = id === 'tailwindcss' ? require.resolve('tailwindcss/index.css') : new URL(id, themePath);
      return { content: readFileSync(path, 'utf8'), base: '', path: String(path) };
    },
  });
  const css = compiler.build(['type-display', 'type-body', 'bg-surface-raised', 'border-line-strong', 'text-chart-8', 'shadow-tint', 'shadow-modal', 'ease-enter', 'transition-colors']);
  for (const name of ['type-display', 'type-body', 'bg-surface-raised', 'border-line-strong', 'text-chart-8', 'shadow-tint', 'shadow-modal', 'ease-enter']) assert.ok(css.includes(`.${name} {`), `${name} must compile`);
  assert.ok(css.includes('--tw-shadow: var(--elevation-control)'));
  assert.ok(css.includes('--tw-shadow: var(--elevation-overlay)'));
  assert.ok(css.includes('font-size: var(--type-body-size)'));
});

test('reduced motion stops pulse decoration while retaining functional spinner feedback', () => {
  const css = compileTheme(source)['packages/theme/src/tokens.gen.css'];
  assert.ok(css.includes('--motion-slow:0ms'));
  assert.ok(css.includes('animation-iteration-count:1!important'));
  assert.ok(css.includes('.animate-pulse{animation:none!important}'));
  assert.ok(css.includes('.animate-spin{animation-duration:1.4s!important;animation-iteration-count:infinite!important}'));
  const theme = readFileSync(new URL('../packages/theme/src/theme.css', import.meta.url), 'utf8');
  assert.ok(theme.includes('--text-base: var(--font-13);'));
  for (const role of typographyRoles) assert.ok(theme.includes(`@utility type-${role}`));
  for (const alias of ['tint', 'modal']) assert.ok(!theme.includes(`--shadow-${alias}: var(--shadow-${alias});`));
});
