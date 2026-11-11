// Author: yunnuo <ymz@ebox.vip>
// Description: Bundle a browser fixture in memory and intercept only test-owned URLs.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';

let bundle: Promise<{ script: string; css: string }> | undefined;
export async function openUploadFixture(page: Page, origin: string) {
  bundle ??= (async () => {
    const result = await build({ configFile: false, logLevel: 'error', plugins: [react(), tailwindcss()],
      define: { 'process.env.NODE_ENV': '"production"', __FEATURE_LICENSE__: 'false', __FEATURE_UPDATER__: 'true' },
      build: { write: false, lib: { entry: resolve('packages/web-ui/fixtures/upload-harness.tsx'), name: 'UploadFixture', formats: ['iife'] }, cssCodeSplit: false },
    });
    const compiled = Array.isArray(result) ? result[0] : result;
    if (!('output' in compiled)) throw new Error('Expected an in-memory bundle');
    const output = compiled.output;
    return { script: output.filter(item => item.type === 'chunk').map(item => item.code).join('\n'),
      css: output.flatMap(item => item.type === 'asset' && item.fileName.endsWith('.css') ? [String(item.source)] : []).join('\n') };
  })();
  const assets = await bundle;
  await page.route(`${origin}/__upload_fixture*`, route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill(path.endsWith('.js') ? { contentType: 'text/javascript; charset=utf-8', body: assets.script }
      : path.endsWith('.css') ? { contentType: 'text/css', body: assets.css }
      : { contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/__upload_fixture.css"></head><body><div id="root"></div><script src="/__upload_fixture.js"></script></body></html>' });
  });
  const failures: Error[] = [];
  const capture = (error: Error) => failures.push(error);
  page.on('pageerror', capture);
  try {
    await page.goto(`${origin}/__upload_fixture`);
    await page.getByRole('button', {name: /上传文件|Upload file/, exact: true}).waitFor({timeout: 5000});
  } catch (error) {
    throw failures[0] ?? error;
  } finally { page.off('pageerror', capture); }
}
