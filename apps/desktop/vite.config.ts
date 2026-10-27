// Author: yunnuo <ymz@ebox.vip>
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { featureBuild } from '../../scripts/build-features.mjs';

const features = featureBuild();
export default defineConfig({ plugins: [react(), features.plugin], define: features.define, build: { outDir: 'static', emptyOutDir: false } });
