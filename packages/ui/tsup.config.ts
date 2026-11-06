// Author: yunnuo <ymz@ebox.vip>
// Description: Publish build for @unicore/ui; workspace development keeps consuming TypeScript sources.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', editor: 'src/editor.tsx', message: 'src/message.tsx', cn: 'src/cn.ts', i18n: 'src/i18n.ts' },
  format: ['esm'],
  dts: true,
  esbuildOptions: options => { options.jsx = 'automatic'; },
  sourcemap: true,
  clean: true,
});
