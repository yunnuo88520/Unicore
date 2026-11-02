// Author: yunnuo <ymz@ebox.vip>
// Description: Every browser test owns a fresh process, data directory and bootstrap credential.
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

type Instance = { url: string; token: string; request: APIRequestContext; restart: () => Promise<void>; unlockForReinstall: () => Promise<string> };
export const test = base.extend<{ instance: Instance }>({
  instance: async ({ playwright }, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'unicore-e2e-'));
    const allocator = createServer(); await new Promise<void>(resolve => allocator.listen(0, '127.0.0.1', resolve));
    const port = (allocator.address() as { port: number }).port; await new Promise<void>(resolve => allocator.close(() => resolve()));
    const url = `http://127.0.0.1:${port}`;
    const start = () => spawn('build/bin/server', ['--listen', `127.0.0.1:${port}`, '--data-dir', directory, '--api-docs=true'], { stdio: 'ignore', env: Object.fromEntries(Object.entries(globalThis.process.env).filter(([key]) => !key.startsWith('APP_'))) });
    let process = start();
    const stop = async () => { if (process.exitCode !== null) return; process.kill('SIGTERM'); await new Promise<void>(resolve => process.once('exit', () => resolve())); };
    const request = await playwright.request.newContext({ baseURL: url });
    try {
      await expect.poll(async () => { try { return (await request.get('/api/v1/health/live')).status(); } catch { return 0; } }, { timeout: 15000 }).toBe(200);
      const token = (await readFile(join(directory, 'bootstrap.token'), 'utf8')).trim();
      await use({ url, token, request,
        restart: async () => { await stop(); process = start(); await expect.poll(async () => { try { return (await request.get('/api/v1/health/ready')).status(); } catch { return 0; } }, { timeout: 15000 }).toBe(200); },
        unlockForReinstall: async () => {
          await stop();
          await rm(join(directory, 'install.lock'));
          process = start();
          await expect.poll(async () => { try { return (await request.get('/api/v1/health/live')).status(); } catch { return 0; } }, { timeout: 15000 }).toBe(200);
          expect((await request.get('/api/v1/health/ready')).status()).toBe(503);
          return (await readFile(join(directory, 'bootstrap.token'), 'utf8')).trim();
        },
      });
    } finally {
      await stop();
      await request.dispose(); await rm(directory, { recursive: true, force: true });
    }
  },
});
export { expect };
// Open the actual navigation, expanding only the group that owns the requested destination.
export async function navigate(page: Page, name: string) {
  const sidebar = page.locator('.sidebar');
  const open = page.getByRole('button', { name: '打开导航', exact: true });
  // A navigation immediately after install/login can precede the shell mount.
  // Wait for either real desktop navigation or the mobile drawer control first.
  await expect.poll(async () => await sidebar.isVisible() || await open.isVisible()).toBe(true);
  const expand = page.getByRole('button', { name: '展开导航', exact: true });
  if (await expand.isVisible()) await expand.click();
  if (!await sidebar.isVisible()) await open.click();
  const group = sidebar.locator('section').filter({ has: page.getByRole('button', { name, exact: true, includeHidden: true }) });
  const toggle = group.locator(':scope > button[aria-expanded="false"]');
  if (await toggle.count()) await toggle.click();
  await sidebar.getByRole('button', { name, exact: true }).click();
}
export async function installStandalone(instance: Instance) {
  const response = await instance.request.post('/api/v1/install/complete', { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-standalone', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: '', admin_email: '', admin_password: '' } });
  expect(response.status()).toBe(200);
}
