// Author: yunnuo <ymz@ebox.vip>
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { featureBuild } from '../../scripts/build-features.mjs';

const features = featureBuild();
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules') && !id.includes('/packages/contracts/')) return undefined;
  if (id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react/')) return 'vendor-react';
  if (id.includes('/node_modules/@tanstack/')) return 'vendor-tanstack';
  if (id.includes('/node_modules/@radix-ui/')) return 'vendor-radix';
  if (id.includes('/node_modules/lucide-react/')) return 'vendor-icons';
  if (id.includes('/packages/contracts/') || id.includes('/node_modules/zod/')) return 'vendor-contracts';
  return undefined;
}
export default defineConfig({ plugins: [react(), tailwindcss(), features.plugin], define: features.define, build: { rollupOptions: { output: { manualChunks } }, outDir: 'static', emptyOutDir: false } });
