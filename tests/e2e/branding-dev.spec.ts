// Author: yunnuo <ymz@ebox.vip>
// Description: The actual Vite entry must serve saved branding bytes and replace the visible logo.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { test, expect, installPlatform, adminLogin } from './fixtures';

test('Vite saved wide logo and long title fit the sidebar through collapse, reload and login', async ({ page, instance }, info) => {
  test.setTimeout(90000);
  await installPlatform(instance);
  const allocator = createServer();
  await new Promise<void>(done => allocator.listen(0, '127.0.0.1', done));
  const port = (allocator.address() as { port: number }).port;
  await new Promise<void>(done => allocator.close(() => done()));
  const origin = `http://127.0.0.1:${port}`;
  const dev = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort', 'apps/web'], {
    env: { ...process.env, UNICORE_API_URL: instance.url }, stdio: 'ignore',
  });
  try {
    await expect.poll(async () => { try { return (await page.request.get(`${origin}/@vite/client`)).ok(); } catch { return false; } }, { timeout: 20000 }).toBe(true);
    await adminLogin(page, origin, 'admin', 'administrator-password-strong');
    await page.goto(`${origin}/admin/site`);
    const siteName = 'Unicore Enterprise Collaboration and Operations Workspace';
    await page.getByLabel('站点名称', { exact: true }).fill(siteName);
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page).toHaveTitle(`${siteName} · 工作空间`);
    await page.goto(`${origin}/admin/site?tab=branding`);
    const logo = page.getByRole('form', { name: '浅色 Logo', exact: true });
    const icon = page.getByRole('form', { name: '站点图标', exact: true });
    const png = (color: string) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="18" fill="${color}"/><path d="M24 28h48v40H24z" fill="white"/></svg>`).render().asPng();
    await icon.locator('input[type=file]').setInputFiles({ name: 'tab.png', mimeType: 'image/png', buffer: png('#777777') });
    await icon.getByRole('button', { name: '保存站点图标', exact: true }).click();
    await expect(icon.getByRole('img')).toHaveAttribute('src', /^\/brand-assets\//);
    const favicon = await icon.getByRole('img').getAttribute('src');
    const wide = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="4" y="64" fill="#b32735" font-family="Arial,sans-serif" font-style="italic" font-weight="700" font-size="76">Xorcore</text></svg>').render().asPng();
    await logo.locator('input[type=file]').setInputFiles({ name: 'company.png', mimeType: 'image/png', buffer: wide });
    await expect(logo.getByRole('img', { name: '浅色 Logo待保存预览', exact: true })).toHaveJSProperty('naturalWidth', 400);
    await logo.getByRole('button', { name: '保存浅色 Logo', exact: true }).click();
    const savedImage = logo.getByRole('img', { name: '浅色 Logo当前预览', exact: true });
    await expect(savedImage).toHaveAttribute('src', /^\/brand-assets\//);
    await expect.poll(() => savedImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > image.naturalHeight * 4)).toBe(true);
    const source = await savedImage.getAttribute('src');
    expect(source).not.toBe(favicon);
    const asset = await page.request.get(`${origin}${source}`);
    expect(asset.headers()['content-type']).toBe('image/png');
    expect((await asset.body()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const checkShell = async () => {
      const mobile = (page.viewportSize()?.width ?? 0) < 768;
      if (mobile) await page.getByRole('button', { name: '打开导航', exact: true }).click();
      const header = page.locator('.sidebar [data-brand-header="icon-title"]');
      const visibleLogo = header.locator('img');
      await expect(visibleLogo).toHaveAttribute('src', source!);
      await expect(visibleLogo).toHaveCSS('object-fit', 'contain');
      await expect(visibleLogo).toHaveCSS('width', '100px');
      const pixels = await visibleLogo.evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight, rendered: image.getBoundingClientRect().height }));
      expect(pixels.rendered).toBeCloseTo(100 * pixels.height / pixels.width, 1);
      const title = header.locator('.sidebar-header-title');
      await expect(header.locator('.brand-area')).toHaveCSS('flex-direction', 'row');
      await expect(title).toHaveText(siteName);
      await expect(title).toHaveCSS('white-space', 'nowrap');
      await expect(title).toHaveCSS('text-overflow', 'ellipsis');
      expect(await title.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      const geometry = await header.evaluate(element => {
        const rect = (selector: string) => { const bounds = element.querySelector(selector)!.getBoundingClientRect(); return { left: bounds.left, right: bounds.right, centerY: bounds.top + bounds.height / 2, width: bounds.width, height: bounds.height }; };
        return { logo: rect('.sidebar-header-logo'), text: rect('.brand-info'), toggle: element.querySelector('.sidebar-header-toggle') ? rect('.sidebar-header-toggle') : null };
      });
      expect(geometry.logo.width).toBeCloseTo(100, 3);
      expect(geometry.logo.height).toBeCloseTo(32, 3);
      expect(geometry.text.left - geometry.logo.right).toBeCloseTo(8, 3);
      expect(Math.abs(geometry.logo.centerY - geometry.text.centerY)).toBeLessThanOrEqual(1);
      if (!mobile) {
        await expect(header.locator('.sidebar-header-toggle')).toHaveCSS('position', 'static');
        expect(geometry.toggle!.width).toBeCloseTo(32, 3);
        expect(geometry.toggle!.left - geometry.text.right).toBeCloseTo(8, 3);
        expect(Math.abs(geometry.logo.centerY - geometry.toggle!.centerY)).toBeLessThanOrEqual(1);
        await page.getByRole('button', { name: '收起导航', exact: true }).click();
        const compact = page.locator('.sidebar .collapsed-mode');
        await expect(compact.locator('img')).toHaveAttribute('src', favicon!);
        await expect(compact.locator('.sidebar-header-title')).toBeHidden();
        await expect(compact.locator('.version-badge')).toBeHidden();
        await expect(compact.getByRole('button')).toHaveCount(0);
        const centered = await compact.locator('.sidebar-header-logo').evaluate(element => {
          const logo = element.getBoundingClientRect();
          const sidebar = element.closest('.sidebar')!.getBoundingClientRect();
          return { width: logo.width, height: logo.height, delta: Math.abs(logo.left + logo.width / 2 - sidebar.left - sidebar.width / 2) };
        });
        expect(centered.width).toBeCloseTo(32, 3);
        expect(centered.height).toBeCloseTo(32, 3);
        expect(centered.delta).toBeLessThanOrEqual(1);
        const directory = `build/acceptance/sidebar-brand/${info.project.name}`;
        await mkdir(directory, { recursive: true });
        await page.screenshot({ path: `${directory}/collapsed.png`, animations: 'disabled' });
        const expand = page.locator('.topbar').getByRole('button', { name: '展开导航', exact: true });
        await expand.focus();
        await page.keyboard.press('Enter');
        await expect(title).toBeVisible();
      }
      const directory = `build/acceptance/sidebar-brand/${info.project.name}`;
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: `${directory}/expanded.png`, animations: 'disabled' });
      if (!mobile) {
        await page.getByRole('button', { name: '切换主题', exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(visibleLogo).toHaveAttribute('src', source!);
        await page.screenshot({ path: `${directory}/expanded-dark.png`, animations: 'disabled' });
        await page.getByRole('button', { name: '切换主题', exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      }
      if (mobile) await page.keyboard.press('Escape');
    };
    await checkShell();
    await page.reload();
    await expect(savedImage).toHaveJSProperty('complete', true);
    await checkShell();
    await page.context().clearCookies();
    await adminLogin(page, origin, 'admin', 'administrator-password-strong');
    await page.goto(`${origin}/admin/site?tab=branding`);
    await expect(savedImage).toHaveJSProperty('complete', true);
    await checkShell();
    if (info.project.name !== 'mobile') {
      await page.getByRole('button', { name: '主题设置', exact: true }).click();
      const appearance = page.getByRole('dialog', { name: '主题设置', exact: true });
      await appearance.locator('.preference-layout').getByRole('button', { name: '紧凑', exact: true }).click();
      await page.keyboard.press('Escape');
      const compactHeader = page.locator('.sidebar [data-brand-header="icon-title"]');
      const bounds = await compactHeader.evaluate(element => {
        const logo = element.querySelector('img')!.getBoundingClientRect();
        const title = element.querySelector('.sidebar-header-title')!.getBoundingClientRect();
        const version = element.querySelector('.version-badge')!.getBoundingClientRect();
        const toggle = element.querySelector('.sidebar-header-toggle')!.getBoundingClientRect();
        return { logoWidth: logo.width, titleWidth: title.width, versionRight: version.right, toggleLeft: toggle.left };
      });
      expect(bounds.logoWidth).toBeGreaterThan(32);
      expect(bounds.logoWidth).toBeLessThanOrEqual(100);
      expect(bounds.titleWidth).toBeGreaterThanOrEqual(50);
      expect(bounds.versionRight).toBeLessThanOrEqual(bounds.toggleLeft - 8);
      await page.screenshot({ path: 'build/acceptance/sidebar-brand/chromium/compact-layout.png', animations: 'disabled' });
      await page.getByRole('button', { name: '主题设置', exact: true }).click();
      await appearance.locator('.preference-layout').getByRole('button', { name: '默认', exact: true }).click();
      await page.keyboard.press('Escape');
    }
    await page.getByRole('radio', { name: /完整字标/ }).click();
    await page.getByRole('button', { name: '保存显示方式', exact: true }).click();
    await page.reload();
    await expect(logo).toBeVisible();
    const mobile = info.project.name === 'mobile';
    if (mobile) await page.getByRole('button', { name: '打开导航', exact: true }).click();
    const wordmark = page.locator('.sidebar [data-brand-header="wordmark"]');
    await expect(wordmark.locator('img')).toHaveAttribute('src', source!);
    await expect(wordmark.locator('img')).toHaveCSS('width', '100px');
    await expect(wordmark.locator('.brand-name')).toBeHidden();
    await expect(wordmark.locator('.version-badge')).toBeVisible();
    const checkWordmarkPlacement = async () => {
      await expect(wordmark).toHaveCSS('position', 'static');
      await expect(wordmark.locator('.brand-area')).toHaveCSS('flex-direction', 'row');
      await expect(wordmark.locator('.brand-area')).toHaveCSS('align-items', 'center');
      await expect(wordmark.locator('.brand-info')).toHaveCSS('padding-left', '0px');
      const placement = await wordmark.evaluate(element => {
        const header = element.getBoundingClientRect();
        const logo = element.querySelector('.sidebar-header-logo')!.getBoundingClientRect();
        const version = element.querySelector('.version-badge')!.getBoundingClientRect();
        const toggle = element.querySelector('.sidebar-header-toggle')?.getBoundingClientRect();
        return {
          left: version.left - logo.right, drift: Math.abs(logo.top + logo.height / 2 - (version.top + version.height / 2)),
          logoTop: logo.top - header.top,
          toggle: toggle ? { right: header.right - toggle.right, width: toggle.width, height: toggle.height, clearance: toggle.left - version.right } : null,
        };
      });
      expect(placement.left).toBeCloseTo(8, 2);
      expect(placement.drift).toBeLessThanOrEqual(1);
      expect(placement.logoTop).toBeGreaterThanOrEqual(0);
      if (!mobile) {
        await expect(wordmark.locator('.sidebar-header-toggle')).toHaveCSS('position', 'static');
        expect(placement.toggle!.right).toBeCloseTo(4, 2);
        expect(placement.toggle!.width).toBeCloseTo(32, 2);
        expect(placement.toggle!.height).toBeCloseTo(32, 2);
        expect(placement.toggle!.clearance).toBeGreaterThanOrEqual(8);
      }
    };
    await checkWordmarkPlacement();
    const modeDirectory = `build/acceptance/sidebar-brand/${info.project.name}`;
    await page.screenshot({ path: `${modeDirectory}/wordmark.png`, animations: 'disabled' });
    if (!mobile) {
      await page.getByRole('button', { name: '切换主题', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await checkWordmarkPlacement();
      await page.screenshot({ path: `${modeDirectory}/wordmark-dark.png`, animations: 'disabled' });
      await page.getByRole('button', { name: '切换主题', exact: true }).click();
      await page.getByRole('button', { name: '主题设置', exact: true }).click();
      const appearance = page.getByRole('dialog', { name: '主题设置', exact: true });
      await appearance.locator('.preference-layout').getByRole('button', { name: '紧凑', exact: true }).click();
      await page.keyboard.press('Escape');
      await checkWordmarkPlacement();
      await page.screenshot({ path: `${modeDirectory}/wordmark-compact.png`, animations: 'disabled' });
      await page.getByRole('button', { name: '主题设置', exact: true }).click();
      await appearance.locator('.preference-layout').getByRole('button', { name: '默认', exact: true }).click();
      await page.keyboard.press('Escape');
    }
    if (mobile) await page.keyboard.press('Escape');

    // The fallback must remain recognizable even when no square icon is set.
    await icon.getByRole('button', { name: '恢复默认', exact: true }).click();
    await icon.getByRole('button', { name: '确认恢复', exact: true }).click();
    if (!mobile) {
      await page.getByRole('button', { name: '收起导航', exact: true }).click();
      const fallback = page.locator('.sidebar [data-brand-header="compact"]');
      await expect(fallback.locator('img')).toHaveCount(0);
      // Rail without a favicon shows the compiled vector mark, not a letter tile.
      await expect(fallback.locator('.instance-brand .brand-vector')).toBeVisible();
      await page.screenshot({ path: `${modeDirectory}/collapsed-default.png`, animations: 'disabled' });
      await page.getByRole('button', { name: '展开导航', exact: true }).click();
    }
    await page.getByRole('button', { name: '切换语言', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
    await expect(page.getByText('Landscape logos fit up to 100px wide without repeating the site name. The sidebar version sits beside the logo.', { exact: true })).toBeVisible();
    if (mobile) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(wordmark.locator('img')).toHaveCSS('width', '100px');
    await checkWordmarkPlacement();
    await page.screenshot({ path: `${modeDirectory}/wordmark-en.png`, animations: 'disabled' });
    if (mobile) await page.keyboard.press('Escape');
    const directory = `build/acceptance/logo-storage/${info.project.name}`;
    await mkdir(directory, { recursive: true });
    if (mobile) await page.getByRole('form', { name: 'Light logo', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${directory}/saved-logo-dev.png`, fullPage: info.project.name !== 'mobile', animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    dev.kill('SIGTERM');
    await new Promise<void>(done => { if (dev.exitCode !== null) done(); else { const timer = setTimeout(() => dev.kill('SIGKILL'), 5000); dev.once('exit', () => { clearTimeout(timer); done(); }); } });
  }
});
