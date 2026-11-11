// Author: yunnuo <ymz@ebox.vip>
// Description: Publish build for @unicore/theme; generated JSON palettes are inlined by esbuild.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { theme: 'src/theme.ts', preferences: 'src/preferences.ts', derive: 'src/derive.mjs' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
});
