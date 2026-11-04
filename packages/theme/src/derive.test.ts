// Author: yunnuo <ymz@ebox.vip>
// Description: Golden parity between the shared derivation and the compiled default palette.
import { expect, it } from 'vitest';
import resolved from './resolved.gen.json';
import modes from './modes.gen.json';
import { accentVariables, derivePalette } from './derive.mjs';

it('derives exactly the compiled default palette from the brand accent', () => {
  const derived = derivePalette('#6662ec', modes);
  expect(derived.light).toEqual(resolved.light);
  expect(derived.dark).toEqual(resolved.dark);
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
