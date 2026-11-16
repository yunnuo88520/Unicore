// Author: yunnuo <ymz@ebox.vip>
// Description: Isolated real Standalone server and worker-local Vite proxy for DEV-only catalog checks.
import { test as base, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HttpTransport } from '../../packages/sdk/src';

const root = resolve(__dirname, '../..');
type LocalApp = { devURL: string; productionURL: string };
type WorkerFixtures = { uiSystem: LocalApp };
const delay = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

async function freePort() {
  const allocator = createServer();
  await new Promise<void>((resolve, reject) => { allocator.once('error', reject); allocator.listen(0, '127.0.0.1', resolve); });
  const port = (allocator.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => allocator.close(error => error ? reject(error) : resolve()));
  return port;
}

function launch(command: string, arguments_: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, arguments_, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let spawnError: Error | undefined;
  child.on('error', error => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', data => { output = (output + data.toString()).slice(-12_000); });
  return { child, failure: () => spawnError?.message ?? output, exited: () => !!spawnError || child.exitCode !== null || child.signalCode !== null };
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  // Register before signalling, then escalate if graceful shutdown stalls.
  const exited = once(child, 'exit').then(() => undefined);
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  try { await exited; } finally { clearTimeout(timer); }
}

export const test = base.extend<{}, WorkerFixtures>({
  uiSystem: [async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'unicore-ui-system-'));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('APP_')));
    let server: ReturnType<typeof launch> | undefined;
    let vite: ReturnType<typeof launch> | undefined;
    try {
      let productionURL = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        const port = await freePort();
        productionURL = `http://127.0.0.1:${port}`;
        server = launch(join(root, 'build/bin/server'), ['--listen', `127.0.0.1:${port}`, '--data-dir', directory], env);
        const client = new HttpTransport(productionURL);
        let ready = false;
        for (let poll = 0; poll < 80 && !server.exited(); poll++) {
          try {
            const token = (await readFile(join(directory, 'bootstrap.token'), 'utf8')).trim();
            // Token-authorized SDK verification proves this is our process, not a port collision.
            await client.verifyDatabase(token, { driver: 'sqlite', dsn: '' });
            ready = true;
            break;
          } catch { await delay(250); }
        }
        if (ready) break;
        const failure = server.failure();
        await stop(server.child);
        if (attempt === 2) throw new Error(`Real UI system server did not initialize. Build with go build -o build/bin/server ./cmd/server.\n${failure}`);
      }
      const client = new HttpTransport(productionURL);
      const token = (await readFile(join(directory, 'bootstrap.token'), 'utf8')).trim();
      await client.completeInstall(token, {
        profile: 'web-standalone', database: { driver: 'sqlite', dsn: '' },
        site_name: 'UI system sample', base_url: productionURL,
        admin_username: '', admin_email: '', admin_password: '',
      });
      const metadata = await client.bootstrap();
      expect(metadata.capabilities.authentication).toBe(false);
      let devURL = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        const port = await freePort();
        devURL = `http://127.0.0.1:${port}`;
        vite = launch(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort', 'apps/web'], { ...env, UNICORE_API_URL: productionURL });
        let ready = false;
        for (let poll = 0; poll < 100 && !vite.exited(); poll++) {
          try {
            const response = await fetch(`${devURL}/@vite/client`, { signal: AbortSignal.timeout(1_000) });
            if (response.ok && (await response.text()).includes('vite')) { ready = true; break; }
          } catch { /* Wait only for this worker's local frontend. */ }
          await delay(200);
        }
        if (ready) break;
        const failure = vite.failure();
        await stop(vite.child);
        if (attempt === 2) throw new Error(`Worker-local Vite did not become ready.\n${failure}`);
      }
      await use({ devURL, productionURL });
    } finally {
      // Nested finally blocks keep the data cleanup reliable even if termination fails.
      try { if (vite) await stop(vite.child); }
      finally { try { if (server) await stop(server.child); } finally { await rm(directory, { recursive: true, force: true }); } }
    }
  }, { scope: 'worker', timeout: 90_000 }],
  context: async ({ context }, use) => {
    // Enforce offline browser evidence without replacing any backend response.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) await route.continue();
      else await route.abort('blockedbyclient');
    });
    await use(context);
  },
});
export { expect };
