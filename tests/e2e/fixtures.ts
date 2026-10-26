// Author: yunnuo <ymz@ebox.vip>
// Description: Every browser test owns a fresh process, data directory and bootstrap credential.
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

type Instance = { url: string; token: string; request: APIRequestContext };
export const test = base.extend<{ instance: Instance }>({
  instance: async ({ playwright }, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'unicore-e2e-'));
    const allocator = createServer(); await new Promise<void>(resolve => allocator.listen(0, '127.0.0.1', resolve));
    const port = (allocator.address() as { port: number }).port; await new Promise<void>(resolve => allocator.close(() => resolve()));
    const url = `http://127.0.0.1:${port}`;
    const process = spawn('build/bin/server', ['--listen', `127.0.0.1:${port}`, '--data-dir', directory, '--api-docs=true'], { stdio: 'ignore', env: Object.fromEntries(Object.entries(globalThis.process.env).filter(([key]) => !key.startsWith('APP_'))) });
    const request = await playwright.request.newContext({ baseURL: url });
    try {
      await expect.poll(async () => { try { return (await request.get('/api/v1/health/live')).status(); } catch { return 0; } }, { timeout: 15000 }).toBe(200);
      const token = (await readFile(join(directory, 'bootstrap.token'), 'utf8')).trim();
      await use({ url, token, request });
    } finally {
      process.kill('SIGTERM'); await new Promise<void>(resolve => { if (process.exitCode !== null) resolve(); else process.once('exit', () => resolve()); });
      await request.dispose(); await rm(directory, { recursive: true, force: true });
    }
  },
});
export { expect };
export async function installStandalone(instance: Instance) {
  const response = await instance.request.post('/api/v1/install/complete', { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-standalone', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: '', admin_email: '', admin_password: '' } });
  expect(response.status()).toBe(200);
}
