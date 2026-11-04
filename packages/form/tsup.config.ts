// Author: yunnuo <ymz@ebox.vip>
// Description: Publish build for @unicore/form; workspace development keeps consuming TypeScript sources.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { form: 'src/form.tsx', fields: 'src/fields.tsx' },
  format: ['esm'],
  dts: true,
  esbuildOptions: options => { options.jsx = 'automatic'; },
  sourcemap: true,
  clean: true,
});
