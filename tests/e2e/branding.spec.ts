// Author: yunnuo <ymz@ebox.vip>
// Description: Real brand preview/save/theme/favicon/login/template/reset across PC and 375px.
import { test, expect } from './fixtures';
import type {Page, TestInfo} from '@playwright/test';
import { capture } from './visual';
import { mkdir } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
const variant = (dark: boolean) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="32" fill="${dark ? '#e4d3ff' : '#623ad6'}"/><path d="M35 32v40a29 29 0 0058 0V32H76v40a12 12 0 01-24 0V32z" fill="${dark ? '#2b1853' : 'white'}"/></svg>`).render().asPng();
const mark = (x: number, y: number, size: number, fill: string) => `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.22}" fill="#623ad6"/><path d="M${x + size * 0.28} ${y + size * 0.23}v${size * 0.38}a${size * 0.22} ${size * 0.22} 0 00${size * 0.44} 0V${y + size * 0.23}h-${size * 0.13}v${size * 0.38}a${size * 0.09} ${size * 0.09} 0 01-${size * 0.18} 0V${y + size * 0.23}z" fill="${fill}"/>`;
const wideLogo = () => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="440" viewBox="0 0 1800 440">${mark(130, 70, 300, 'white')}<text x="510" y="290" fill="#26213a" font-family="Arial,sans-serif" font-size="190" font-weight="700">UNICORE</text></svg>`).render().asPng();
const verticalLogo = () => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="820" viewBox="0 0 640 820">${mark(170, 70, 300, '#ffffff')}<text x="320" y="570" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="96" font-weight="700">UNICORE</text></svg>`).render().asPng();
const largeCompressedLogo = () => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="12228" height="2227" viewBox="0 0 12228 2227"><rect width="12228" height="2227" fill="#ffffff"/>${mark(180, 350, 1500, 'white')}<text x="1950" y="1480" fill="#26213a" font-family="Arial,sans-serif" font-size="1050" font-weight="700">UNICORE</text></svg>`).render().asPng();

async function saveBrandEvidence(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('[data-page-skeleton]')).toHaveCount(0);
  if (page.url().includes('/admin/site')) {
    await expect(page.getByRole('form', { name: '浅色 Logo', exact: true })).toBeVisible();
    await expect(page.getByRole('form', { name: '站点图标', exact: true })).toBeVisible();
  }
  const directory = `build/acceptance/m3b/${info.project.name}/workspace-brand`;
  await mkdir(directory, { recursive: true });
  const mobile = (page.viewportSize()?.width ?? 0) < 768;
  await page.screenshot({ path: `${directory}/${name}${mobile ? '-viewport' : ''}.png`, fullPage: !mobile, animations: 'disabled' });
}

async function openBrandNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole('button', { name: '打开导航', exact: true }).click();
}

async function expectIconTitleBrand(page: Page, info: TestInfo, mode: 'light' | 'dark', siteName: string, logoSrc: string) {
  await expect(page.getByText('图片已保存', { exact: true })).toBeHidden({ timeout: 6000 });
  await expect(page.getByText('显示方式已保存', { exact: true })).toBeHidden({ timeout: 6000 });
  await openBrandNavigation(page);
  const sidebar = page.locator('.sidebar');
  const header = sidebar.locator('[data-brand-header="icon-title"]');
  const brandLink = header.locator('a').first();
  const icon = brandLink.locator('.instance-brand');
  const name = header.locator('a').nth(1);
  await expect(brandLink).toBeVisible();
  await expect(icon).toBeVisible();
  await expect(icon.locator('img')).toHaveAttribute('src', logoSrc);
  const ratio = await icon.locator('img').evaluate(async (image: HTMLImageElement) => { await image.decode(); return image.naturalWidth / image.naturalHeight; });
  await expect(name).toBeVisible();
  await expect(name).toContainText(siteName);
  await expect(brandLink).toHaveAttribute('aria-label', siteName);
  const iconBounds = await icon.boundingBox();
  const nameBounds = await name.boundingBox();
  const linkBounds = await brandLink.boundingBox();
  const headerBounds = await header.boundingBox();
  expect(iconBounds).not.toBeNull();
  expect(nameBounds).not.toBeNull();
  expect(linkBounds).not.toBeNull();
  expect(headerBounds).not.toBeNull();
  expect(iconBounds!.width).toBeCloseTo(Math.min(100, 32 * ratio), 0);
  expect(iconBounds!.height).toBe(32);
  expect(nameBounds!.x).toBeGreaterThanOrEqual(iconBounds!.x + iconBounds!.width - 1);
  expect(nameBounds!.width).toBeGreaterThan(32);
  expect(linkBounds!.width).toBeCloseTo(iconBounds!.width, 3);
  expect(headerBounds!.width).toBeGreaterThanOrEqual(160);
  const headerName = header.locator('a').nth(1);
  const version = header.locator('.version-badge');
  await expect(version).toBeVisible();
  await expect.poll(async () => {
    const headerNameBounds = await headerName.boundingBox();
    const versionBounds = await version.boundingBox();
    if (!headerNameBounds || !versionBounds) return Number.POSITIVE_INFINITY;
    return Math.abs(versionBounds.x - headerNameBounds.x);
  }).toBeLessThanOrEqual(1);
  await saveBrandEvidence(page, info, `icon-title-${mode}`);
  if ((page.viewportSize()?.width ?? 0) < 768) await page.keyboard.press('Escape');
}

async function expectCollapsedBrand(page: Page, info: TestInfo, siteName: string) {
  await page.getByRole('button', { name: '收起导航', exact: true }).click();
  const sidebar = page.locator('.sidebar');
  const brandLink = sidebar.locator('a:has([data-brand-layout="compact"])').first();
  const layout = brandLink.locator('[data-brand-layout="compact"]');
  await expect(brandLink).toBeVisible();
  await expect(layout).toBeVisible();
  await expect(brandLink).toHaveAttribute('aria-label', siteName);
  await expect(brandLink).toHaveAttribute('title', siteName);
  const linkBounds = await brandLink.boundingBox();
  expect(linkBounds).not.toBeNull();
  expect(Math.abs(linkBounds!.width - linkBounds!.height)).toBeLessThanOrEqual(2);
  const compactImage = layout.locator('img:visible, svg:visible');
  if (await compactImage.count()) {
    const bounds = await compactImage.first().boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width / bounds!.height).toBeGreaterThan(0.75);
  }
  await expect(brandLink.locator('.brand-name')).toBeHidden();
  await saveBrandEvidence(page, info, 'wide-light-collapsed');
}

async function expectWordmarkBrand(page: Page, info: TestInfo, mode: 'light' | 'dark', siteName: string, expectedRatio: number) {
  await expect(page.getByText('图片已保存', { exact: true })).toBeHidden({ timeout: 6000 });
  await expect(page.getByText('显示方式已保存', { exact: true })).toBeHidden({ timeout: 6000 });
  await openBrandNavigation(page);
  const sidebar = page.locator('.sidebar');
  const brandHeader = sidebar.locator('[data-brand-header="wordmark"]');
  const brandLink = brandHeader.locator('a').first();
  const layout = brandLink.locator('[data-brand-layout="wordmark"]');
  const image = layout.locator(`.instance-brand-${mode} img`);
  await expect(brandLink).toBeVisible();
  await expect(layout).toBeVisible();
  await expect(image).toBeVisible();
  await expect(layout.locator('[role="img"]')).toHaveAttribute('aria-label', siteName);
  await expect(layout).toHaveAttribute('title', siteName);
  await expect(layout.locator('.brand-name')).toBeHidden();
  const bounds = await image.boundingBox();
  expect(bounds).not.toBeNull();
  // Device-pixel-ratio rounding can nudge the fitted width a hair over 100.
  expect(bounds!.width).toBeLessThanOrEqual(100.001);
  expect(bounds!.height).toBeLessThanOrEqual(32);
  if (expectedRatio >= 1.5) expect(bounds!.width).toBeGreaterThanOrEqual(100);
  expect(bounds!.width / bounds!.height).toBeCloseTo(expectedRatio, 1);
  const version = brandHeader.locator('.version-badge');
  await expect(version).toBeVisible();
  await expect.poll(async () => {
    const versionBounds = await version.boundingBox();
    const layoutBounds = await layout.boundingBox();
    if (!versionBounds || !layoutBounds) return Number.POSITIVE_INFINITY;
    return versionBounds.x - layoutBounds.x;
  }).toBeCloseTo(2, 2);
  await saveBrandEvidence(page, info, `wordmark-${mode}`);
  if ((page.viewportSize()?.width ?? 0) < 768) await page.keyboard.press('Escape');
}

async function expectLoginBrand(page: Page, info: TestInfo, mode: 'light' | 'dark', siteName: string, ratio: number) {
  await page.getByLabel('账号或邮箱').waitFor({ state: 'visible' });
  const lockup = page.locator('.flow-brand');
  const layout = lockup.locator('[data-brand-layout="wordmark"]');
  const brand = lockup.locator(`.instance-brand-${mode} img`);
  await expect(layout).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(layout.locator('.brand-name')).toBeHidden();
  await expect(layout).toHaveAttribute('title', siteName);
  await expect(layout.locator('[role="img"]')).toHaveAttribute('aria-label', siteName);
  await expect.poll(() => brand.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)).toBe(true);
  const bounds = await brand.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeLessThanOrEqual(180);
  expect(bounds!.height).toBeLessThanOrEqual(32);
  expect(bounds!.width / bounds!.height).toBeCloseTo(ratio, 1);
  await saveBrandEvidence(page, info, `login-wordmark-${mode}`);
}

test('instance brand preview, save, system theme and restore defaults', async ({ page, instance }, info) => {
  test.setTimeout(60_000);
  const installed=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});expect(installed.status()).toBe(200);
  await page.goto(`${instance.url}/admin/site`);
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  const brandAccentDescription = page.getByText('覆盖编译期品牌主色；用户选择的主题预设仍然优先。', { exact: true });
  await expect(brandAccentDescription).toBeVisible();
  const accentTextBounds = await brandAccentDescription.boundingBox();
  expect(accentTextBounds).not.toBeNull();
  expect(accentTextBounds!.width).toBeGreaterThanOrEqual(200);
  const light = page.getByRole('form', { name: '浅色 Logo', exact: true });
  const icon = page.getByRole('form', { name: '站点图标', exact: true });
  await light.locator('input[type="file"]').setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('PNG 或 JPEG');
  await light.locator('input[type="file"]').setInputFiles({ name: 'oversized.png', mimeType: 'image/png', buffer: Buffer.alloc(500 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('500 KB');
  const wide = wideLogo();
  const widePixels = PNG.sync.read(wide);
  expect(widePixels.width).toBe(1800);
  expect(widePixels.height).toBe(440);
  expect(widePixels.data[3]).toBe(0);
  expect(widePixels.data[(220 * widePixels.width + 20) * 4 + 3]).toBe(0);
  await light.locator('input[type="file"]').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: wide });
  await expect(light.getByText('待保存预览，点击保存后生效。')).toBeVisible();
  const originalLightPreview = light.getByRole('img', { name: '浅色 Logo待保存预览', exact: true });
  await expect(originalLightPreview).toHaveJSProperty('naturalWidth', 1800);
  await expect(originalLightPreview).toHaveJSProperty('naturalHeight', 440);
  await expect(page.locator('.sidebar .brand-image')).toHaveCount(0);
  await page.getByRole('tab', { name: '基础信息', exact: true }).click();
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  await expect(light.getByText('待保存预览，点击保存后生效。')).toBeVisible();
  await capture(page, info, 'brand-preview');
  await light.getByRole('button',{name:'取消预览'}).click();
  await expect(light.getByRole('button',{name:'保存浅色 Logo'})).toBeDisabled();
  await expect(page.locator('.sidebar .brand-image')).toHaveCount(0);
  await icon.locator('input[type="file"]').setInputFiles({ name: 'favicon.png', mimeType: 'image/png', buffer: variant(false) });
  const originalIconPreview = icon.getByRole('img', { name: '站点图标待保存预览', exact: true });
  await expect(originalIconPreview).toHaveJSProperty('naturalWidth', 128);
  await expect(originalIconPreview).toHaveJSProperty('naturalHeight', 128);
  await icon.getByRole('button', { name: '保存站点图标' }).click();
  await expect(page.getByText('图片已保存', { exact: true })).toBeVisible();
  const faviconSrc = await icon.getByRole('img', { name: '站点图标当前预览', exact: true }).getAttribute('src');
  expect(faviconSrc).toMatch(/^\/brand-assets\//);
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', /^\/brand-assets\//);
  await light.locator('input[type="file"]').setInputFiles({ name: 'square-brand.png', mimeType: 'image/png', buffer: variant(false) });
  await light.getByRole('button', { name: '保存浅色 Logo' }).click();
  await expect(page.getByText('图片已保存', { exact: true })).toBeVisible();
  await expectIconTitleBrand(page, info, 'light', 'Unicore', (await light.getByRole('img', { name: '浅色 Logo当前预览', exact: true }).getAttribute('src'))!);
  await light.locator('input[type="file"]').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: wide });
  await light.getByRole('button', { name: '保存浅色 Logo' }).click();
  await expect(page.getByText('图片已保存', { exact: true })).toBeVisible();
  const lightNormalizedRatio = await light.getByRole('img', { name: '浅色 Logo当前预览', exact: true }).evaluate(async (image: HTMLImageElement) => { await image.decode(); return image.naturalWidth / image.naturalHeight; });
  await expectIconTitleBrand(page, info, 'light', 'Unicore', (await light.getByRole('img', { name: '浅色 Logo当前预览', exact: true }).getAttribute('src'))!);
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await expectCollapsedBrand(page, info, 'Unicore');
    await page.getByRole('button', { name: '展开导航', exact: true }).click();
  }
  await page.getByRole('radio', { name: /完整字标/ }).click();
  await expect(light.locator('figure').filter({ hasText: '网站展示预览' }).locator('[data-brand-layout="wordmark"]')).toBeVisible();
  await page.getByRole('button', { name: '保存显示方式' }).click();
  await expect(page.getByText('显示方式已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expectWordmarkBrand(page, info, 'light', 'Unicore', lightNormalizedRatio);
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await light.scrollIntoViewIfNeeded();
    await saveBrandEvidence(page, info, 'wordmark-preview-panel');
    await brandAccentDescription.scrollIntoViewIfNeeded();
    await saveBrandEvidence(page, info, 'brand-accent-bottom');
  }
  const dark = page.getByRole('form', { name: '深色 Logo', exact: true });
  const vertical = verticalLogo();
  const verticalPixels = PNG.sync.read(vertical);
  expect(verticalPixels.width).toBe(640);
  expect(verticalPixels.height).toBe(820);
  expect(verticalPixels.data[3]).toBe(0);
  await dark.locator('input[type="file"]').setInputFiles({ name: 'vertical-brand.png', mimeType: 'image/png', buffer: vertical });
  const originalDarkPreview = dark.getByRole('img', { name: '深色 Logo待保存预览', exact: true });
  await expect(originalDarkPreview).toHaveJSProperty('naturalWidth', 640);
  await expect(originalDarkPreview).toHaveJSProperty('naturalHeight', 820);
  await dark.getByRole('button', { name: '保存深色 Logo' }).click();
  await expect(page.getByText('图片已保存', { exact: true })).toBeVisible();
  const darkNormalizedRatio = await dark.getByRole('img', { name: '深色 Logo当前预览', exact: true }).evaluate(async (image: HTMLImageElement) => { await image.decode(); return image.naturalWidth / image.naturalHeight; });
  await page.evaluate(() => { localStorage.setItem('unicore.preferences.v1',JSON.stringify({...JSON.parse(localStorage.getItem('unicore.preferences.v1')??'{}'),theme:'system'})); });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expectWordmarkBrand(page, info, 'dark', 'Unicore', darkNormalizedRatio);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('tab', { name: '基础信息', exact: true }).click();
  await page.getByLabel('站点名称', { exact: true }).fill('品牌工作空间');
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page).toHaveTitle('品牌工作空间 · 工作空间');
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  await page.getByRole('radio', { name: /图标 \+ 站点名称/ }).click();
  await page.getByRole('button', { name: '保存显示方式' }).click();
  await expect(page.getByText('显示方式已保存', { exact: true })).toBeVisible();
  await expect(page.getByText('显示方式已保存', { exact: true })).toBeHidden({ timeout: 6000 });
  await openBrandNavigation(page);
  const updatedBrand = page.locator('.sidebar [data-brand-header="icon-title"]');
  const brandName = updatedBrand.locator('a').nth(1);
  await expect(brandName).toHaveText('品牌工作空间');
  await expect(brandName).toHaveCSS('white-space', 'nowrap');
  await expect(brandName).toHaveCSS('text-overflow', 'ellipsis');
  expect((await brandName.boundingBox())!.width).toBeGreaterThan(32);
  await saveBrandEvidence(page, info, 'site-name-icon-title-expanded');
  if ((page.viewportSize()?.width ?? 0) < 768) await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: /完整字标/ }).click();
  await page.getByRole('button', { name: '保存显示方式' }).click();
  await expect(page.getByText('显示方式已保存', { exact: true })).toBeVisible();
  await expect(page.getByText('显示方式已保存', { exact: true })).toBeHidden({ timeout: 6000 });
  await page.reload();
  const manifest = await (await page.request.get(`${instance.url}/site.webmanifest`)).json();
  expect(manifest.name).toBe('品牌工作空间');expect(manifest.icons[0].src).toMatch(/^\/brand-assets\//);
  await capture(page, info, 'brand-site-saved');
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  await capture(page, info, 'brand-saved');
  await page.reload();
  await expect(page.locator('[data-page-skeleton]')).toHaveCount(0);
  await expect(light).toBeVisible();
  await expect(light.getByAltText('浅色 Logo当前预览')).toBeVisible();
  await page.evaluate(() => { localStorage.setItem('unicore.preferences.v1',JSON.stringify({...JSON.parse(localStorage.getItem('unicore.preferences.v1')??'{}'),theme:'system'})); });
  await page.reload();
  for (const colorScheme of ['dark','light'] as const) {
    await page.emulateMedia({colorScheme});
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    await expectWordmarkBrand(page, info, colorScheme, '品牌工作空间', colorScheme === 'dark' ? darkNormalizedRatio : lightNormalizedRatio);
  }
  await icon.getByRole('button', { name: '恢复默认', exact: true }).click();
  await icon.getByRole('button', { name: '确认恢复' }).click();
  await expect(page.getByText('已恢复默认', { exact: true })).toBeVisible();
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', '/favicon.svg');
  for (const [slot, name] of [[light, '浅色 Logo'], [dark, '深色 Logo']] as const) {await slot.getByRole('button', { name: '恢复默认', exact: true }).click();await slot.getByRole('button', { name: '确认恢复' }).click();}
  await expect(page.locator('.sidebar .brand-image')).toHaveCount(0);
  await capture(page, info, 'brand-restored');
});

test('brand upload accepts a compressed PNG above 16 megapixels', async ({ page, instance }) => {
  test.setTimeout(60_000);
  const installed = await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong' } });
  expect(installed.status()).toBe(200);
  await page.goto(`${instance.url}/admin/site`);
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  const form = page.getByRole('form', { name: '浅色 Logo', exact: true });
  const large = largeCompressedLogo();
  expect(large.length).toBeLessThan(500 * 1024);
  expect(large.readUInt32BE(16)).toBe(12228);
  expect(large.readUInt32BE(20)).toBe(2227);
  await form.locator('input[type="file"]').setInputFiles({ name: 'compressed-high-resolution.png', mimeType: 'image/png', buffer: large });
  await expect(form.getByText('待保存预览，点击保存后生效。')).toBeVisible({ timeout: 60000 });
  const original = form.getByRole('img', { name: '浅色 Logo待保存预览', exact: true });
  await expect(original).toHaveJSProperty('naturalWidth', 12228);
  await expect(original).toHaveJSProperty('naturalHeight', 2227);
  await form.getByRole('button', { name: '保存浅色 Logo' }).click();
  await expect(page.getByText('图片已保存', { exact: true })).toBeVisible({ timeout: 15000 });
  const saved = form.getByRole('img', { name: '浅色 Logo当前预览', exact: true });
  await expect(saved).toHaveAttribute('src', /^\/brand-assets\//);
  const savedURL = await saved.getAttribute('src');
  const assetResponse = await page.request.get(new URL(savedURL!, instance.url).toString());
  expect(assetResponse.status()).toBe(200);
  expect(assetResponse.headers()['content-type']).toContain('image/png');
  const assetBytes = await assetResponse.body();
  expect(assetBytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const decoded = await page.evaluate(async url => {
    const response = await fetch(url, { cache: 'no-store' });
    const bitmap = await createImageBitmap(await response.blob());
    const result = { status: response.status, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, savedURL!);
  expect(decoded.status).toBe(200);
  expect(decoded.width).toBeGreaterThan(0);
  expect(decoded.height).toBeGreaterThan(0);
  const normalized = await saved.evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight }));
  expect(normalized.width).toBeLessThanOrEqual(1024);
  expect(normalized.height).toBeLessThanOrEqual(1024);
  expect(normalized.width / normalized.height).toBeCloseTo(12228 / 2227, 1);
  await page.reload();
  await expect(page.locator('[data-page-skeleton]')).toHaveCount(0);
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  const reloadedLogo = page.getByRole('form', { name: '浅色 Logo', exact: true }).getByRole('img', { name: '浅色 Logo当前预览', exact: true });
  await expect(reloadedLogo).toHaveAttribute('src', savedURL!);
  await expect.poll(() => reloadedLogo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)).toBe(true);
});

test('platform login and all mail previews use public instance branding', async ({ page, instance }, info) => {
  test.setTimeout(60_000);
  const installed = await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: '品牌平台', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong' } });
  expect(installed.status()).toBe(200);
  await page.goto(`${instance.url}/admin/site`);
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  const form=page.getByRole('form',{name:'浅色 Logo',exact:true});
  await form.locator('input[type="file"]').setInputFiles({name:'custom.png',mimeType:'image/png',buffer:wideLogo()});
  await form.getByRole('button',{name:'保存浅色 Logo'}).click();
  await expect(page.getByText('图片已保存',{exact:true})).toBeVisible();
  const previewLogo=await form.getByRole('img', { name: '浅色 Logo当前预览', exact: true }).getAttribute('src');
  expect(previewLogo).toMatch(/^\/brand-assets\//);
  const normalizedLightRatio = await form.getByRole('img', { name: '浅色 Logo当前预览', exact: true }).evaluate(async (image: HTMLImageElement) => { await image.decode(); return image.naturalWidth / image.naturalHeight; });
  const darkForm=page.getByRole('form',{name:'深色 Logo',exact:true});
  await darkForm.locator('input[type="file"]').setInputFiles({name:'vertical.png',mimeType:'image/png',buffer:verticalLogo()});
  await darkForm.getByRole('button',{name:'保存深色 Logo'}).click();
  await expect(page.getByText('图片已保存',{exact:true})).toBeVisible();
  const normalizedDarkRatio = await darkForm.getByRole('img', { name: '深色 Logo当前预览', exact: true }).evaluate(async (image: HTMLImageElement) => { await image.decode(); return image.naturalWidth / image.naturalHeight; });
  await page.getByRole('radio', { name: /完整字标/ }).click();
  await expect(form.locator('figure').filter({ hasText: '网站展示预览' }).locator('[data-brand-layout="wordmark"]')).toBeVisible();
  await page.getByRole('button', { name: '保存显示方式' }).click();
  await expect(page.getByText('显示方式已保存', { exact: true })).toBeVisible();
  // Templates remain internal; render their generated HTML directly for visual regression.
  const templates=(await(await page.request.get(`${instance.url}/api/v1/admin/settings/mail/templates`,{headers:{}})).json()).data.items;
  const preview=await page.context().newPage();let mailLogo='';
  for(const template of templates){
    await preview.setContent(template.html);
    const image=preview.locator('img');await expect(image).toHaveAttribute('src',/^data:image\/png;base64,/);
    await image.evaluate((element: HTMLImageElement) => element.decode());
    await preview.evaluate(() => document.fonts.ready);
    const source=(await image.getAttribute('src'))!;if(!mailLogo)mailLogo=source;expect(source).toBe(mailLogo);
    const png=Buffer.from(source.split(',')[1],'base64');
    const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
    expect(width).toBeLessThanOrEqual(320);expect(height).toBeLessThanOrEqual(84);
    expect(width/height).toBeCloseTo(normalizedLightRatio,1);
    await expect(preview.getByRole('heading')).toBeVisible();
    const directory=`build/acceptance/m3b/${info.project.name}`;await mkdir(directory,{recursive:true});
    await preview.screenshot({path:`${directory}/mail-${template.purpose}.png`,fullPage:true});
  }
  await preview.close();
  await expect(page.getByRole('tab',{name:'邮件模板',exact:true})).toHaveCount(0);
  // A member sees public branding, while global brand management stays administrator-only.
  const bootstrap=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`,{headers:{}})).json()).data;
  const headers={'X-CSRF-Token':bootstrap.csrf_token};
  expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'reader',email:'reader@example.test',password:'test-password-strong',role:'user'}})).status()).toBe(200);
  await page.getByRole('button',{name:'账号菜单',exact:true}).click();
  const logout=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/auth/logout'));
  await page.getByRole('menuitem',{name:'退出登录',exact:true}).click();
  await logout;
  await page.evaluate(() => { localStorage.setItem('unicore.preferences.v1',JSON.stringify({...JSON.parse(localStorage.getItem('unicore.preferences.v1')??'{}'),theme:'system'})); });
  await page.goto(`${instance.url}/login`);
  await expect(page.getByRole('heading',{name:'登录 品牌平台',exact:true})).toBeVisible();
  await expect(page.locator('.flow-brand')).toBeVisible();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.flow-brand .instance-brand-light img')).toBeVisible();
  await expectLoginBrand(page, info, 'light', '品牌平台', normalizedLightRatio);
  await capture(page,info,'brand-login');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectLoginBrand(page, info, 'dark', '品牌平台', normalizedDarkRatio);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('账号或邮箱').fill('reader');await page.getByLabel('密码',{exact:true}).fill('test-password-strong');
  const src=await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');const answer=[...Buffer.from(src!.split(',')[1],'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(m=>m[1]).join('');await page.getByLabel('图形验证码',{exact:true}).fill(answer);await page.getByRole('button',{name:'登录工作空间'}).click();
  // Let login establish the session and finish its home navigation before leaving the page.
  await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
  await page.goto(`${instance.url}/notes`);
  await expect(page.getByRole('button',{name:'搜索',exact:true})).toBeVisible();
  await expectWordmarkBrand(page, info, 'light', '品牌平台', normalizedLightRatio);
  if ((page.viewportSize()?.width ?? 0) >= 768) await expectCollapsedBrand(page, info, '品牌平台');
  await page.goto(`${instance.url}/site`);
  // The management-flavoured site page no longer renders for members.
  await expect(page.getByRole('heading',{name:'没有访问权限',exact:true})).toBeVisible();
  expect((await page.request.get(`${instance.url}/api/v1/admin/branding`)).status()).toBe(403);
  // Personal theming rides the client-local appearance drawer instead.
  await page.getByRole('button',{name:'主题设置',exact:true}).click();
  await expect(page.getByText('仅保存在当前客户端')).toBeVisible();
  await capture(page,info,'brand-member-local-appearance');
});
