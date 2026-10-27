// Author: yunnuo <ymz@ebox.vip>
import { test, expect, installStandalone } from './fixtures';

test('real Go execution, themes and responsive layout', async ({ page, instance }, testInfo) => {
  await installStandalone(instance);
  await page.goto(instance.url);
  await expect(page.getByRole('button', { name: '账号菜单', exact: true })).toHaveCount(0);
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
  await page.getByRole('button', { name: '基础设置', exact: true }).click();
  await page.getByRole('tab', { name: '外观设置', exact: true }).click();
  await page.getByRole('button', { name: /跟随系统.*自动匹配/ }).click();
  const saveButton = page.getByRole('button', { name: '保存设置', exact: true });
  const beforeSave = await saveButton.boundingBox();
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByText('设置已保存', { exact: true })).toBeVisible();
  const afterSave = await saveButton.boundingBox();
  expect(afterSave!.x).toBe(beforeSave!.x); expect(afterSave!.width).toBe(beforeSave!.width);
  expect((await page.locator('.message-success').boundingBox())!.y).toBeLessThan(40);
  await expect(page.locator('.message-success')).toHaveCSS('opacity','1');
  await page.screenshot({path:`build/acceptance/management/${testInfo.project.name}/settings-message.png`});
  await expect(page.getByText('设置已保存', { exact: true })).toHaveCount(0, {timeout:4500});
  await page.getByRole('tab', { name: '基础信息', exact: true }).click();
  await page.getByLabel('站点名称', { exact: true }).fill('');
  await saveButton.click();
  await expect(page.locator('.message-error')).toBeVisible();
  expect((await page.locator('.message-error').boundingBox())!.y).toBeLessThan(40);
  await expect(page.locator('.message-error')).toHaveCount(0, {timeout:4500});
  expect(await page.evaluate(() => localStorage.getItem('unicore.theme'))).toBe('system');
  await page.goto(`${instance.url}/#settings`);
  await expect(page.getByRole('tab', { name: '外观设置', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('API returns JSON and unsupported features remain absent', async ({ instance, page }) => {
  await installStandalone(instance);
  await page.goto(`${instance.url}/#account`);
  await expect(page.getByText('没有访问权限', {exact:true})).toBeVisible();
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
  const removed = await request.post('/api/v1/admin/roles', { data: {} });
  expect(removed.status()).toBe(405);
  expect((await removed.json()).code).toBe('METHOD_NOT_ALLOWED');
});
