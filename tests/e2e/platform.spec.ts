// Author: yunnuo <ymz@ebox.vip>
import { test, expect, installStandalone } from './fixtures';
import { capture } from './visual';

test('first-install platform wizard, users, settings, logout and captcha login', async ({ page, instance }, info) => {
  await page.goto(instance.url);
  await expect(page).toHaveURL(/\/install$/);
  await capture(page, info, 'install-credential');
  await page.getByLabel('一次性安装凭据').fill(instance.token);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('radio', { name: /多用户平台/ }).check();
  await capture(page, info, 'install-profile');
  await page.getByRole('button', { name: '下一步' }).click();
  await capture(page, info, 'install-database');
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText('连接测试成功')).toBeVisible();
  await page.getByRole('button', { name: '下一步' }).click();
  await capture(page, info, 'install-admin');
  await page.getByLabel('管理员账号').fill('admin');
  await page.getByLabel('管理员邮箱').fill('admin@example.test');
  await page.getByLabel('管理员密码').fill('test-password-strong');
  await page.getByRole('button', { name: '下一步' }).click();
  await capture(page, info, 'install-confirm');
  await page.getByRole('button', { name: '完成安装' }).click();
  await expect(page.getByRole('heading', { name: '安装完成', exact: true })).toBeVisible();
  await capture(page, info, 'install-complete');
  await page.getByRole('button', { name: '进入工作空间' }).click();
  async function nav(name: string) { if (info.project.name === 'mobile') await page.getByRole('button', { name: '打开导航' }).click(); await page.getByRole('button', { name, exact: true }).click(); }
  for (const [name, slug] of [['工作台概览', 'overview'], ['核心实验室', 'lab'], ['外观设置', 'appearance'], ['平台仪表盘', 'dashboard']] as const) {
    await nav(name); await capture(page, info, slug);
  }
  await page.getByRole('button', { name: '关于 Unicore', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await capture(page, info, 'about');
  await page.getByRole('button', { name: '关闭关于' }).click();
  await nav('用户管理'); await capture(page, info, 'users');
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  await capture(page, info, 'user-create');
  await page.getByLabel('账号', { exact: true }).fill('member');
  await page.getByLabel('邮箱', { exact: true }).fill('member@example.test');
  await page.getByLabel('初始密码').fill('test-password-strong');
  await page.getByRole('button', { name: '创建用户', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'member', exact: true })).toBeVisible();
  await nav('实例设置');
  await capture(page, info, 'site-settings');
  await page.getByLabel('站点名称').fill('My Unicore');
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.getByText('设置已保存')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await nav('退出登录');
  await expect(page.getByRole('heading', { name: '登录 My Unicore' })).toBeVisible();
  await page.getByLabel('账号或邮箱').fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('test-password-strong');
  const image = await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');
  const answer = [...Buffer.from(image!.split(',')[1], 'base64').toString('utf8').matchAll(/>([0-9])<\/text>/g)].map(match => match[1]).join('');
  await page.getByLabel('图形验证码', { exact: true }).fill(answer);
  await page.getByRole('button', { name: '登录工作空间' }).click();
  await expect(page.getByRole('heading', { name: '一份核心，无限可能.' })).toBeVisible();
});

test('standalone has no administrator and settings persist after reload', async ({ page, instance }, info) => {
  await installStandalone(instance);
  await page.goto(instance.url);
  if (info.project.name === 'mobile') await page.getByRole('button', { name: '打开导航' }).click();
  await expect(page.getByRole('button', { name: '用户管理', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '实例设置', exact: true }).click();
  await page.getByLabel('站点名称').fill('Local saved');
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.getByText('设置已保存')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('站点名称')).toHaveValue('Local saved');
});
