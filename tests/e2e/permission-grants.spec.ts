// Author: yunnuo <ymz@ebox.vip>
// Description: Real-backend regressions for management, API-only, explicit button revocation and atomic menu assignment.
import { test, expect, installPlatform, sdkClient, loginClient, workspaceLogin, adminLogin, memberPassword, chooseOption } from './fixtures';
import { operations } from '../../packages/contracts/src/operations.gen';

for (const change of ['role save', 'menu assignment'] as const) {
  test(`${change} invalidates an open role snapshot with 409 and preserves the draft`, async ({ page, instance }, info) => {
    test.setTimeout(90000);
    await installPlatform(instance);
    const owner = sdkClient(instance.url);
    await loginClient(owner, 'admin', 'administrator-password-strong');
    const role = await owner.createRole({ name: 'Snapshot reader', permissions: ['notes:access'], menu_ids: [], action_ids: [], operation_ids: ['listNotes'] });
    expect(role.version).toBeGreaterThan(0);
    // The shared create/update input allows omission for creates only.
    await expect(owner.updateRole(role.id, { name: role.name, permissions: role.permissions })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect((await owner.roles()).items.find(item => item.id === role.id)?.version).toBe(role.version);
    await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
    await page.goto(`${instance.url}/admin/roles`);
    await page.getByRole('button', { name: '编辑角色 Snapshot reader', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑角色', exact: true });
    await dialog.getByLabel('角色名称', { exact: true }).fill('Unsaved snapshot draft');
    if (change === 'role save') {
      await owner.updateRole(role.id, { version: role.version, name: 'Latest reader', permissions: role.permissions });
    } else {
      const config = await owner.menuConfig();
      const expected = (await owner.roles()).items.filter(item => item.id !== 'super_admin' && item.menu_ids.includes('users')).map(item => item.id);
      await owner.assignMenuRoles('users', { version: config.version, expected_role_ids: expected, role_ids: [...expected, role.id] });
    }
    const latest = (await owner.roles()).items.find(item => item.id === role.id)!;
    expect(latest.version).toBeGreaterThan(role.version);
    const response = page.waitForResponse(response => response.request().method() === operations.updateRole.method && new URL(response.url()).pathname === operations.updateRole.path.replace('{id}', role.id));
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    expect((await response).status()).toBe(409);
    await expect(dialog.getByText('角色已被修改，草稿已保留。请刷新最新角色并重新确认后保存。', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('角色名称', { exact: true })).toHaveValue('Unsaved snapshot draft');
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    expect((await owner.roles()).items.find(item => item.id === role.id)).toEqual(latest);
    await page.screenshot({ path: info.outputPath('stale-role-conflict.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Refresh is explicit, confirmed, and must not replay the rejected update.
    await dialog.getByRole('button', { name: '刷新角色并重新确认', exact: true }).click();
    await page.getByRole('alertdialog', { name: '刷新角色并重新确认', exact: true }).getByRole('button', { name: '确认刷新', exact: true }).click();
    await expect(dialog.getByLabel('角色名称', { exact: true })).toHaveValue(latest.name);
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    expect((await owner.roles()).items.find(item => item.id === role.id)).toEqual(latest);
    await dialog.getByLabel('角色名称', { exact: true }).fill('Confirmed reader');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const confirmed = (await owner.roles()).items.find(item => item.id === role.id)!;
    expect(confirmed.name).toBe('Confirmed reader');
    expect(confirmed.version).toBeGreaterThan(latest.version);
    expect(confirmed.menu_ids).toEqual(latest.menu_ids);
    expect(confirmed.operation_ids).toEqual(latest.operation_ids);
  });
}

test('builtin user scope is read-only while its copy can select a custom scope', async ({ page, instance }, info) => {
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await page.goto(`${instance.url}/admin/roles`);
  await page.getByRole('button', { name: '编辑角色 用户', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑角色', exact: true });
  await expect(editor.getByLabel('角色名称', { exact: true })).toBeDisabled();
  await expect(editor.getByRole('combobox', { name: '数据范围', exact: true })).toBeDisabled();
  await expect(editor.getByRole('combobox', { name: '数据范围', exact: true })).toContainText('仅本人');
  await expect(editor.getByText('内置用户角色的数据范围固定为仅本人；复制为自定义角色后可调整。', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('builtin-user-scope.png'), fullPage: true });
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '复制角色 用户', exact: true }).click();
  const copy = page.getByRole('dialog', { name: '新建角色', exact: true });
  await expect(copy.getByRole('combobox', { name: '数据范围', exact: true })).toBeEnabled();
  await copy.getByLabel('角色名称', { exact: true }).fill('Custom user copy');
  await chooseOption(page, '数据范围', '全部', copy);
  await copy.getByRole('button', { name: '保存', exact: true }).click();
  await expect(copy).toHaveCount(0);
  const owner = sdkClient(instance.url);
  await loginClient(owner, 'admin', 'administrator-password-strong');
  const roles = await owner.roles();
  expect(roles.items.find(item => item.id === 'user')?.data_scope).toBe('self');
  expect(roles.items.find(item => item.name === 'Custom user copy')).toMatchObject({ builtin: false, data_scope: 'all' });
  await page.goto(`${instance.url}/admin/menus`);
  await page.getByRole('button', { name: '展开全部', exact: true }).click();
  await page.getByRole('button', { name: '分配角色：我的笔记', exact: true }).click();
  const assignment = page.getByRole('dialog', { name: '分配角色：我的笔记', exact: true });
  await expect(assignment.getByRole('checkbox', { name: '用户', exact: true })).toBeChecked();
  await expect(assignment.getByRole('checkbox', { name: '用户', exact: true })).toBeEnabled();
  await expect(assignment.getByRole('checkbox', { name: 'super_admin', exact: true })).toBeChecked();
  await expect(assignment.getByRole('checkbox', { name: 'super_admin', exact: true })).toBeDisabled();
  await expect(assignment.getByRole('checkbox', { name: 'user', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('builtin-user-menu-label.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const kind of ['management', 'api-only'] as const) {
  test(`${kind} role receives callable APIs through the role editor`, async ({ page, instance }, info) => {
    await installPlatform(instance);
    await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
    await page.goto(`${instance.url}/admin/roles`);
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建角色', exact: true });
    await dialog.getByLabel('角色名称', { exact: true }).fill(`regression-${kind}`);
    if (kind === 'management') {
      await dialog.getByRole('checkbox', { name: '用户列表', exact: true }).check();
      await dialog.getByRole('button', { name: '展开或收起 用户列表', exact: true }).click();
      await expect(dialog.getByRole('checkbox', { name: 'listUsers', exact: true })).toBeChecked();
      await expect(dialog.getByRole('checkbox', { name: 'createUser', exact: true })).not.toBeChecked();
    } else {
      await dialog.getByRole('button', { name: /^高级/ }).click();
      await dialog.getByRole('textbox', { name: '按名称筛选', exact: true }).fill('listFiles');
      await dialog.getByRole('checkbox', { name: 'listFiles', exact: true }).check();
      await expect(dialog.getByRole('checkbox', { name: '读取文件', exact: true })).toBeChecked();
      await dialog.getByRole('textbox', { name: '按名称筛选', exact: true }).fill('fileAccess');
      await dialog.getByRole('checkbox', { name: 'fileAccess', exact: true }).check();
      await expect(dialog.getByRole('checkbox', { name: 'fileAccess', exact: true })).toBeChecked();
    }
    await page.screenshot({ path: info.outputPath('grant-editor.png'), fullPage: true });
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const owner = sdkClient(instance.url); await loginClient(owner, 'admin', 'administrator-password-strong');
    const role = (await owner.roles()).items.find(role => role.name === `regression-${kind}`)!;
    expect(role.permissions).toContain(kind === 'management' ? 'users:read' : 'files:access');
    expect(role.operation_ids).toContain(kind === 'management' ? 'listUsers' : 'listFiles');
    expect(role.permissions).not.toContain('users:create');
    expect(role.action_ids).toEqual([]);
    if (kind === 'api-only') { expect(role.operation_ids).toContain('fileAccess'); expect(role.menu_ids).toEqual([]); expect(role.permissions).not.toContain('notes:access'); }
    const member = await owner.createUser({ username: `regression-${kind}`, email: `${kind}@example.test`, password: memberPassword, role_ids: [role.id] });
    const client = sdkClient(instance.url, kind === 'management' ? 'administrator' : 'user'); await loginClient(client, member.username, memberPassword);
    if (kind === 'management') {
      await expect(client.users('', 1)).resolves.toMatchObject({ items: expect.any(Array) });
      await expect(client.createUser({ username: 'forbidden', email: 'forbidden@example.test', password: memberPassword })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    } else await expect(client.listFiles('', 1)).resolves.toMatchObject({ items: [] });
    await expect(client.roles()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
}

test('explicit button revocation survives session reload while its independent API remains callable', async ({ page, instance }, info) => {
  await installPlatform(instance);
  const owner = sdkClient(instance.url); await loginClient(owner, 'admin', 'administrator-password-strong');
  const role = await owner.createRole({ name: 'Revoked buttons', permissions: ['notes:access', 'notes:create'], menu_ids: ['overview', 'notes'], action_ids: ['op:listNotes', 'op:createNote'], operation_ids: ['listNotes', 'createNote'] });
  const member = await owner.createUser({ username: 'revoked-buttons', email: 'buttons@example.test', password: memberPassword, role_ids: [role.id] });
  const saved = await owner.updateRole(role.id, { version: role.version, name: role.name, permissions: role.permissions, action_ids: [] });
  expect(saved.action_ids).toEqual([]);
  await workspaceLogin(page, instance.url, member.username);
  await page.goto(`${instance.url}/notes`);
  await expect(page.getByRole('heading', { name: /^我的笔记/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建笔记', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '新建笔记', exact: true })).toHaveCount(0);
  const client = sdkClient(instance.url, 'user'); await loginClient(client, member.username, memberPassword);
  const boot = await client.bootstrap();
  expect(boot.current_user?.action_ids).toEqual([]);
  await expect(client.createNote({ title: 'API remains explicit', body: '', status: 'open', attachment_ids: [] })).resolves.toMatchObject({ title: 'API remains explicit' });
  await page.screenshot({ path: info.outputPath('revoked-buttons.png'), fullPage: true });
});

test('menu rows assign roles atomically and preserve unrelated role edits and sessions', async ({ page, instance }, info) => {
  await installPlatform(instance);
  const owner = sdkClient(instance.url); await loginClient(owner, 'admin', 'administrator-password-strong');
  const role = await owner.createRole({ name: 'Menu reader', permissions: [], menu_ids: [], action_ids: [], operation_ids: [] });
  const member = await owner.createUser({ username: 'menu-reader', email: 'reader@example.test', password: memberPassword, role_ids: [role.id] });
  const reader = sdkClient(instance.url); await loginClient(reader, member.username, memberPassword);
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await page.goto(`${instance.url}/admin/menus`);
  await page.getByRole('button', { name: '展开全部', exact: true }).click();
  await expect(page.getByRole('link', { name: 'API 操作目录', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '分配角色：用户列表', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '分配角色：用户列表', exact: true });
  await expect(dialog.getByRole('checkbox', { name: '用户', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'super_admin', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'super_admin', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'user', exact: true })).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: 'Menu reader', exact: true }).check();
  // This save occurs after the dialog loaded: the menu patch must preserve it.
  await owner.updateRole(role.id, { version: role.version, name: 'Renamed reader', permissions: ['notes:access'], operation_ids: ['listNotes'], data_scope: 'all' });
  await loginClient(reader, member.username, memberPassword);
  await page.screenshot({ path: info.outputPath('menu-roles.png'), fullPage: true });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = (await owner.roles()).items.find(item => item.id === role.id)!;
  expect(saved.name).toBe('Renamed reader');
  expect(saved.data_scope).toBe('all');
  expect(saved.menu_ids).toEqual(expect.arrayContaining(['users', 'administration']));
  expect(saved.operation_ids).toEqual(expect.arrayContaining(['listUsers', 'listNotes', 'roleOptions']));
  expect(saved.operation_ids).not.toContain('createUser');
  expect(saved.permissions).not.toContain('users:create');
  expect((await owner.bootstrap()).current_user?.roles).toContain('super_admin');
  expect((await reader.bootstrap()).current_user).toBeFalsy();
  await loginClient(reader, member.username, memberPassword);
  await expect(reader.users('', 1)).resolves.toMatchObject({ items: expect.any(Array) });
  const tree = await owner.menuConfig();
  await expect(reader.assignMenuRoles('users', { version: tree.version, expected_role_ids: [role.id], role_ids: [] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await owner.assignMenuRoles('users', { version: tree.version, expected_role_ids: [role.id], role_ids: [] });
  const revoked = (await owner.roles()).items.find(item => item.id === role.id)!;
  expect(revoked.menu_ids).not.toContain('users');
  expect(revoked.operation_ids).toContain('listUsers');
});
