// Author: yunnuo <ymz@ebox.vip>
// Description: Real role-bound tokens, owner/admin workflows and bounded dialogs at desktop and 375px.
import { test, expect, installPlatform, adminLogin, sdkClient, loginClient, workspaceLogin, memberPassword, navigate } from './fixtures';
import { BearerTransport } from '../../packages/sdk/src';

test.use({ trace: 'off' }); // One-time credentials must not enter persisted browser traces.
test('role-bound personal tokens support issuance, renewal and global revocation', async ({ page, instance }) => {
  test.setTimeout(90000);
  await installPlatform(instance);
  const admin = sdkClient(instance.url);
  await loginClient(admin, 'admin', 'administrator-password-strong');
  const reader = await admin.createRole({ name: 'API reader', permissions: ['notes:access'], operation_ids: ['listNotes'], menu_ids: [], action_ids: [], data_scope: 'self' });
  const member = await admin.createUser({ username: 'automation-user', email: 'automation@example.test', password: memberPassword, role_ids: ['user', reader.id] });
  await workspaceLogin(page, instance.url, member.username);
  await navigate(page, '访问令牌');
  const opener = page.getByRole('button', { name: '创建访问令牌', exact: true });
  await opener.click();
  let dialog = page.getByRole('dialog', { name: '创建访问令牌', exact: true });
  await expect(dialog.getByLabel('令牌名称', { exact: true })).toBeFocused();
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await dialog.getByLabel('令牌名称', { exact: true }).fill('Browser API reader');
  await dialog.getByRole('combobox', { name: '绑定角色', exact: true }).click();
  await page.getByRole('option', { name: reader.name, exact: true }).click();
  await dialog.getByRole('combobox', { name: '有效期', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(5);
  await page.getByRole('option', { name: '永久', exact: true }).click();
  await dialog.getByLabel('备注', { exact: true }).fill('Nightly export');
  const geometry = await dialog.evaluate(element => {
    const r = element.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, viewport: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.overflow).toBe(false);
  await dialog.getByRole('button', { name: '生成令牌', exact: true }).click();
  const secret = dialog.getByLabel('新访问令牌', { exact: true });
  await expect(secret).toBeVisible();
  const client = new BearerTransport(instance.url, await secret.inputValue());
  await expect(client.call('listNotes')).resolves.toMatchObject({ total: 0 });
  await expect(client.call('createNote', { title: 'not allowed', body: '', status: 'open' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect(opener).toBeFocused();
  await page.reload();
  const row = page.getByRole('row', { name: /Browser API reader/ });
  await expect(row.getByText('API reader', { exact: true })).toBeVisible();
  await expect(row.getByText('永久', { exact: true })).toBeVisible();
  await expect(row.getByText('Nightly export', { exact: true })).toBeVisible();
  expect(await page.locator('input').evaluateAll(elements => elements.some(element => (element as HTMLInputElement).value.startsWith('ucp_')))).toBe(false);
  await row.getByRole('button', { name: '续期', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '续期访问令牌', exact: true });
  await dialog.getByRole('combobox', { name: '有效期', exact: true }).click();
  await page.getByRole('option', { name: '7 天', exact: true }).click();
  await dialog.getByRole('button', { name: '确认续期', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.getByText('永久', { exact: true })).toHaveCount(0);
  await expect(client.call('listNotes')).resolves.toMatchObject({ total: 0 });

  await page.context().clearCookies();
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await navigate(page, '访问令牌管理');
  await expect(page.getByRole('row', { name: /Browser API reader/ })).toContainText(member.username);
  await page.getByRole('button', { name: '创建访问令牌', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '创建访问令牌', exact: true });
  await dialog.getByRole('textbox', { name: '搜索用户', exact: true }).fill(member.username);
  await dialog.getByRole('button', { name: `${member.username} · ${member.email}`, exact: true }).click();
  await dialog.getByLabel('令牌名称', { exact: true }).fill('Issued by administrator');
  await dialog.getByRole('combobox', { name: '绑定角色', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(2);
  await page.getByRole('option', { name: reader.name, exact: true }).click();
  await dialog.getByLabel('备注', { exact: true }).fill('Delegated export');
  // Long editor content scrolls inside the modal without making the page taller.
  const scroll = await dialog.evaluate(element => {
    const body = element.querySelector<HTMLElement>('[data-autofocus-scope]')!;
    const pageHeight = document.documentElement.scrollHeight;
    body.scrollTop = 100000;
    const first = body.scrollTop;
    body.scrollTop = 100000;
    const r = element.getBoundingClientRect();
    return { first, second: body.scrollTop, max: body.scrollHeight - body.clientHeight, pageHeight, after: document.documentElement.scrollHeight, top: r.top, bottom: r.bottom, height: innerHeight };
  });
  expect(scroll.second).toBe(scroll.first);
  expect(scroll.second).toBeLessThanOrEqual(scroll.max + 1);
  expect(scroll.after).toBe(scroll.pageHeight);
  expect(scroll.top).toBeGreaterThanOrEqual(0);
  expect(scroll.bottom).toBeLessThanOrEqual(scroll.height);
  await dialog.getByRole('button', { name: '生成令牌', exact: true }).click();
  await expect(dialog.getByLabel('新访问令牌', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('row', { name: /Browser API reader/ }).getByRole('button', { name: '作废', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: '作废访问令牌', exact: true });
  await confirm.getByRole('button', { name: '确认作废', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(client.call('listNotes')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  await expect(page.getByRole('row', { name: /Browser API reader/ }).getByRole('button', { name: '续期', exact: true })).toBeDisabled();
  // The same real management page renders translated forms with a small viewport.
  await page.evaluate(() => {
    const key = 'unicore.preferences.v1';
    const preferences = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...preferences, locale: 'en' }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Create access token', exact: true }).click();
  const english = page.getByRole('dialog', { name: 'Create access token', exact: true });
  await expect(english.getByRole('textbox', { name: 'Search users', exact: true })).toBeVisible();
  expect(await english.innerText()).not.toMatch(/[\u4e00-\u9fff]/);
  await page.keyboard.press('Escape');
  await expect(english).toHaveCount(0);
});
