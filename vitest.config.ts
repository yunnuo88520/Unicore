// Author: yunnuo <ymz@ebox.vip>
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { featureBuild } from './scripts/build-features.mjs';

export default defineConfig({ plugins: [react()], define: featureBuild().define, test: { environment: 'jsdom', include: ['packages/**/*.test.{ts,tsx}'], setupFiles: ['tests/setup.ts'], restoreMocks: true } });
