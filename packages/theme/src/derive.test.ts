// Author: yunnuo <ymz@ebox.vip>
// Description: Golden parity between the shared derivation and the compiled default palette.
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import resolved from './resolved.gen.json';
import modes from './modes.gen.json';
import { accentVariables, derivePalette } from './derive.mjs';

it('derives exactly the compiled default palette from the brand accent', () => {
  const derived = derivePalette('#6662ec', modes);
  expect(derived.light).toEqual(resolved.light);
  expect(derived.dark).toEqual(resolved.dark);
});

it.each(['#000000', '#ffffff', '#be316b', '#087e68', '#3265d4', '#a56217', '#596275'])('keeps custom accent %s in parity with generated presets without altering neutral/chart tokens', accent => {
  const baseline = derivePalette('#6662ec', modes);
  const palette = derivePalette(accent, modes);
  for (const mode of ['light', 'dark'] as const) {
    const changed = Object.keys(baseline[mode]).filter(key => baseline[mode][key] !== palette[mode][key]);
    expect(changed.every(key => accentVariables.includes(key))).toBe(true);
    for (const key of Object.keys(modes[mode])) expect(palette[mode][key]).toBe(modes[mode][key as keyof typeof modes.light]);
    for (const role of ['control', 'card', 'floating', 'overlay']) {
      expect(palette[mode][`elevation-${role}`]).toBe(baseline[mode][`elevation-${role}`]);
      expect(palette[mode][`elevation-${role}`]).toMatch(/^0 /);
    }
  }
});

it('emits the same palette for preset CSS and runtime custom accents', () => {
  const css = readFileSync('packages/theme/src/tokens.gen.css', 'utf8');
  const source = JSON.parse(readFileSync('assets/theme/tokens.json', 'utf8'));
  for (const [id, accent] of Object.entries(source.presets)) {
    const palette = derivePalette(accent as string, modes);
    for (const mode of ['light', 'dark'] as const) {
      const selector = `:root[data-accent=${id}]${mode === 'dark' ? '[data-theme=dark]' : ''}{`;
      const declarations = css.split(selector)[1].split('}')[0];
      for (const [key, value] of Object.entries(palette[mode])) expect(declarations).toContain(`--${key}: ${value};`);
    }
  }
});

it('uses dark shadow keys rather than casting pale shadows in dark mode', () => {
  const palette = derivePalette('#6662ec', modes);
  expect(palette.dark['elevation-overlay']).toContain('#000000');
  expect(palette.dark.shadow).not.toBe('none');
  expect(palette.light['shadow-modal']).toMatch(/^#[0-9a-f]{8}$/);
  expect(palette.dark['shadow-modal']).toMatch(/^#000000[0-9a-f]{2}$/);
});

it('rejects malformed accents and covers every accent-coupled variable', () => {
  expect(() => derivePalette('purple', modes)).toThrow();
  expect(() => derivePalette('#6662', modes)).toThrow();
  const derived = derivePalette('#3265d4', modes);
  for (const variable of accentVariables) {
    expect(derived.light[variable]).toBeTruthy();
    expect(derived.dark[variable]).toBeTruthy();
  }
});
