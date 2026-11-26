// Author: yunnuo <ymz@ebox.vip>
// Description: Real route chunk delays preserve route-specific page skeleton layouts on desktop and mobile.
import { mkdir } from 'node:fs/promises';
import { test, expect, installPlatform, installStandalone, adminLogin, navigate } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';

async function holdChunk(page: Page, name: string) {
  const pattern = `**/assets/${name}-*.js`;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending: Promise<void>[] = [];
  await page.route(pattern, route => {
    const request = (async () => { await gate; await route.continue(); })();
    pending.push(request);
    return request;
  });
  return async () => {
    release();
    await Promise.all(pending);
    await page.unroute(pattern);
  };
}

async function expectSkeleton(page: Page, info: TestInfo, name: string, variant: string, region: string) {
  const skeleton = page.locator(`[data-page-skeleton="${variant}"]`);
  await expect(skeleton).toBeVisible();
  await expect(skeleton.locator(`[data-skeleton-region="${region}"]`)).toBeVisible();
  expect(await page.locator('h1').count()).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const directory = `build/acceptance/workspace-polish/page-skeleton/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
}

test('admin user list shows its skeleton while the route chunk loads', async ({ page, instance }, info) => {
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 375, height: 812 } : { width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const release = await holdChunk(page, 'users');
  await navigate(page, '用户列表');
  await expectSkeleton(page, info, 'admin-users-list', 'list', 'list-table');
  await release();
  await expect(page.locator('[data-page-skeleton]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '用户列表', exact: true })).toBeVisible();
});

test('standalone notes show card skeleton while the route chunk loads', async ({ page, instance }, info) => {
  await installStandalone(instance);
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 375, height: 812 } : { width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const release = await holdChunk(page, 'notes');
  await page.goto(`${instance.url}/notes`);
  await expectSkeleton(page, info, 'standalone-notes-cards', 'cards', 'card-grid');
  await release();
  await expect(page.locator('[data-page-skeleton]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '我的笔记', exact: true })).toBeVisible();
});

test('admin site settings show form skeleton while the route chunk loads', async ({ page, instance }, info) => {
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 375, height: 812 } : { width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const release = await holdChunk(page, 'appearance');
  await navigate(page, '基础设置');
  await expectSkeleton(page, info, 'admin-site-form', 'form', 'form-fields');
  await release();
  await expect(page.locator('[data-page-skeleton]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '基础设置', exact: true })).toBeVisible();
});
