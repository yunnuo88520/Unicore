// Author: yunnuo <ymz@ebox.vip>
// Description: Publish build for @unicore/ui; workspace development keeps consuming TypeScript sources.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', editor: 'src/editor.tsx', message: 'src/message.tsx', cn: 'src/cn.ts', i18n: 'src/i18n.ts', controls: 'src/controls/index.ts', charts: 'src/charts/index.ts', calendar: 'src/calendar/index.ts', composites: 'src/composites/index.ts', 'data-grid': 'src/data-grid/index.ts' },
  format: ['esm'],
  dts: true,
  esbuildOptions: options => { options.jsx = 'automatic'; },
  sourcemap: true,
  clean: true,
});
