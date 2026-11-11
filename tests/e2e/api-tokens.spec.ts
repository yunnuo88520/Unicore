// Author: yunnuo <ymz@ebox.vip>
// Description: Real credential UI, Bearer scoping and revocation on both viewport projects.
import { test, expect, installPlatform, adminLogin } from './fixtures';
import { BearerTransport } from '../../packages/sdk/src';

test.use({ trace: 'off' }); // One-time credentials must not enter persisted browser traces.
test('personal API tokens are scoped, shown once and revocable', async ({ page, instance }) => {
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await page.goto(`${instance.url}/admin/account-security`);
  await page.getByRole('button', { name: '创建访问令牌', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '创建访问令牌', exact: true });
  await dialog.getByLabel('令牌名称', { exact: true }).fill('Browser API reader');
  await dialog.getByRole('checkbox', { name: 'listNotes', exact: true }).check();
  await dialog.getByRole('button', { name: '生成令牌', exact: true }).click();
  const secret = dialog.getByLabel('新访问令牌', { exact: true });
  await expect(secret).toBeVisible();
  const token = await secret.inputValue();
  expect(token.startsWith('ucp_')).toBe(true);
  const client = new BearerTransport(instance.url, token);
  await expect(client.call('listNotes')).resolves.toMatchObject({ total: 0 });
  await expect(client.call('createNote', { title: 'not allowed', body: '', status: 'open' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Browser API reader', { exact: true })).toBeVisible();
  expect(await page.locator('input').evaluateAll(elements => elements.some(element => (element as HTMLInputElement).value.startsWith('ucp_')))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '撤销令牌', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: '撤销令牌', exact: true });
  await confirm.getByRole('button', { name: '确认撤销', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(client.call('listNotes')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  await expect(page.getByRole('button', { name: '账号菜单', exact: true })).toBeVisible();
});
