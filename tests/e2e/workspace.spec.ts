// Author: yunnuo <ymz@ebox.vip>
import { test, expect, installStandalone } from './fixtures';

test('workspace navigation, themes and responsive layout', async ({ page, instance }, testInfo) => {
  await installStandalone(instance);
  await page.goto(instance.url);
  await expect(page.getByRole('button', { name: '账号菜单', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '工作台概览' })).toBeVisible();
  for (const path of ['/lab', '/files', '/users', '/site', '/storage', '/mail', '/monitor-services', '/login', '/home']) {
    await page.goto(`${instance.url}${path}`);
    await expect(page.getByRole('heading', { name: '页面不存在', exact: true })).toBeVisible();
    await expect(page.getByText(/管理员|平台|权限/)).toHaveCount(0);
  }
  await page.goto(instance.url);
  await page.getByRole('button', { name: '切换主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.sidebar-utilities')).toHaveCount(0);
  await page.getByRole('button', { name: '主题设置', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.locator('.preference-theme').getByRole('button', { name: '跟随系统', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('unicore.theme'))).toBe('system');
  await page.goto(`${instance.url}/site`);
  await expect(page.getByRole('heading', { name: '页面不存在', exact: true })).toBeVisible();

});

test('API returns JSON and unsupported features remain absent', async ({ instance, page }) => {
  await installStandalone(instance);
  await page.goto(`${instance.url}/account`);
  await expect(page.getByRole('heading', { name: '页面不存在', exact: true })).toBeVisible();
  await expect(page.getByRole('button', {name:'账号安全',exact:true})).toHaveCount(0);
  const request = instance.request;
  const bootstrap = await (await request.get('/api/v1/bootstrap')).json();
  expect(bootstrap.data.capabilities.authentication).toBe(false);
  for (const path of ['/api/v1/auth/oidc', '/api/v1/account/oidc', '/api/v1/admin/users', '/api/v1/admin/roles', '/api/v1/admin/users/role-options', '/api/v1/admin/update/check', '/api/v1/auth/policy', '/api/v1/admin/settings/mail/jobs']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect((await response.json()).code).toBe('NOT_FOUND');
  }
  for (const path of ['/api/v1/auth/oidc/start', '/api/v1/account/oidc/link', '/api/v1/account/oidc/unlink', '/api/v1/admin/settings/oidc/check', '/api/v1/auth/register', '/api/v1/auth/verification/request', '/api/v1/auth/verification/complete', '/api/v1/auth/password/request', '/api/v1/auth/password/reset', '/api/v1/admin/settings/mail/test']) {
    const response = await request.post(path, { data: {} });
    expect(response.status()).toBe(404);
    expect((await response.json()).code).toBe('NOT_FOUND');
  }
  // Standalone does not assemble platform APIs at all (ADR-0016), so the
  // role management surface is simply absent (ADR-0033 lives on web-platform).
  const rolesApi = await request.post('/api/v1/admin/roles', { data: {} });
  expect(rolesApi.status()).toBe(404);
  expect((await rolesApi.json()).code).toBe('NOT_FOUND');
});
