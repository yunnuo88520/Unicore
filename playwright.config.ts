// Author: yunnuo <ymz@ebox.vip>
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } }],
  webServer: { command: 'go run ./cmd/server --listen 127.0.0.1:4173', url: 'http://127.0.0.1:4173/api/v1/health/ready', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
