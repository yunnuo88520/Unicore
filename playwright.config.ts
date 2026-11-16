// Author: yunnuo <ymz@ebox.vip>
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0, workers: 4,
  reporter: 'list',
  // The DEV-only catalog starts its own Vite proxy and runs through its dedicated configuration.
  testIgnore: ['**/ui-system.spec.ts', '**/ui-system.production.spec.ts'],
  // Tests only talk to the local instance: never route loopback requests
  // through the host's system proxy (its latency makes save/logout races fail).
  use: { trace: 'retain-on-failure', launchOptions: { args: ['--no-proxy-server'] } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } }],
});
