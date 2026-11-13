// Author: yunnuo <ymz@ebox.vip>
// Description: Default public homepage, member access, real registration policy and reduced-motion navigation.
import { mkdir } from 'node:fs/promises';
import { test, expect, installPlatform, sdkClient, loginClient, workspaceLogin, memberPassword } from './fixtures';

test('public homepage remains accessible before and after login', async ({ page, instance }, info) => {
  await installPlatform(instance);
  const admin = sdkClient(instance.url);
  await loginClient(admin, 'admin', 'administrator-password-strong');
  await admin.bootstrap();
  const member = await admin.createUser({ username: 'homepage-member', email: 'home@example.test', password: memberPassword, role: 'user' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(instance.url);
  await expect(page).toHaveURL(`${instance.url}/home`);
  await expect(page.getByRole('heading', { name: '一份核心，多种工作方式', exact: true })).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/127\.0\.0\.|localhost|0\.0\.0\.0|200 OK|1129|23ms/);
  await expect(page.getByRole('link', { name: '创建账号', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '单机', exact: true }).click();
  await expect(page.getByRole('heading', { name: '把专注留给自己的工作' })).toBeVisible();
  await page.getByRole('tab', { name: '单机', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: '让工具融入现有流程' })).toBeVisible();
  if (info.project.name === 'mobile') {
    const opener = page.getByRole('button', { name: '打开导航', exact: true });
    await opener.click();
    await expect(page.locator('#home-mobile-nav').getByRole('link', { name: '登录工作空间' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await expect(page.locator('#home-mobile-nav')).toHaveCount(0);
  }
  const directory = `build/acceptance/public-entry/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.getByRole('tab', { name: '多用户平台', exact: true }).click();
  await page.screenshot({ path: `${directory}/home-zh.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await admin.call('adminPatchSettings', { changes: [{ key: 'account.registration_enabled', value: 'true' }] });
  await page.reload();
  await page.getByRole('link', { name: '创建账号', exact: true }).click();
  await expect(page.getByRole('heading', { name: '创建账号', exact: true })).toBeVisible();
  await workspaceLogin(page, instance.url, member.username);
  await page.goto(`${instance.url}/home`);
  await expect(page).toHaveURL(`${instance.url}/home`);
  await expect(page.getByRole('link', { name: '进入工作空间' }).first()).toBeVisible();
  await page.getByRole('link', { name: '进入工作空间' }).last().click();
  await expect(page.getByRole('heading', { name: '工作台概览', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '产品首页', exact: true }).click();
  await expect(page).toHaveURL(`${instance.url}/home`);
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'One core, many ways to work', exact: true })).toBeVisible();
  await page.screenshot({ path: `${directory}/home-en-dark.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await admin.call('adminPatchSettings', { changes: [{ key: 'site.home_enabled', value: 'false' }] });
  await page.goto(`${instance.url}/home`);
  await expect(page).toHaveURL(`${instance.url}/`);
  await page.context().clearCookies();
  await page.goto(`${instance.url}/home`);
  await expect(page.getByRole('button', { name: 'Sign in to workspace', exact: true })).toBeVisible();
});
