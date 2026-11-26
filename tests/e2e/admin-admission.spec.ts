// Author: yunnuo <ymz@ebox.vip>
// Description: Management workspace admission is separate from user sessions and API grants.
import { type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { test, expect, installPlatform, sdkClient, loginClient, captchaAnswer, memberPassword } from './fixtures';

async function submitLogin(page: Page, username: string, password: string) {
  await page.getByLabel('账号或邮箱').fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  const image = await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');
  await page.getByLabel('图形验证码', { exact: true }).fill(captchaAnswer(image!));
  const response = page.waitForResponse(result => result.request().method() === 'POST' && new URL(result.url()).pathname.endsWith('/auth/login'));
  await page.getByRole('button', { name: '登录工作空间', exact: true }).click();
  return response;
}

test('administrator login requires management access and preserves the user workspace session', async ({ page, instance }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  const directory = `build/acceptance/workspace-polish/admin-admission/${info.project.name}`;
  await mkdir(directory, { recursive: true });

  const owner = sdkClient(instance.url);
  await loginClient(owner, 'admin', 'administrator-password-strong');
  const role = await owner.createRole({
    name: 'Delegated management entry',
    realm: 'user',
    permissions: ['admin:access'],
    menu_ids: ['overview'],
    action_ids: [],
    operation_ids: [],
  });
  const ordinary = await owner.createUser({ username: 'admission-member', email: 'admission-member@example.test', password: memberPassword, role_ids: ['user'] });
  const manager = await owner.createUser({ username: 'admission-manager', email: 'admission-manager@example.test', password: memberPassword, role_ids: [role.id] });

  await page.goto(`${instance.url}/admin`);
  await expect(page.getByRole('heading', { name: /管理员登录/ })).toBeVisible();
  const denied = await submitLogin(page, ordinary.username, memberPassword);
  expect(denied.status()).toBe(403);
  await expect(page.getByRole('heading', { name: /管理员登录/ })).toBeVisible();
  const rejection = page.getByRole('alert', { name: '表单校验', exact: true });
  await expect(rejection).toHaveText('此账号没有管理工作台访问权限，请从用户入口登录。');
  await expect(page.getByRole('alert').filter({ hasText: '此账号没有管理工作台访问权限' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: '前往用户登录' })).toHaveAttribute('href', '/login');
  await expect(page).toHaveURL(`${instance.url}/admin`);
  await page.screenshot({ path: `${directory}/ordinary-account-rejected.png`, fullPage: true, animations: 'disabled' });
  await expect(page.getByRole('heading', { name: '工作台概览', exact: true })).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto(`${instance.url}/login`);
  const userLogin = await submitLogin(page, ordinary.username, memberPassword);
  expect(userLogin.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '工作台概览', exact: true })).toBeVisible();
  await expect(page).toHaveURL(`${instance.url}/`);
  const userSession = (await (await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data.current_user.id;
  expect(userSession).toBe(ordinary.id);

  await page.goto(`${instance.url}/admin`);
  await expect(page.getByRole('heading', { name: /管理员登录/ }).or(page.getByRole('heading', { name: '没有访问权限', exact: true }))).toBeVisible();
  await expect(page.getByRole('heading', { name: '工作台概览', exact: true })).toHaveCount(0);
  await page.goto(`${instance.url}/`);
  await expect(page.getByRole('heading', { name: '工作台概览', exact: true })).toBeVisible();
  const restoredUser = (await (await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data.current_user.id;
  expect(restoredUser).toBe(userSession);

  await page.context().clearCookies();
  await page.goto(`${instance.url}/admin`);
  const admitted = await submitLogin(page, manager.username, memberPassword);
  expect(admitted.status()).toBe(200);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { name: '工作台概览', exact: true })).toBeVisible();
  const adminBootstrap = (await (await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;
  expect(adminBootstrap.identity_realm).toBe('administrator');
  expect(adminBootstrap.current_user.id).toBe(manager.id);
  await expect(page.locator('[data-page-skeleton]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '运行状态', exact: true })).toBeVisible();
  await page.screenshot({ path: `${directory}/delegated-manager-admitted.png`, fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
