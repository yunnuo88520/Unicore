// Author: yunnuo <ymz@ebox.vip>
import { test, expect } from '@playwright/test';

test('real Go execution, themes and responsive layout', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '一份核心，无限可能.' })).toBeVisible();
  await page.getByLabel('输入文本').fill('hello world');
  await page.getByRole('button', { name: '运行用例' }).click();
  await expect(page.getByText('执行成功')).toBeVisible();
  await expect(page.locator('.result-grid strong').first()).toHaveText('11');
  await expect(page.locator('.digest code')).toHaveText('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  await page.getByRole('button', { name: '切换主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '外观设置', exact: true }).click();
  await page.getByRole('button', { name: /跟随系统.*自动匹配/ }).click();
  await expect(page.getByText('当前偏好：跟随系统 · 自动保存')).toBeVisible();
});

test('API returns JSON and unsupported features remain absent', async ({ request }) => {
  const bootstrap = await (await request.get('/api/v1/bootstrap')).json();
  expect(bootstrap.data.capabilities.authentication).toBe(false);
  for (const path of ['/api/v1/install/status', '/api/v1/admin/users', '/api/v1/admin/update/check']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect((await response.json()).code).toBe('NOT_FOUND');
  }
});
