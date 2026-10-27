// Author: yunnuo <ymz@ebox.vip>
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { featureBuild } from '../../scripts/build-features.mjs';

const features = featureBuild();

export default defineConfig({
  plugins: [react(), features.plugin], define: features.define,
  server: { port: 5173, strictPort: true, proxy: { '/api': process.env.UNICORE_API_URL ?? 'http://127.0.0.1:8080' } },
  build: { outDir: 'static', emptyOutDir: false },
});
