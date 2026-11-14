// Author: yunnuo <ymz@ebox.vip>
// Description: Two fixed roles across menus, direct routes, every management API
// and isolated client appearance; the three-way authorization model (menus,
// buttons, API operations) stays independent of the permission upper bound.
import { mkdir } from 'node:fs/promises';
import { chooseOption, test, expect, installPlatform, adminLogin, workspaceLogin, sdkClient, loginClient, navigate, nodeDisplayLabel, pageNode, menuChain, materializedOperations, pageBoot, memberPassword, type Instance } from './fixtures';
import { operations } from '../../packages/contracts/src/operations.gen';

const adminPassword = 'administrator-password-strong';
const member = 'test-password-strong';

test('fixed roles enforce menus, all management APIs and client-only appearance', async ({ page, browser, instance }, info) => {
  // The mobile drawer flow needs more than the 60s default on a cold instance.
  test.setTimeout(120000);
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', adminPassword);
  await page.goto(`${instance.url}/admin/roles`);
  await expect(page.getByRole('heading', { name: '角色权限', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /新建角色/ })).toBeVisible();
  const bootData = await pageBoot(page, instance.url);
  const headers = { 'X-CSRF-Token': bootData.csrf_token };
  const roles = (await (await page.request.get(`${instance.url}/api/v1/admin/roles`, { headers })).json()).data;
  expect(roles.items.map((item: { id: string }) => item.id).sort()).toEqual(['super_admin', 'user']);
  const created = await page.request.post(`${instance.url}/api/v1/admin/users`, { headers, data: { username: 'member', email: 'member@example.test', password: member, role: 'user' } });
  expect(created.status()).toBe(200);
  const memberID = (await created.json()).data.id;
  expect((await page.request.post(`${instance.url}/api/v1/admin/users`, { headers, data: { username: 'custom', email: 'custom@example.test', password: member, role: 'custom' } })).status()).toBe(400);
  expect((await page.request.patch(`${instance.url}/api/v1/admin/administrators/${bootData.current_user.id}`, { headers, data: { role: 'super_admin', status: 'disabled' } })).status()).toBe(409);
  await page.reload();
  await expect(page.getByRole('table').first()).toBeVisible();
  const rolesAfter = (await (await page.request.get(`${instance.url}/api/v1/admin/roles`, { headers })).json()).data;
  expect(rolesAfter.items.find((item: { id: string }) => item.id === 'user').user_count).toBe(1);
  const directory = `build/acceptance/permissions/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/admin-fixed-roles.png`, fullPage: true });
  const contexts = [];
  try {
    const memberContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile', colorScheme: 'light' });
    contexts.push(memberContext);
    const memberPage = await memberContext.newPage();
    await workspaceLogin(memberPage, instance.url, 'member');
    const metadata = (await (await memberPage.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
    expect(metadata.current_user.roles).toEqual(['user']);
    // The builtin user role auto-holds every assignable business grant; the
    // departments points stay administrator-realm management points now.
    expect(metadata.current_user.permissions).toEqual(['notes:access', 'notes:create', 'notes:delete', 'notes:update']);
    const memberHeaders = { 'X-CSRF-Token': metadata.csrf_token };
    // The departments points stay assignable to user-realm roles and drive the
    // platform-side data scopes, but the department console itself remains an
    // administrator-realm surface: the dual-realm session model is unchanged
    // (ADR-0035), so plain members are refused on every management API.
    for (const operation of Object.values(operations).filter(item => item.path.startsWith('/api/v1/admin/') && item.permissions.length > 0)) {
      const path = operation.path.replace('{id}', memberID);
      const method = operation.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      // A bare fetch carries no cookie jar, so this is the real anonymous probe.
      expect((await fetch(`${instance.url}${path}`, { method, ...(method === 'GET' ? {} : { body: '{}' }) })).status, `anonymous ${method} ${path}`).toBe(401);
      const held = (point: string) => metadata.current_user.permissions.includes(point);
      const allowedByPoints = operation.permissionMode === 'any' ? operation.permissions.some(held) : operation.permissions.every(held);
      if (operation.superAdmin || !allowedByPoints) {
        expect((await memberPage.request.fetch(`${instance.url}${path}`, { method, ...(method === 'GET' ? {} : { data: {} }), headers: memberHeaders })).status(), `member ${method} ${path}`).toBe(403);
      }
    }
    const managementReads: string[] = [];
    memberPage.on('request', request => { if (request.url().includes('/api/v1/admin/')) managementReads.push(request.url()); });
    for (const route of ['users', 'administrators', 'roles', 'mail', 'logs']) {
      await memberPage.goto(`${instance.url}/${route}`);
      await expect(memberPage.getByText('没有访问权限', { exact: true })).toBeVisible();
    }
    expect((await memberPage.request.get(`${instance.url}/admin`)).status()).toBe(200);
    await memberPage.goto(`${instance.url}/site`);
    await expect(memberPage.getByRole('heading', { name: '没有访问权限', exact: true })).toBeVisible();
    await memberPage.goto(`${instance.url}/`);
    // The management-flavoured site page is administrator-only now: the member
    // sidebar carries no 基础设置/API 文档/公告/文件管理 entries at all, and
    // personal theming rides the topbar drawer.
    if (info.project.name === 'mobile') await memberPage.getByRole('button', { name: '打开导航', exact: true }).click();
    for (const name of ['基础设置', 'API 文档', '公告', '文件管理', '用户列表', '角色权限', '管理工具']) await expect(memberPage.getByRole('button', { name, exact: true })).toHaveCount(0);
    if (info.project.name === 'mobile') await memberPage.keyboard.press('Escape');
    const writes: string[] = [];
    memberPage.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
    await memberPage.getByRole('button', { name: '主题设置', exact: true }).click();
    const drawer = memberPage.getByRole('dialog', { name: '主题设置', exact: true });
    await drawer.locator('.preference-theme').getByRole('button', { name: '深色', exact: true }).click();
    await expect(memberPage.locator('html')).toHaveAttribute('data-theme', 'dark');
    await memberPage.reload();
    await expect(memberPage.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(writes).toEqual([]);
    expect(managementReads).toEqual([]);
    await memberPage.screenshot({ path: `${directory}/member-local-appearance.png`, fullPage: true });
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const clean = await browser.newContext({ viewport: page.viewportSize()!, colorScheme: 'light' });
    contexts.push(clean);
    const other = await clean.newPage();
    await workspaceLogin(other, instance.url, 'member');
    await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');
    const global = (await (await page.request.get(`${instance.url}/api/v1/admin/settings`, { headers })).json()).data;
    expect(global.items.some((item: { key: string }) => item.key === 'appearance.theme')).toBe(false);
    expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`, { headers, data: { changes: [{ key: 'appearance.theme', value: 'dark' }] } })).status()).toBe(400);
    expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`, { headers, data: { changes: [{ key: 'site.name', value: '管理员统一品牌' }] } })).status()).toBe(200);
    await memberPage.reload();
    await expect(memberPage).toHaveTitle('管理员统一品牌 · 工作空间');
    await expect(memberPage.locator('html')).toHaveAttribute('data-theme', 'dark');
    // A super administrator can promote the existing account. There is no second identity table.
    expect((await page.request.patch(`${instance.url}/api/v1/admin/users/${memberID}`, { headers, data: { role_ids: ['user', 'super_admin'], status: 'active' } })).status()).toBe(200);
    expect((await memberPage.request.get(`${instance.url}/api/v1/auth/session`)).status()).toBe(401);
    expect((await page.request.post(`${instance.url}/api/v1/admin/administrators`, { headers, data: { username: 'member', email: 'member@example.test', password: 'administrator-password-strong', role: 'super_admin' } })).status()).toBe(409);
    expect((await page.request.get(`${instance.url}/api/v1/admin/administrators`, { headers })).status()).toBe(200);
  } finally {
    for (const context of contexts) await context.close();
  }
});

test('custom roles assign through the console, echo the three grant sets and survive status toggles', async ({ page, instance }) => {
  test.setTimeout(60000);
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', adminPassword);
  // Create the custom role through the real administrator console with the notes grant.
  await page.goto(`${instance.url}/admin/roles`);
  await expect(page.getByRole('heading', { name: '角色权限', exact: true, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '新建角色', exact: true });
  // The console has no realm picker: creates are user-realm roles and edits
  // keep the role's own realm.
  await expect(editor.getByLabel('角色域')).toHaveCount(0);
  await editor.getByLabel('角色名称', { exact: true }).fill('记录员');
  // Overlay scrollbars float above content on macOS instead of reserving a
  // gutter, so interactive elements must stay clear of the rightmost band.
  const clearOfGutter = await editor.evaluate((surface: HTMLElement) => {
    const scroller = surface.querySelector('.overflow-y-auto');
    if (!scroller) return false;
    const limit = scroller.getBoundingClientRect().right - 15;
    return [...scroller.querySelectorAll('button, [role="checkbox"], input')].every(el => el.getBoundingClientRect().right <= limit + 1);
  });
  expect(clearOfGutter).toBe(true);
  // Raw permission points live in the collapsed advanced catalogue.
  await editor.getByRole('button', { name: /高级/ }).click();
  await editor.getByRole('group', { name: '权限点' }).getByRole('checkbox', { name: '使用我的笔记', exact: true }).check();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const roles = await admin.web!.roles();
  const recorder = roles.items.find(item => item.name === '记录员');
  expect(recorder?.permissions).toEqual(['notes:access']);
  // A fresh role starts with empty menu, button and API grant sets.
  expect(recorder?.menu_ids).toEqual([]);
  expect(recorder?.action_ids).toEqual([]);
  expect(recorder?.operation_ids).toEqual([]);
  const created = await page.request.post(`${instance.url}/api/v1/admin/users`, { headers: { 'X-CSRF-Token': (await (await page.request.get(`${instance.url}/api/v1/admin/bootstrap`, { headers: {} })).json()).data.csrf_token }, data: { username: 'member', email: 'member@example.test', password: member, role: 'user' } });
  expect(created.status()).toBe(200);
  const memberID = (await created.json()).data.id;
  // Assign the role in the user list console and verify the dialog echoes the backend roles.
  await page.goto(`${instance.url}/admin/users`);
  const memberRow = page.getByRole('row').filter({ hasText: 'member' });
  const openDialog = async () => {
    await memberRow.getByRole('button', { name: '编辑', exact: true }).click();
    return page.getByRole('dialog', { name: '编辑member', exact: true });
  };
  let dialog = await openDialog();
  await dialog.getByRole('checkbox', { name: 'user', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: '记录员', exact: true }).check();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await loginClient(admin, 'admin', adminPassword);
  const assigned = await admin.web!.users('', 1);
  expect(assigned.items.find(item => item.id === memberID)?.roles).toEqual([recorder!.id]);
  dialog = await openDialog();
  await expect(dialog.getByRole('checkbox', { name: '记录员', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'user', exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Omitted grant sets keep their values; explicit arrays replace them.
  await admin.web!.updateRole(recorder!.id, { name: '记录员', permissions: ['notes:access'] });
  let echoed = (await admin.web!.roles()).items.find(item => item.id === recorder!.id)!;
  expect(echoed.menu_ids).toEqual([]);
  const notesNode = pageNode((await admin.web!.menuConfig()), 'notes')!;
  await admin.web!.updateRole(recorder!.id, { name: '记录员', permissions: ['notes:access'], menu_ids: [notesNode.id], operation_ids: ['listNotes'] });
  echoed = (await admin.web!.roles()).items.find(item => item.id === recorder!.id)!;
  expect(echoed.menu_ids).toEqual([notesNode.id]);
  expect(echoed.operation_ids).toEqual(['listNotes']);
  // An empty array clears one set without touching the others.
  await admin.web!.updateRole(recorder!.id, { name: '记录员', permissions: ['notes:access'], operation_ids: [] });
  echoed = (await admin.web!.roles()).items.find(item => item.id === recorder!.id)!;
  expect(echoed.menu_ids).toEqual([notesNode.id]);
  expect(echoed.operation_ids).toEqual([]);
  // Disable then re-enable the member: the role assignment must survive both toggles.
  await memberRow.getByRole('button', { name: '禁用', exact: true }).click();
  await expect(memberRow.getByRole('button', { name: '启用', exact: true })).toBeVisible();
  await memberRow.getByRole('button', { name: '启用', exact: true }).click();
  await expect(memberRow.getByRole('button', { name: '禁用', exact: true })).toBeVisible();
  await loginClient(admin, 'admin', adminPassword);
  const restored = await admin.web!.users('', 1);
  expect(restored.items.find(item => item.id === memberID)?.roles).toEqual([recorder!.id]);
  dialog = await openDialog();
  await expect(dialog.getByRole('checkbox', { name: '记录员', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'user', exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('restricted administrators keep user administration without role management', async ({ page, browser, instance }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', adminPassword);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const config = await admin.web!.menuConfig();
  const labelOf = (routeId: string) => nodeDisplayLabel(pageNode(config, routeId) ?? { label: '', id: routeId, route_id: routeId });
  // Menu authorization needs the full ancestor chain of each visible page.
  const menuIds = [...new Set([...menuChain(config, 'users'), ...menuChain(config, 'announcements', 'administrator')])];
  // The console creates user-realm roles only, so the super administrator
  // seeds the restricted administrator-realm role through the SDK and the
  // console echoes it back.
  await admin.web!.createRole({
    name: '内容运营', permissions: ['users:read', 'users:create', 'users:update', 'announcements:read'],
    realm: 'administrator', data_scope: 'all',
    operation_ids: ['listUsers', 'updateUser', 'roleOptions'],
  });
  await page.goto(`${instance.url}/admin/roles`);
  await expect(page.getByRole('heading', { name: '角色权限', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '内容运营' })).toBeVisible();
  await page.getByRole('row').filter({ hasText: '内容运营' }).getByRole('button', { name: '编辑角色 内容运营', exact: true }).click();
  const roleEditor = page.getByRole('dialog', { name: '编辑角色', exact: true });
  await expect(roleEditor.getByRole('combobox', { name: '数据范围', exact: true })).toContainText('全部');
  // The advanced catalogue carries the raw points and the super-only locks.
  await roleEditor.getByRole('button', { name: /高级/ }).click();
  const pointsPanel = roleEditor.getByRole('group', { name: '权限点' });
  await expect(pointsPanel.getByText('仅超级管理员', { exact: true }).first()).toBeVisible();
  for (const name of ['查看用户', '创建用户', '管理用户身份', '查看平台公告']) await expect(pointsPanel.getByRole('checkbox', { name, exact: true })).toBeChecked();
  // Inspect the page-linked selector separately from the complete catalogue.
  await roleEditor.getByRole('button', { name: /高级/ }).click();
  await roleEditor.getByRole('button', { name: '展开或收起 用户列表', exact: true }).click();
  for (const operation of ['listUsers', 'updateUser', 'roleOptions']) {
    await expect(roleEditor.getByLabel(operation, { exact: true })).toBeChecked();
  }
  await roleEditor.getByRole('button', { name: '取消', exact: true }).click();
  await expect(roleEditor).toHaveCount(0);
  // The menu chain rides the console API for an explicit ancestor chain; the
  // editor itself now resolves route labels and cascades ancestors (unit
  // covered), so this grant stays focused on enforcement, not tree clicks.
  const createdRole = (await admin.web!.roles()).items.find(item => item.name === '内容运营')!;
  await admin.web!.updateRole(createdRole.id, { name: '内容运营', permissions: createdRole.permissions, menu_ids: menuIds, action_ids: config.nodes.filter(node => node.type === 'action' && node.operation_ids.includes('updateUser')).map(node => node.id), operation_ids: createdRole.operation_ids });
  // Create the restricted administrator account through the console; the role
  // select serves super_admin plus self-built administrator roles.
  await page.goto(`${instance.url}/admin/administrators`);
  await page.getByRole('button', { name: '新增管理员', exact: true }).click();
  const adminDialog = page.getByRole('dialog', { name: '新增管理员', exact: true });
  await adminDialog.getByLabel('账号', { exact: true }).fill('ops');
  await adminDialog.getByLabel('邮箱', { exact: true }).fill('ops@example.test');
  await adminDialog.getByLabel('初始密码', { exact: true }).fill('ops-password-strong');
  await adminDialog.getByRole('checkbox', { name: 'super_admin', exact: true }).uncheck();
  await adminDialog.getByRole('checkbox', { name: '内容运营', exact: true }).check();
  await adminDialog.getByRole('button', { name: '创建管理员', exact: true }).click();
  await expect(adminDialog).toHaveCount(0);
  // A normal member exists for the restricted administrator to toggle.
  const bootData = await pageBoot(page, instance.url);
  const headers = { 'X-CSRF-Token': bootData.csrf_token };
  expect((await page.request.post(`${instance.url}/api/v1/admin/users`, { headers, data: { username: 'member', email: 'member@example.test', password: member, role: 'user' } })).status()).toBe(200);
  const contexts = [];
  try {
    const opsContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile', colorScheme: 'light' });
    contexts.push(opsContext);
    const ops = await opsContext.newPage();
    await adminLogin(ops, instance.url, 'ops', 'ops-password-strong');
    // User administration and announcements stay reachable; role management does not.
    // Overview is not granted, so the login lands on the standalone 403: enter through the granted page.
    await ops.goto(`${instance.url}/admin/users`);
    await navigate(ops, labelOf('users'));
    await expect(ops.getByRole('heading', { name: '用户列表', level: 1 })).toBeVisible();
    // Keep the mobile drawer open so the entry counts describe the real sidebar.
    if (info.project.name === 'mobile') await ops.getByRole('button', { name: '打开导航', exact: true }).click();
    await expect(ops.getByRole('button', { name: labelOf('announcements'), exact: true })).toHaveCount(1);
    await expect(ops.getByRole('button', { name: labelOf('roles'), exact: true })).toHaveCount(0);
    await expect(ops.getByRole('button', { name: labelOf('administrators'), exact: true })).toHaveCount(0);
    if (info.project.name === 'mobile') await ops.keyboard.press('Escape');
    await ops.goto(`${instance.url}/admin/roles`);
    await expect(ops.getByText('没有访问权限', { exact: true })).toBeVisible();
    // The server rejects role writes from the restricted session through the SDK client.
    const opsApi = sdkClient(instance.url, 'administrator');
    await loginClient(opsApi, 'ops', 'ops-password-strong');
    await expect(opsApi.web!.createRole({ name: '越权角色', permissions: [], realm: 'administrator' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    // The restricted administrator toggles ordinary users both ways.
    await ops.goto(`${instance.url}/admin/users`);
    const memberRow = ops.getByRole('row').filter({ hasText: 'member' });
    await memberRow.getByRole('button', { name: '禁用', exact: true }).click();
    await expect(memberRow.getByRole('button', { name: '启用', exact: true })).toBeVisible();
    await memberRow.getByRole('button', { name: '启用', exact: true }).click();
    await expect(memberRow.getByRole('button', { name: '禁用', exact: true })).toBeVisible();
    // The super administrator cannot disable the last active super admin.
    await page.goto(`${instance.url}/admin/administrators`);
    const adminRow = page.getByRole('row').filter({ hasText: 'admin@example.test' });
    await adminRow.getByRole('button', { name: '禁用', exact: true }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: '不能禁用或降权最后一个启用且可用本地密码登录的管理员' })).toBeVisible();
    expect((await page.request.get(`${instance.url}/api/v1/admin/bootstrap`, { headers })).status()).toBe(200);
  } finally {
    for (const context of contexts) await context.close();
  }
});

test('button-level grants hide note actions while the notes page stays reachable', async ({ page, browser, instance }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', adminPassword);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const config = await admin.web!.menuConfig();
  const labelOf = (routeId: string) => nodeDisplayLabel(pageNode(config, routeId) ?? { label: '', id: routeId, route_id: routeId });
  // Page and entry grants plus create/update/upload, deliberately without the
  // delete points; menu chains and the derived API grants complete the matrix.
  // The files page itself no longer renders on the user surface — its points
  // remain grantable because the notes attachment flow rides on them.
  const permissions = ['notes:access', 'notes:create', 'notes:update', 'files:access', 'files:upload'];
  const recorder = await admin.web!.createRole({
    name: '记录员', permissions, realm: 'user',
    menu_ids: [...new Set([...menuChain(config, 'notes')])],
    operation_ids: materializedOperations('user', permissions),
  });
  expect(recorder.permissions.length).toBe(5);
  expect((await page.request.post(`${instance.url}/api/v1/admin/users`, { headers: { 'X-CSRF-Token': (await pageBoot(page, instance.url)).csrf_token }, data: { username: 'member', email: 'member@example.test', password: member, role: recorder.id } })).status()).toBe(200);
  const directory = `build/acceptance/permissions/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  const contexts = [];
  try {
    const memberContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile', colorScheme: 'light' });
    contexts.push(memberContext);
    const memberPage = await memberContext.newPage();
    await workspaceLogin(memberPage, instance.url, 'member');
    // Notes: creating and editing stay available while deletion hides per point.
    await memberPage.goto(`${instance.url}/notes`);
    await expect(memberPage.getByRole('heading', { name: '个人笔记', exact: true })).toBeVisible();
    await memberPage.getByRole('button', { name: '新建笔记', exact: true }).click();
    const noteDialog = memberPage.getByRole('dialog', { name: '新建笔记', exact: true });
    await noteDialog.getByRole('textbox', { name: '标题', exact: true }).fill('权限点笔记');
    await noteDialog.getByRole('button', { name: '保存笔记', exact: true }).click();
    await expect(noteDialog).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: '编辑 权限点笔记', exact: true })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: '删除 权限点笔记', exact: true })).toHaveCount(0);
    // Files: the management page never renders on the user surface; the same
    // permission points power the API upload the note attachment picker uses.
    const memberApi = sdkClient(instance.url, 'user');
    await loginClient(memberApi, 'member', member);
    const uploaded = await memberApi.uploadFile(new File([Buffer.from('member file content')], 'member-file.txt', { type: 'text/plain' }));
    await expect(memberApi.files!.deleteFile(uploaded.file_id)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await memberPage.goto(`${instance.url}/files`);
    await expect(memberPage.getByRole('heading', { name: '页面不存在', exact: true })).toBeVisible();
    // Narrowing the permission upper bound prunes dependent API and action
    // grants in the same save; unrelated grants stay intact. The saved union
    // is derived inside the editor, so the buttons, their API operations and
    // the raw points leave together before the save.
    await page.goto(`${instance.url}/admin/roles`);
    await page.getByRole('row').filter({ hasText: '记录员' }).getByRole('button', { name: '编辑角色 记录员', exact: true }).click();
    const editDialog = page.getByRole('dialog', { name: '编辑角色', exact: true });
    await editDialog.getByRole('button', { name: `展开或收起 ${labelOf('notes')}`, exact: true }).click();
    // Button groups merge same-label derived nodes, so a partially granted
    // group renders aria-checked="mixed" where Radix cycles a click back to
    // checked: click until the group reads unchecked instead of blind
    // check()/uncheck() gestures.
    const groupOff = async (name: string) => {
      const box = editDialog.getByRole('checkbox', { name, exact: true });
      for (let guard = 0; guard < 3 && await box.getAttribute('aria-checked') !== 'false'; guard++) await box.click();
    };
    await groupOff('创建笔记');
    await editDialog.getByRole('checkbox', { name: 'createNote', exact: true }).uncheck();
    // File APIs have no demo page; narrowing their raw point prunes upload grants.
    await editDialog.getByRole('button', { name: /高级/ }).click();
    const points = editDialog.getByRole('group', { name: '权限点' });
    await points.getByRole('checkbox', { name: '创建笔记', exact: true }).uncheck();
    await points.getByRole('checkbox', { name: '上传文件', exact: true }).uncheck();
    const keep = materializedOperations('user', ['notes:access', 'notes:update', 'files:access']);
    await editDialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editDialog).toHaveCount(0);
    await loginClient(admin, 'admin', adminPassword);
    const revoked = (await admin.web!.roles()).items.find(item => item.id === recorder.id)!;
    expect(revoked.permissions.sort()).toEqual(['files:access', 'notes:access', 'notes:update']);
    expect(revoked.operation_ids.sort()).toEqual(keep);
    await workspaceLogin(memberPage, instance.url, 'member');
    await memberPage.goto(`${instance.url}/notes`);
    await expect(memberPage.getByRole('heading', { name: '个人笔记', exact: true })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: '新建笔记', exact: true })).toHaveCount(0);
    await expect(memberPage.getByText('权限点笔记', { exact: true })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: '编辑 权限点笔记', exact: true })).toBeVisible();
    await loginClient(memberApi, 'member', member);
    await memberApi.uploadFile(new File([Buffer.from('blocked content')], 'blocked.txt', { type: 'text/plain' })).catch(error => {
      expect(error).toMatchObject({ code: 'PERMISSION_DENIED' });
    });
    await memberPage.screenshot({ path: `${directory}/member-button-grants.png`, fullPage: true });
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The builtin user role auto-holds every assignable point: all actions render.
    expect((await page.request.post(`${instance.url}/api/v1/admin/users`, { headers: { 'X-CSRF-Token': (await pageBoot(page, instance.url)).csrf_token }, data: { username: 'fullmember', email: 'fullmember@example.test', password: member, role: 'user' } })).status()).toBe(200);
    const fullContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile', colorScheme: 'light' });
    contexts.push(fullContext);
    const full = await fullContext.newPage();
    await workspaceLogin(full, instance.url, 'fullmember');
    await full.goto(`${instance.url}/notes`);
    await expect(full.getByRole('heading', { name: '个人笔记', exact: true })).toBeVisible();
    await expect(full.getByRole('button', { name: '新建笔记', exact: true })).toBeVisible();
  } finally {
    for (const context of contexts) await context.close();
  }
});

test('department moves refuse cycles and revoke stale scope sessions', async ({ page, instance }) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', adminPassword);
  // Build the two-level tree through the real departments console.
  await page.goto(`${instance.url}/admin/departments`);
  await expect(page.getByRole('heading', { name: '部门管理', level: 1, exact: true })).toBeVisible();
  // The empty state repeats the toolbar button; the toolbar instance is the canonical target.
  await page.getByRole('button', { name: '新建根部门', exact: true }).first().click();
  const rootDialog = page.getByRole('dialog', { name: '新建根部门', exact: true });
  await rootDialog.getByLabel('部门名称', { exact: true }).fill('研发部');
  await rootDialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(rootDialog).toHaveCount(0);
  await page.getByRole('button', { name: '在 研发部 下新建子部门' }).click();
  const childDialog = page.getByRole('dialog', { name: '新建子部门', exact: true });
  await childDialog.getByLabel('部门名称', { exact: true }).fill('前端组');
  await childDialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(childDialog).toHaveCount(0);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const departments = await admin.web!.listDepartments();
  const parent = departments.items.find(item => item.name === '研发部');
  const child = departments.items.find(item => item.name === '前端组');
  expect(child?.parent_id).toBe(parent!.id);
  // Moving a department under its own child is refused server-side, and the
  // rename dialog never even offers self or descendants as the parent.
  await expect(admin.web!.updateDepartment(parent!.id, { name: '研发部', parent_id: child!.id })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await page.getByRole('button', { name: '重命名 研发部', exact: true }).click();
  const renameDialog = page.getByRole('dialog', { name: '重命名部门', exact: true });
  await renameDialog.getByRole('combobox', { name: '上级部门', exact: true }).click();
  const parentOptions = await page.getByRole('option').allTextContents();
  expect(parentOptions).not.toContain('研发部');
  expect(parentOptions).not.toContain('前端组');
  await page.keyboard.press('Escape');
  await renameDialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(renameDialog).toHaveCount(0);
  // A legitimate move: a fresh root department moves under 前端组 and back.
  await page.getByRole('button', { name: '新建根部门', exact: true }).first().click();
  const secondDialog = page.getByRole('dialog', { name: '新建根部门', exact: true });
  await secondDialog.getByLabel('部门名称', { exact: true }).fill('研发二部');
  await secondDialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(secondDialog).toHaveCount(0);
  await page.getByRole('button', { name: '重命名 研发二部', exact: true }).click();
  const moveDialog = page.getByRole('dialog', { name: '重命名部门', exact: true });
  await chooseOption(page, '上级部门', /前端组/, moveDialog);
  await moveDialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(moveDialog).toHaveCount(0);
  // Tree changes revoke existing sessions because department scopes may change.
  await adminLogin(page, instance.url, 'admin', adminPassword);
  await page.goto(`${instance.url}/admin/departments`);
  await loginClient(admin, 'admin', adminPassword);
  const moved = (await admin.web!.listDepartments()).items.find(item => item.name === '研发二部')!;
  expect(moved.parent_id).toBe(child!.id);
  await page.getByRole('button', { name: '重命名 研发二部', exact: true }).click();
  const restoreDialog = page.getByRole('dialog', { name: '重命名部门', exact: true });
  await chooseOption(page, '上级部门', '作为根部门', restoreDialog);
  await restoreDialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(restoreDialog).toHaveCount(0);
  await adminLogin(page, instance.url, 'admin', adminPassword);
  await page.goto(`${instance.url}/admin/departments`);
  // The unused helper department deletes cleanly.
  await page.getByRole('button', { name: '删除 研发二部', exact: true }).click();
  const unusedDialog = page.getByRole('alertdialog', { name: '删除部门', exact: true });
  await unusedDialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(unusedDialog).toHaveCount(0);
  await adminLogin(page, instance.url, 'admin', adminPassword);
  await page.goto(`${instance.url}/admin/departments`);
  await expect(page.getByRole('button', { name: '删除 研发二部', exact: true })).toHaveCount(0);
  await loginClient(admin, 'admin', adminPassword);
  expect((await admin.web!.listDepartments()).total).toBe(2);
});

test('custom department scopes echo in the role editor and guard attached departments', async ({ page, instance }) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const parent = await admin.web!.createDepartment({ name: '研发部', parent_id: '', sort: 0 });
  const child = await admin.web!.createDepartment({ name: '前端组', parent_id: parent.id, sort: 0 });
  await adminLogin(page, instance.url, 'admin', adminPassword);
  // A role scoped to the child department through the editor.
  await page.goto(`${instance.url}/admin/roles`);
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '新建角色', exact: true });
  await editor.getByLabel('角色名称', { exact: true }).fill('区域记录员');
  await editor.getByRole('button', { name: /高级/ }).click();
  const pointsPanel = editor.getByRole('group', { name: '权限点' });
  await pointsPanel.getByRole('checkbox', { name: '使用我的笔记', exact: true }).check();
  await chooseOption(page, '数据范围', '自定义', editor);
  await editor.getByRole('group', { name: '自定义部门范围' }).getByRole('checkbox', { name: '前端组' }).check();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await loginClient(admin, 'admin', adminPassword);
  const roles = await admin.web!.roles();
  const scoped = roles.items.find(item => item.name === '区域记录员');
  expect(scoped?.data_scope).toBe('custom');
  expect(scoped?.department_ids).toEqual([child!.id]);
  // Reopening the editor echoes the granted point, the scope and the department selection.
  await page.getByRole('row').filter({ hasText: '区域记录员' }).getByRole('button', { name: '编辑角色 区域记录员', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑角色', exact: true });
  await expect(editDialog.getByRole('combobox', { name: '数据范围', exact: true })).toContainText('自定义');
  await editDialog.getByRole('button', { name: /高级/ }).click();
  const echoPanel = editDialog.getByRole('group', { name: '权限点' });
  await expect(echoPanel.getByRole('checkbox', { name: '使用我的笔记', exact: true })).toBeChecked();
  await expect(editDialog.getByRole('group', { name: '自定义部门范围' }).getByRole('checkbox', { name: '前端组' })).toBeChecked();
  await editDialog.getByRole('button', { name: '取消', exact: true }).click();
  // The user console attaches the child department and resolves its name in the list.
  await page.goto(`${instance.url}/admin/users`);
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  const userDialog = page.getByRole('dialog', { name: '新增用户', exact: true });
  await userDialog.getByLabel('账号', { exact: true }).fill('deptmember');
  await userDialog.getByLabel('邮箱', { exact: true }).fill('deptmember@example.test');
  await userDialog.getByLabel('初始密码', { exact: true }).fill(member);
  await chooseOption(page, '部门', /前端组/, userDialog);
  await userDialog.getByRole('button', { name: '创建用户', exact: true }).click();
  await expect(userDialog).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: 'deptmember' });
  await expect(row).toBeVisible();
  await expect(row.getByText('前端组')).toBeVisible();
  await loginClient(admin, 'admin', adminPassword);
  const users = await admin.web!.users('', 1);
  expect(users.items.find(item => item.username === 'deptmember')?.department_id).toBe(child!.id);
  // Deleting the user-attached child reports the 409 constraint and keeps the tree intact.
  await page.goto(`${instance.url}/admin/departments`);
  await page.getByRole('button', { name: '删除 前端组' }).click();
  const confirm = page.getByRole('alertdialog', { name: '删除部门', exact: true });
  await confirm.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('部门下仍有子部门或挂靠用户', { exact: true })).toBeVisible();
  // The guarded-deletion dialog stays open for a retry; cancel keeps the tree intact.
  await confirm.getByRole('button', { name: '取消', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('button', { name: '删除 前端组' })).toBeVisible();
  await loginClient(admin, 'admin', adminPassword);
  expect((await admin.web!.listDepartments()).total).toBe(2);
});

test('note attachments ride any-mode file access while unrelated files stay refused', async ({ page, browser, instance }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const config = await admin.web!.menuConfig();
  // A notes-only role: no files:access anywhere, but the any-mode fileAccess
  // grant is valid because the upper bound holds notes:access.
  const permissions = ['notes:access', 'notes:create', 'files:upload'];
  const notewriter = await admin.web!.createRole({
    name: '笔记员', permissions, realm: 'user',
    menu_ids: menuChain(config, 'notes'),
    operation_ids: [...new Set([...materializedOperations('user', permissions), 'fileAccess'])],
  });
  expect(notewriter.operation_ids).toContain('fileAccess');
  await admin.web!.createUser({ username: 'notewriter', email: 'notewriter@example.test', password: member, role: notewriter.id });
  // A peer with explicit upload grants keeps a file that must never be reachable.
  await admin.web!.createUser({ username: 'peer', email: 'peer@example.test', password: member, role: notewriter.id });

  const contexts: import('@playwright/test').BrowserContext[] = [];
  try {
    const writerContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile' });
    contexts.push(writerContext);
    const writer = await writerContext.newPage();
    await workspaceLogin(writer, instance.url, 'notewriter');
    const writerApi = sdkClient(instance.url, 'user');
    await loginClient(writerApi, 'notewriter', member);
    // The attachment is uploaded through the files:upload path only.
    const attachment = await writerApi.uploadFile(new File([Buffer.from('attached bytes')], 'note-attachment.txt', { type: 'text/plain' }));
    const note = await writerApi.createNote({ title: '附件笔记', body: '正文', status: 'open', attachment_ids: [attachment.file_id] });
    // The peer uploads through explicitly assigned API grants.
    const peerContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile' });
    contexts.push(peerContext);
    await peerContext.newPage();
    const peerApi = sdkClient(instance.url, 'user');
    await loginClient(peerApi, 'peer', member);
    const peerFile = await peerApi.uploadFile(new File([Buffer.from('peer bytes')], 'peer-file.txt', { type: 'text/plain' }));
    const peerNote = await peerApi.createNote({ title: '外部笔记', body: '', status: 'open', attachment_ids: [peerFile.file_id] });

    const csrf = (await (await writer.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data.csrf_token;
    const headers = { 'X-CSRF-Token': csrf };
    const access = async (fileId: string, noteId?: string) => writer.request.post(`${instance.url}/api/v1/files/${fileId}/access${noteId ? `?note_id=${noteId}` : ''}`, { headers, data: {} });
    // Plain signing stays gated by files:access.
    expect((await access(attachment.file_id)).status()).toBe(403);
    // Attachment signing rides on the notes grant through the any mode.
    const granted = await access(attachment.file_id, note.id);
    expect(granted.status()).toBe(200);
    expect(((await granted.json()).data as { url: string }).url).toBeTruthy();
    // Another member's file is unreachable even through the reader's own note.
    expect((await access(peerFile.file_id, note.id)).status()).toBe(404);
    // Someone else's note never widens the reader's own file either.
    expect([403, 404]).toContain((await access(attachment.file_id, peerNote.id)).status());
    // The notes page still renders the attachment entry for the notes-only member.
    await writer.goto(`${instance.url}/notes`);
    await expect(writer.getByRole('heading', { name: '个人笔记', exact: true })).toBeVisible();
    await expect(writer.getByText('附件笔记', { exact: true })).toBeVisible();
    await expect(writer.getByRole('button', { name: '附件 1', exact: true })).toBeVisible();
  } finally {
    for (const context of contexts) await context.close();
  }
});

test('api grants stay revocable, respect any/all bounds and survive restarts', async ({ instance }) => {
  test.setTimeout(180000);
  await installPlatform(instance);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const config = await admin.web!.menuConfig();
  // A user-realm role whose single API grant rides on notes:access.
  const recorder = await admin.web!.createRole({ name: '记录员', permissions: ['notes:access'], realm: 'user', menu_ids: menuChain(config, 'notes'), operation_ids: ['listNotes'] });
  await admin.web!.createUser({ username: 'recorder', email: 'recorder@example.test', password: member, role: recorder.id });
  // An administrator-realm role exercising the all mode.
  const operator = await admin.web!.createRole({ name: '运营', permissions: ['admin:access', 'notes:access'], realm: 'administrator', operation_ids: ['adminListNotes'] });
  await admin.web!.createAdministrator({ username: 'operator', email: 'operator@example.test', password: 'operator-password-strong', role: operator.id });

  const recorderApi = sdkClient(instance.url, 'user');
  await loginClient(recorderApi, 'recorder', member);
  expect((await recorderApi.listNotes({ search: '', status: '', sort: 'updated_at', direction: 'desc', page: 1 })).items).toEqual([]);
  // The any mode needs one shared point; the all mode needs the full set.
  await expect(admin.web!.updateRole(recorder.id, { name: '记录员', permissions: ['notes:access'], operation_ids: ['listUsers'] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await expect(admin.web!.updateRole(recorder.id, { name: '记录员', permissions: ['notes:access'], operation_ids: ['createNote'] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  // Revoking the operation grant blocks the API even though the permission
  // upper bound (notes:access) is still held: the grant is independently required.
  await admin.web!.updateRole(recorder.id, { name: '记录员', permissions: ['notes:access'], operation_ids: [] });
  await loginClient(recorderApi, 'recorder', member);
  await expect(recorderApi.listNotes({ search: '', status: '', sort: 'updated_at', direction: 'desc', page: 1 })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await admin.web!.updateRole(recorder.id, { name: '记录员', permissions: ['notes:access'], operation_ids: ['listNotes'] });
  await loginClient(recorderApi, 'recorder', member);
  expect((await recorderApi.listNotes({ search: '', status: '', sort: 'updated_at', direction: 'desc', page: 1 })).items).toEqual([]);

  const operatorApi = sdkClient(instance.url, 'administrator');
  await loginClient(operatorApi, 'operator', 'operator-password-strong');
  const adminNotes = await operatorApi.listNotes({ search: '', status: '', sort: 'updated_at', direction: 'desc', page: 1 });
  expect(Array.isArray(adminNotes.items)).toBe(true);
  // Stripping the admin:access point invalidates the all-mode grant as well.
  await admin.web!.updateRole(operator.id, { name: '运营', permissions: ['notes:access'], operation_ids: [] });
  await loginClient(operatorApi, 'operator', 'operator-password-strong');
  await expect(operatorApi.listNotes({ search: '', status: '', sort: 'updated_at', direction: 'desc', page: 1 })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });

  // The builtin user role loses one point together with its dependent grant.
  const builtin = (await admin.web!.roles()).items.find(item => item.id === 'user')!;
  const revokedPermissions = builtin.permissions.filter(id => id !== 'notes:delete');
  await admin.web!.updateRole('user', { name: builtin.name, permissions: revokedPermissions, operation_ids: materializedOperations('user', revokedPermissions) });
  await admin.web!.createUser({ username: 'fullmember', email: 'fullmember@example.test', password: member, role: 'user' });
  const fullApi = sdkClient(instance.url, 'user');
  await loginClient(fullApi, 'fullmember', member);
  const deletable = await fullApi.createNote({ title: '待删笔记', body: '', status: 'open' });
  await fullApi.listNotes({ search: '', status: '', sort: 'updated_at', direction: 'desc', page: 1 });
  // Every revoked grant stays revoked across a full instance restart; the UI
  // button rendering is covered by the button-level grants test.
  await instance.restart();
  await loginClient(fullApi, 'fullmember', member);
  await expect(fullApi.deleteNote(deletable.id, deletable.version)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  // The recorder's listNotes grant was restored mid-test, so it keeps working
  // after the restart; the builtin and operator revocations must persist.
  await loginClient(recorderApi, 'recorder', member);
  await expect(recorderApi.listNotes({ search: '', status: '', sort: 'updated_at', direction: 'desc', page: 1 })).resolves.toMatchObject({ total: 0 });
  await loginClient(operatorApi, 'operator', 'operator-password-strong');
  await expect(operatorApi.listNotes({ search: '', status: '', sort: 'updated_at', direction: 'desc', page: 1 })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
});

test('menus-only operators edit the tree but can never widen authorizations', async ({ page, browser, instance }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const config = await admin.web!.menuConfig();
  const labelOf = (routeId: string) => nodeDisplayLabel(pageNode(config, routeId) ?? { label: '', id: routeId, route_id: routeId });
  const navigator = await admin.web!.createRole({
    name: '导航编辑', permissions: ['menus:write'], realm: 'administrator',
    menu_ids: menuChain(config, 'menus'),
    operation_ids: ['listMenus', 'saveMenus'],
  });
  await admin.web!.createAdministrator({ username: 'navigator', email: 'navigator@example.test', password: 'navigator-password-strong', role: navigator.id });
  const before = await admin.web!.roles();

  const contexts: import('@playwright/test').BrowserContext[] = [];
  try {
    const navContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile' });
    contexts.push(navContext);
    const navigatorPage = await navContext.newPage();
    await adminLogin(navigatorPage, instance.url, 'navigator', 'navigator-password-strong');
    // Overview is not granted for the menus-only operator: enter through the granted page.
    await navigatorPage.goto(`${instance.url}/admin/menus`);
    await navigate(navigatorPage, labelOf('menus'));
    await expect(navigatorPage.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
    // The editor is a pure layout tool: no per-row assignment affordance at
    // all, so a menus:write operator cannot even reach the authorization path.
    await expect(navigatorPage.locator('tr[data-node]').first().getByTitle('角色分配需要超级管理员的角色权限')).toHaveCount(0);
    await expect(navigatorPage.getByRole('button', { name: /分配 .* 的角色/ })).toHaveCount(0);
    await navigatorPage.goto(`${instance.url}/admin/roles`);
    await expect(navigatorPage.getByText('没有访问权限', { exact: true })).toBeVisible();

    const navigatorApi = sdkClient(instance.url, 'administrator');
    await loginClient(navigatorApi, 'navigator', 'navigator-password-strong');
    // Tree edits themselves stay allowed with menus:write alone; the save
    // revokes every session, so the operator re-authenticates before the
    // authorization attempts.
    const tree = await navigatorApi.web!.menuConfig();
    await navigatorApi.web!.saveMenuConfig({ version: tree.version, sections: tree.sections, nodes: tree.nodes });
    await loginClient(navigatorApi, 'navigator', 'navigator-password-strong');
    // Every authorization-widening path is refused: role assignments, reset
    // and role management all need super_admin with roles:write.
    await expect(navigatorApi.web!.saveMenuConfig({
      version: tree.version + 1, sections: tree.sections, nodes: tree.nodes,
      role_assignments: [{ role_id: 'user', menu_ids: tree.nodes.filter(node => node.type !== 'action' && node.section_id === 'user:business').map(node => node.id), action_ids: [] }],
    })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(navigatorApi.web!.saveMenuConfig({ version: tree.version + 1, sections: [], nodes: [], reset: true })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(navigatorApi.web!.createRole({ name: '越权角色', permissions: ['roles:write'], realm: 'administrator' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    // The refused attempts changed nothing.
    await loginClient(admin, 'admin', adminPassword);
    const after = await admin.web!.roles();
    expect(after.items.map(item => `${item.id}:${[...(item.menu_ids ?? [])].sort().join(',')}`)).toEqual(before.items.map(item => `${item.id}:${[...(item.menu_ids ?? [])].sort().join(',')}`));
  } finally {
    for (const context of contexts) await context.close();
  }
});
