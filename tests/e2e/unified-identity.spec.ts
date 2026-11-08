// Author: yunnuo <ymz@ebox.vip>
// Description: Existing users receive multiple roles and share identity across real workspace surfaces.
import { test, expect, installPlatform, sdkClient, loginClient, workspaceLogin, navigate, memberPassword } from './fixtures';

test('one account uses business and management workspaces with multiple roles', async ({ page, instance }) => {
  test.setTimeout(90000);
  await installPlatform(instance);
  const owner = sdkClient(instance.url);
  await loginClient(owner, 'admin', 'administrator-password-strong');
  const role = await owner.createRole({ name: 'User reader', permissions: ['users:read', 'admin:access', 'notes:access'] });
  const member = await owner.createUser({ username: 'multirole', email: 'multi@example.test', password: memberPassword, role_ids: ['user', role.id] });
  expect(member.roles.slice().sort()).toEqual(['user', role.id].sort());
  await workspaceLogin(page, instance.url, member.username);
  const before = (await (await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
  expect(before.current_user.id).toBe(member.id);
  const note = await page.request.post(`${instance.url}/api/v1/notes`, { headers: { 'X-CSRF-Token': before.csrf_token }, data: { title: 'Shared personal note', body: 'Same owner', status: 'open', attachment_ids: [] } });
  expect(note.status()).toBe(200);
  await page.getByRole('button', { name: '账号菜单' }).click();
  await page.getByRole('menuitem', { name: '管理工作台', exact: true }).click();
  await expect(page).toHaveURL(/\/admin/);
  await navigate(page, '用户列表');
  await expect(page.getByRole('cell').filter({ has: page.getByText(member.username, { exact: true }) })).toBeVisible();
  const after = (await (await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;
  expect(after.current_user.id).toBe(member.id);
  const sharedNotes = await page.request.get(`${instance.url}/api/v1/admin/notes`);
  expect(sharedNotes.status()).toBe(200);
  expect((await sharedNotes.json()).data.items.some((item: { title: string }) => item.title === 'Shared personal note')).toBe(true);
  expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`, { headers: { 'X-CSRF-Token': after.csrf_token }, data: { changes: [{ key: 'site.name', value: 'Unauthorized' }] } })).status()).toBe(403);
  await owner.updateUser(member.id, { status: 'active', role_ids: ['user'] });
  expect((await page.request.get(`${instance.url}/api/v1/admin/users`)).status()).toBe(401);
});
