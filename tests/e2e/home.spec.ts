// Author: yunnuo <ymz@ebox.vip>
// Description: site.home_enabled gating: guests see the product homepage only when an administrator enables it; members always reach the workspace.
import { Buffer } from 'node:buffer';
import { test, expect } from './fixtures';

async function adminSession(context: import('@playwright/test').BrowserContext, instance: { url: string }) {
  const request = context.request;
  const captcha = (await (await request.get(`${instance.url}/api/v1/admin/auth/captcha`, { headers: {} })).json()).data;
  const answer = [...Buffer.from(captcha.image.split(',')[1], 'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match => match[1]).join('');
  const auth = await request.post(`${instance.url}/api/v1/admin/auth/login`, { headers: {}, data: { username: 'admin', password: 'test-password-strong', captcha_id: captcha.id, captcha_answer: answer } });
  expect(auth.status()).toBe(200);
  return (await auth.json()).data as { csrf_token: string };
}

test('product homepage follows site.home_enabled for guests and members', async ({ page, instance }, info) => {
  test.setTimeout(90000);
  await test.step('install web-platform instance', async () => {
    expect((await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong' } })).status()).toBe(200);
  });

  // Installation authenticates the owner in the shared account session.
  await page.context().clearCookies();
  await test.step('default off: guests see the login flow', async () => {
    await page.goto(`${instance.url}/`);
    await expect(page.getByRole('button', { name: '登录工作空间' })).toBeVisible();
    const bootstrap = await (await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json();
    expect(bootstrap.data.home_enabled).toBeFalsy();
  });

  const admin = await page.context().browser()!.newContext();
  try {
    let csrf = '';
    await test.step('enable via the settings API', async () => {
      const session = await adminSession(admin, instance);
      csrf = session.csrf_token;
      const patch = await admin.request.patch(`${instance.url}/api/v1/admin/settings`, { headers: { 'X-CSRF-Token': csrf }, data: { changes: [{ key: 'site.home_enabled', value: 'true' }] } });
      expect(patch.status()).toBe(200);
    });

    await test.step('guests land on the homepage at /home', async () => {
      await page.goto(`${instance.url}/`);
      await expect(page).toHaveURL(new RegExp(`${instance.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/home$`));
      await expect(page.getByRole('heading', { name: '一份核心， 运行于每个终端' })).toBeVisible();
      await expect(page.getByRole('button', { name: '免费注册' }).first()).toBeVisible();
      await page.getByRole('tab', { name: '备份' }).click();
      await expect(page.getByText('每日凌晨自动备份')).toBeVisible();
      await page.screenshot({ path: `build/acceptance/home/${info.project.name}/homepage.png`, fullPage: true });
    });

    await test.step('homepage links into the register flow', async () => {
      await page.getByRole('button', { name: '免费注册' }).first().click();
      await expect(page.getByRole('heading', { name: '创建账号', exact: true })).toBeVisible();
    });

    await test.step('members skip the homepage and /home returns to the console', async () => {
      const session = await adminSession(admin, instance);
      const create = await admin.request.post(`${instance.url}/api/v1/admin/users`, { headers: { 'X-CSRF-Token': session.csrf_token }, data: { username: 'member', email: 'member@example.test', password: 'test-password-strong', role: 'user' } });
      if (create.status() !== 200 && create.status() !== 409) throw new Error(`member create failed: ${create.status()}`);
      const challenge = (await (await page.request.get(`${instance.url}/api/v1/auth/captcha`)).json()).data;
      const answer = [...Buffer.from(challenge.image.split(',')[1], 'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match => match[1]).join('');
      expect((await page.request.post(`${instance.url}/api/v1/auth/login`, { data: { username: 'member', password: 'test-password-strong', captcha_id: challenge.id, captcha_answer: answer } })).status()).toBe(200);
      await page.goto(`${instance.url}/`);
      await expect(page.getByRole('heading', { name: '工作台概览' })).toBeVisible();
      await page.goto(`${instance.url}/home`);
      await expect(page).toHaveURL(new RegExp(`${instance.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/$`));
      await expect(page.getByRole('heading', { name: '工作台概览' })).toBeVisible();
    });

    await test.step('switch back off restores login-first', async () => {
      const session = await adminSession(admin, instance);
      const revert = await admin.request.patch(`${instance.url}/api/v1/admin/settings`, { headers: { 'X-CSRF-Token': session.csrf_token }, data: { changes: [{ key: 'site.home_enabled', value: 'false' }] } });
      expect(revert.status()).toBe(200);
    });
  } finally {
    await admin.close();
  }

  await test.step('guests see login again', async () => {
    const guest = await page.context().browser()!.newPage();
    try {
      await guest.goto(`${instance.url}/`);
      await expect(guest.getByRole('button', { name: '登录工作空间' })).toBeVisible();
    } finally {
      await guest.close();
    }
  });
});
