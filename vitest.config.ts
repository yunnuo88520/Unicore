// Author: yunnuo <ymz@ebox.vip>
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { featureBuild } from './scripts/build-features.mjs';

export default defineConfig({ plugins: [react()], define: featureBuild().define, test: { environment: 'jsdom', environmentOptions: { jsdom: { url: 'http://localhost/' } }, include: ['packages/**/*.test.{ts,tsx}'], setupFiles: ['tests/setup.ts'], restoreMocks: true,
    // Per-test retries stay at zero in CI and locally: a retried test would hide its
    // original failure, so reruns for environmental breakage happen at the job level
    // where the first run's output is preserved.
    retry: 0 } });
