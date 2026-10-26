// Author: yunnuo <ymz@ebox.vip>
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', include: ['packages/**/*.test.{ts,tsx}'], setupFiles: ['tests/setup.ts'], restoreMocks: true } });
