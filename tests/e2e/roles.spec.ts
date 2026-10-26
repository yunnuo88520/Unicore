// Author: yunnuo <ymz@ebox.vip>
// Description: Real role editing/delegation, read-only access and revoked sessions at both viewports.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { capture } from './visual';

test('business roles, protected permissions, bounded creation and revocation', async ({ page, browser, instance }, info) => {
  test.setTimeout(60000);
  const install = await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong' } });
  expect(install.status()).toBe(200);
  await page.goto(instance.url);
  async function nav(target: Page, name: string) {
    if (info.project.name === 'mobile') await target.getByRole('button', { name: '打开导航' }).click();
    await target.getByRole('button', { name, exact: true }).click();
  }
  await nav(page, '角色权限');
  await expect(page.getByRole('heading', { name: '角色列表', exact: true })).toBeVisible();
  await capture(page, info, 'roles-overview');
  await page.getByRole('button', { name: /超级管理员.*内置/ }).click();
  await expect(page.getByText('内置角色不可修改或删除')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存角色', exact: true })).toHaveCount(0);
  await capture(page, info, 'roles-builtin');
  await page.getByRole('button', { name: '新增角色', exact: true }).click();
  await capture(page, info, 'role-create');
  await page.getByLabel('角色名称', { exact: true }).fill('客服团队');
  for (const name of ['查看用户', '创建用户']) await page.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
  const permission = page.getByRole('checkbox', { name: /^查看角色/ });
  await permission.focus(); await page.keyboard.press('Space'); await expect(permission).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^管理角色权限/ })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: /^管理用户身份/ })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: /^修改实例设置/ })).toBeDisabled();
  await page.getByRole('button', { name: '创建角色', exact: true }).click();
  await expect(page.getByText('角色已保存，关联用户的旧会话已撤销。')).toBeVisible();
  await capture(page, info, 'role-created');
  const bootstrap = (await (await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
  const headers = { 'X-CSRF-Token': bootstrap.csrf_token };
  const roles = (await (await page.request.get(`${instance.url}/api/v1/admin/roles`)).json()).data;
  const role = roles.items.find((item: { name: string }) => item.name === '客服团队');
  await page.getByRole('button', { name: '新增角色', exact: true }).click();
  await page.getByLabel('角色名称', { exact: true }).fill('客服团队');
  await page.getByRole('button', { name: '创建角色', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('角色名称已存在');
  await capture(page, info, 'role-duplicate');
  await page.getByRole('button', { name: '取消编辑', exact: true }).click();
  const stronger = await page.request.post(`${instance.url}/api/v1/admin/roles`, { headers, data: { name: '实例查看员', permissions: ['settings:read'] } });
  expect(stronger.status()).toBe(200); const strongerRole = (await stronger.json()).data;
  await nav(page, '用户管理');
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  await page.getByLabel('账号', { exact: true }).fill('operator');
  await page.getByLabel('邮箱', { exact: true }).fill('operator@example.test');
  await page.getByLabel('初始密码').fill('test-password-strong');
  await page.getByRole('combobox', { name: '角色', exact: true }).selectOption({ label: '客服团队' });
  await capture(page, info, 'role-user-create');
  await page.getByRole('button', { name: '创建用户', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'operator', exact: true })).toBeVisible();
  await capture(page, info, 'role-user-assigned');
  // Last-super-admin protection remains effective with dynamic business roles.
  const last = await page.request.patch(`${instance.url}/api/v1/admin/users/${bootstrap.current_user.id}`, { headers, data: { role: role.id, status: 'active' } });
  expect(last.status()).toBe(409); expect((await last.json()).code).toBe('LAST_SUPER_ADMIN');
  const memberContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile' });
  try {
    const member = await memberContext.newPage(); await member.goto(instance.url);
    await member.getByLabel('账号或邮箱').fill('operator');
    await member.getByLabel('密码', { exact: true }).fill('test-password-strong');
    const image = await member.getByAltText('六位数字验证码，点击刷新').getAttribute('src');
    const answer = [...Buffer.from(image!.split(',')[1], 'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match => match[1]).join('');
    await member.getByLabel('图形验证码', { exact: true }).fill(answer);
    await member.getByRole('button', { name: '登录工作空间' }).click();
    await expect(member.getByRole('heading', { name: '一份核心，无限可能.' })).toBeVisible();
    await nav(member, '角色权限');
    await member.getByRole('button', { name: /客服团队.*业务/ }).click();
    await expect(member.getByText('你可以查看此角色的权限')).toBeVisible();
    await expect(member.getByRole('button', { name: '新增角色', exact: true })).toHaveCount(0);
    await expect(member.getByRole('button', { name: '保存角色', exact: true })).toHaveCount(0);
    await capture(member, info, 'roles-readonly');
    const memberBootstrap = (await (await member.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
    const memberHeaders = { 'X-CSRF-Token': memberBootstrap.csrf_token };
    const denied = await member.request.post(`${instance.url}/api/v1/admin/roles`, { headers: memberHeaders, data: { name: '越权角色', permissions: [] } });
    expect(denied.status()).toBe(403);
    await nav(member, '用户管理');
    await member.getByRole('button', { name: '新增用户', exact: true }).click();
    const select = member.getByRole('combobox', { name: '角色', exact: true });
    await expect(select.getByRole('option', { name: '超级管理员', exact: true })).toHaveCount(0);
    await expect(select.getByRole('option', { name: '实例查看员', exact: true })).toHaveCount(0);
    await capture(member, info, 'role-bounded-options');
    for (const id of ['super_admin', strongerRole.id]) {
      const escalated = await member.request.post(`${instance.url}/api/v1/admin/users`, { headers: memberHeaders, data: { username: 'escalated', email: 'escalated@example.test', password: 'test-password-strong', role: id } });
      expect(escalated.status()).toBe(403);
    }
    await nav(page, '角色权限');
    await page.getByRole('button', { name: /客服团队.*业务/ }).click();
    await expect(page.getByRole('button', { name: '删除角色', exact: true })).toBeDisabled();
    const inUse = await page.request.delete(`${instance.url}/api/v1/admin/roles/${role.id}`, { headers });
    expect(inUse.status()).toBe(409); expect((await inUse.json()).code).toBe('ROLE_IN_USE');
    await page.getByLabel('角色名称', { exact: true }).fill('客服只读');
    await page.getByRole('checkbox', { name: /^创建用户/ }).uncheck();
    await page.getByRole('button', { name: '保存角色', exact: true }).click();
    await expect(page.getByText('角色已保存，关联用户的旧会话已撤销。')).toBeVisible();
    await capture(page, info, 'role-edit-assigned');
    expect((await member.request.get(`${instance.url}/api/v1/auth/session`)).status()).toBe(401);
    await member.getByLabel('搜索用户').fill('revoked'); await expect(member.getByRole('heading', { name: '登录 Unicore', exact: true })).toBeVisible();
    await capture(member, info, 'role-session-revoked');
  } finally { await memberContext.close(); }
  await nav(page, '用户管理');
  await Promise.all([page.waitForResponse(response => response.url().includes('/api/v1/admin/users/') && response.request().method() === 'PATCH' && response.status() === 200), page.getByLabel('operator 的角色', { exact: true }).selectOption('user')]);
  await expect(page.getByLabel('operator 的角色', { exact: true })).toHaveValue('user');
  await nav(page, '角色权限'); await page.getByRole('button', { name: /客服只读.*业务/ }).click();
  await page.getByRole('button', { name: '删除角色', exact: true }).click();
  await capture(page, info, 'role-delete-confirm');
  await page.getByRole('button', { name: '确认删除角色', exact: true }).click();
  await expect(page.getByText('角色已删除。')).toBeVisible();
  await expect(page.getByRole('button', { name: /客服只读.*业务/ })).toHaveCount(0);
  await capture(page, info, 'role-deleted');
});
