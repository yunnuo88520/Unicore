// Author: yunnuo <ymz@ebox.vip>
// Description: The menu console edits the persisted section/node tree that every
// navigation presentation renders; role assignments filter visibility without
// ever widening API capability.
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { MenuList } from '../../packages/sdk/src';
import { test, expect, installPlatform, adminLogin, workspaceLogin, sdkClient, loginClient, nodeDisplayLabel, pageNode, menuChain, memberPassword } from './fixtures';

const adminPassword = 'administrator-password-strong';

async function evidence(page: Page, info: TestInfo, feature: string, fullPage = true) {
  if (info.project.name === 'mobile') expect(page.viewportSize()?.width).toBe(375);
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${feature}: viewport overflow`).toBe(true);
  const directory = `build/acceptance/navigation/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${feature}.png`, fullPage, animations: 'disabled' });
}

// The editor target cell echoes the stable route id, so rows are located by
// target instead of operator labels. Columns: 名称/类型/工作台/图标/目标.
function rowByTarget(page: Page, target: string) {
  return page.locator('tr[data-node-type="page"]').filter({ has: page.locator('td').nth(4).filter({ hasText: target }) });
}

async function pageTargets(page: Page) {
  return page.locator('tr[data-node-type="page"]').evaluateAll(rows => rows.map(row => row.querySelector('td:nth-child(5)')?.textContent?.trim() ?? ''));
}

// Every grant-affecting save revokes every session, so operators and SDK
// clients re-authenticate before their next call.
test.setTimeout(120_000);

test('menu console edits the persisted tree and one save re-anchors every session', async ({ page, instance }, info) => {
  await installPlatform(instance, { username: 'admin', email: 'admin@example.test', password: adminPassword });
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const config: MenuList = await admin.web!.menuConfig();
  const labelOf = (routeId: string) => nodeDisplayLabel(pageNode(config, routeId) ?? { label: '', id: routeId, route_id: routeId });
  // The badge text joins the accessible name once the tree is saved.
  const dictButtonName = new RegExp(`^${labelOf('dictionaries').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

  await adminLogin(page, instance.url, 'admin', adminPassword);
  await page.goto(`${instance.url}/admin/menus`);
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
  // One shared tree: every seeded region renders once and its surfaces
  // checkboxes decide which workspaces the region reaches.
  for (const section of ['business', 'personal', 'system']) {
    const editor = page.locator(`section[data-section="${section}"]`);
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('checkbox', { name: '成员端', exact: true })).toBeVisible();
    await expect(editor.getByRole('checkbox', { name: '管理端', exact: true })).toBeVisible();
  }
  // Directories start collapsed; the seeded 超级管理员 directory is the only
  // one, so expanding it exposes every administration page as an editable row
  // keyed by target (system and personal pages sit at their section top).
  await page.locator('tr[data-node="administration"]').getByRole('button', { name: /展开或收起/ }).click();
  const targets = await pageTargets(page);
  for (const route of ['users', 'roles', 'menus', 'tasks', 'edition', 'dictionaries', 'posts', 'api-operations']) {
    expect(targets, `editor row for ${route}`).toContain(route);
  }
  await expect(page.getByRole('button', { name: '保存菜单配置', exact: true })).toBeEnabled();
  await evidence(page, info, '菜单管理默认清单');

  // Rename the section that owns the 用户列表 row.
  const usersRow = rowByTarget(page, 'users');
  await expect(usersRow).toBeVisible();
  const governSection = page.locator('section[data-section]').filter({ has: usersRow });
  await governSection.getByLabel('区域名称', { exact: true }).fill('运营与治理');
  await expect(page.getByText('有未保存的更改', { exact: true })).toBeVisible();

  // A fresh directory in the same section becomes the nesting target.
  await governSection.getByRole('button', { name: '目录', exact: true }).click();
  const directoryDialog = page.getByRole('dialog', { name: '添加目录', exact: true });
  await directoryDialog.getByLabel('显示名称', { exact: true }).fill('报表中心');
  await directoryDialog.getByRole('button', { name: '添加', exact: true }).click();
  await expect(directoryDialog).toHaveCount(0);
  const reportDirectory = governSection.locator('tr[data-node-type="directory"]').filter({ hasText: '报表中心' });
  await expect(reportDirectory).toBeVisible();

  // Nesting: the 数据字典 page moves under the new directory.
  await rowByTarget(page, 'dictionaries').getByRole('button', { name: `${labelOf('dictionaries')}的操作`, exact: true }).click();
  await page.getByRole('menuitem', { name: '移动…', exact: true }).click();
  const moveDialog = page.getByRole('dialog', { name: '移动节点', exact: true });
  await expect(moveDialog.getByText(/深度最多 5 层/)).toBeVisible();
  await moveDialog.getByRole('combobox', { name: '目标位置', exact: true }).click();
  await page.getByRole('option', { name: '报表中心', exact: true }).click();
  await moveDialog.getByRole('button', { name: '移动', exact: true }).click();
  await expect(moveDialog).toHaveCount(0);
  await expect(rowByTarget(page, 'dictionaries')).toBeVisible();

  // Operator links validate their URL and may open in a new tab.
  await reportDirectory.getByRole('button', { name: '报表中心的操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '添加子链接…', exact: true }).click();
  const linkDialog = page.getByRole('dialog', { name: '添加链接', exact: true });
  await linkDialog.getByLabel('显示名称', { exact: true }).fill('帮助中心');
  await linkDialog.getByLabel('链接地址', { exact: true }).fill('javascript:alert(1)');
  await linkDialog.getByRole('button', { name: '添加', exact: true }).click();
  await expect(linkDialog.getByText('链接地址需为站内已注册路径或 http(s) 地址', { exact: true })).toBeVisible();
  // A registered in-site path keeps the new-tab assertion free of external DNS.
  await linkDialog.getByLabel('链接地址', { exact: true }).fill('/notes');
  await linkDialog.getByRole('combobox', { name: '打开方式', exact: true }).click();
  await page.getByRole('option', { name: '新窗口', exact: true }).click();
  await linkDialog.getByRole('button', { name: '添加', exact: true }).click();
  await expect(linkDialog).toHaveCount(0);

  // Badge: the dictionaries page carries a dot plus text after an edit.
  await rowByTarget(page, 'dictionaries').getByRole('button', { name: `${labelOf('dictionaries')}的操作`, exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑节点', exact: true });
  await editDialog.getByLabel('角标文字', { exact: true }).fill('新');
  // The dot switch sits inside a wrapping label whose text shadows the
  // accessible name, so target the switch inside that label.
  await editDialog.locator('label').filter({ hasText: '圆点角标' }).getByRole('switch').click();
  await editDialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editDialog).toHaveCount(0);

  await page.getByRole('button', { name: '保存菜单配置', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '菜单配置已保存' })).toBeVisible();
  // A pure tree save re-presents the same grants: the session stays valid.
  await page.reload();

  // The workspace navigation renders the saved tree in normal mode.
  if (info.project.name === 'mobile') await page.getByRole('button', { name: '打开导航', exact: true }).click();
  const sidebar = page.locator('.sidebar');
  const normalNav = sidebar.locator('nav[data-navigation-mode="normal"]');
  await expect(normalNav).toBeVisible();
  const governNav = sidebar.locator('section[data-nav-section]').filter({ hasText: '运营与治理' });
  await expect(governNav.locator('h2')).toHaveText('运营与治理');
  await expect(governNav.getByRole('button', { name: '报表中心', exact: true })).toBeVisible();
  // Parent pages stay reachable through their directory (expanded by default;
  // only collapse it again on purpose).
  const directoryToggle = sidebar.getByRole('button', { name: '报表中心', exact: true });
  if (await directoryToggle.getAttribute('aria-expanded') === 'false') await directoryToggle.click();
  // The badge renders inside the entry, so the accessible name carries it.
  await sidebar.getByRole('button', { name: dictButtonName }).click();
  await expect(page).toHaveURL(`${instance.url}/admin/dictionaries`);
  await expect(page.getByRole('heading', { name: /数据字典/ })).toBeVisible();
  // The drawer closes on navigation; reopen it for the remaining sidebar checks.
  if (info.project.name === 'mobile') await page.getByRole('button', { name: '打开导航', exact: true }).click();
  const dictNode = governNav.locator('[data-nav-node]').filter({ hasText: labelOf('dictionaries') }).last();
  await expect(dictNode.locator('span[aria-label="新"]')).toBeVisible();
  // Record the wide-tree relative order for the cross-presentation check.
  const orderIn = async (locator: ReturnType<Page['locator']>, labels: string[]) => {
    const entries = await locator.evaluateAll(els => els.map(el => el.textContent ?? ''));
    return labels.map(label => entries.reduce((found, text, index) => text.includes(label) ? index : found, -1));
  };
  const wideOrder = await orderIn(governNav.locator('[data-nav-node]'), [labelOf('dictionaries'), '帮助中心']);

  // Operator links open a new tab from every presentation.
  const popupPromise = page.waitForEvent('popup');
  await sidebar.getByRole('button', { name: '帮助中心', exact: true }).click();
  const popup = await popupPromise;
  // The admin shell prefixes its basename; the popup target stays the linked page.
  expect(new URL(popup.url()).pathname).toMatch(/\/notes$/);
  await popup.close();

  await evidence(page, info, '侧栏层级与外链');

  // Rail mode renders the same ordered tree through keyboard-accessible menus.
  if (info.project.name !== 'mobile') {
    await page.goto(`${instance.url}/admin`);
    await page.getByRole('button', { name: '收起导航', exact: true }).click();
    const railNav = sidebar.locator('nav[data-navigation-mode="rail"]');
    await expect(railNav).toBeVisible();
    expect((await sidebar.boundingBox())!.width).toBe(48);
    await expect(sidebar.getByRole('button', { name: dictButtonName })).toHaveCount(0);
    await sidebar.getByRole('button', { name: '报表中心', exact: true }).click();
    const railMenu = page.getByRole('menu', { name: '报表中心', exact: true });
    const railOrder = await orderIn(railMenu.getByRole('menuitem'), [labelOf('dictionaries'), '帮助中心']);
    // Rail and wide tree agree on the relative order of the same nodes.
    expect(Math.sign(railOrder[0] - railOrder[1])).toBe(Math.sign(wideOrder[0] - wideOrder[1]));
    await railMenu.getByRole('menuitem', { name: dictButtonName }).click();
    await expect(page).toHaveURL(`${instance.url}/admin/dictionaries`);
    await page.getByRole('button', { name: '展开导航', exact: true }).click();
    await expect(normalNav).toBeVisible();
  }
  await evidence(page, info, '导航三种形态一致');

  // A stale CAS is refused wholesale with the conflict explainer: the editor
  // loaded before an out-of-band save bumped the version.
  await page.goto(`${instance.url}/admin/menus`);
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
  await loginClient(admin, 'admin', adminPassword);
  const fresh = await admin.web!.menuConfig();
  await admin.web!.saveMenuConfig({ version: fresh.version, sections: fresh.sections, nodes: fresh.nodes });
  const staleSection = page.locator('section[data-section]').filter({ hasText: '报表中心' });
  await staleSection.getByLabel('区域名称', { exact: true }).fill('又一次编辑');
  const conflict = page.waitForResponse(r => r.url().includes('/admin/menus') && r.request().method() === 'PUT' && r.status() === 409);
  await page.getByRole('button', { name: '保存菜单配置', exact: true }).click();
  await conflict;
  await expect(page.getByRole('alert').filter({ hasText: '记录已被修改，请刷新后重试' })).toBeVisible();
  await evidence(page, info, '菜单保存版本冲突', false);
});

test('menu visibility follows role assignments while API capability stays independent', async ({ page, browser, instance }, info) => {
  await installPlatform(instance, { username: 'admin', email: 'admin@example.test', password: adminPassword });
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const config = await admin.web!.menuConfig();
  const labelOf = (routeId: string) => nodeDisplayLabel(pageNode(config, routeId) ?? { label: '', id: routeId, route_id: routeId });
  // A role with page permissions, one granted menu chain and a single API grant.
  const notesChain = menuChain(config, 'notes');
  const recorder = await admin.web!.createRole({ name: '记录员', permissions: ['notes:access', 'files:access'], realm: 'user', menu_ids: notesChain, operation_ids: ['listNotes'] });
  expect([...recorder.menu_ids].sort()).toEqual([...notesChain].sort());
  expect(recorder.operation_ids).toEqual(['listNotes']);
  await admin.web!.createUser({ username: 'scoped', email: 'scoped@example.test', password: memberPassword, role: recorder.id });

  const memberApi = sdkClient(instance.url, 'user');
  await loginClient(memberApi, 'scoped', memberPassword);
  const memberBootstrap = await memberApi.bootstrap();
  // The projected navigation carries exactly the granted chains.
  for (const node of memberBootstrap.navigation?.nodes ?? []) {
    if (node.type === 'action') {
      expect(memberBootstrap.current_user?.action_ids).toContain(node.id);
      expect(node.operation_ids).toEqual(['listNotes']);
    } else {
      expect(notesChain).toContain(node.id);
    }
  }
  const contexts: BrowserContext[] = [];
  try {
    const memberContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile' });
    contexts.push(memberContext);
    const member = await memberContext.newPage();
    await workspaceLogin(member, instance.url, 'scoped');
    // Overview is not granted for this role: enter through the granted page to get the sidebar.
    await member.goto(`${instance.url}/notes`);
    if (info.project.name === 'mobile') await member.getByRole('button', { name: '打开导航', exact: true }).click();
    const memberSidebar = member.locator('.sidebar');
    await expect(memberSidebar.getByRole('button', { name: labelOf('notes'), exact: true })).toBeVisible();
    // The files page is not in the role's menu authorization at all.
    await expect(memberSidebar.getByRole('button', { name: labelOf('files'), exact: true })).toHaveCount(0);
    if (info.project.name === 'mobile') await member.keyboard.press('Escape');
    // Direct URL still serves the page (permission bound), but the API layer
    // refuses: the role holds files:access without the listFiles grant.
    await member.goto(`${instance.url}/files`);
    await expect(member.getByText('没有访问权限', { exact: true })).toBeVisible();
    await expect(memberApi.files!.listFiles('', 1)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await evidence(member, info, '菜单过滤且API拒绝');

    // Granting a menu through the role editor changes visibility only; the
    // menu console stays a pure layout tool with no per-row assignments.
    await adminLogin(page, instance.url, 'admin', adminPassword);
    await page.goto(`${instance.url}/admin/roles`);
    await page.getByRole('row').filter({ hasText: '记录员' }).getByRole('button', { name: '编辑角色 记录员', exact: true }).click();
    const roleEditor = page.getByRole('dialog', { name: '编辑角色', exact: true });
    // Checking the page carries its menu grant plus auto-selected API
    // operations; stripping every file operation again keeps this a menu-only
    // grant, so the assignment changes visibility and nothing else.
    await roleEditor.getByRole('region', { name: '业务', exact: true }).getByLabel(labelOf('files'), { exact: true }).check();
    await roleEditor.getByRole('button', { name: `展开或收起 ${labelOf('files')}`, exact: true }).click();
    for (const operation of ['listFiles', 'fileAccess', 'deleteFile', 'createFileUpload', 'uploadLocalFile', 'completeFileUpload', 'createMultipartUpload', 'multipartUpload', 'signUploadPart', 'uploadLocalPart', 'completeMultipartUpload']) {
      await roleEditor.getByLabel(operation, { exact: true }).uncheck();
    }
    await roleEditor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(roleEditor).toHaveCount(0);
    await loginClient(admin, 'admin', adminPassword);
    const updated = (await admin.web!.roles()).items.find(role => role.id === recorder.id)!;
    expect(updated.menu_ids).toContain(pageNode(config, 'files')!.id);
    // The assignment path never touches API grants.
    expect(updated.operation_ids).toEqual(['listNotes']);

    // Saving the role revokes its members' sessions (permissions take effect
    // immediately), so the member returns through a clean login.
    await member.context().clearCookies();
    await workspaceLogin(member, instance.url, 'scoped');
    // The files page never renders on the user surface, and the menu grant
    // alone still grants no API capability.
    await expect(memberSidebar.getByRole('button', { name: labelOf('files'), exact: true })).toHaveCount(0);
    await expect((await member.request.get(`${instance.url}/api/v1/files`)).status()).toBe(403);

    // The role console closes the gap: explicit API grants unlock the list.
    await page.goto(`${instance.url}/admin/roles`);
    await page.getByRole('row').filter({ hasText: '记录员' }).getByRole('button', { name: '编辑角色 记录员', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '编辑角色', exact: true });
    // API grants live in the page's expandable detail instead of a separate tab.
    await editor.getByRole('button', { name: `展开或收起 ${labelOf('files')}`, exact: true }).click();
    for (const operation of ['listFiles', 'fileAccess']) {
      await editor.getByLabel(operation, { exact: true }).check();
    }
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await member.context().clearCookies();
    await workspaceLogin(member, instance.url, 'scoped');
    await expect((await member.request.get(`${instance.url}/api/v1/files`)).status()).toBe(200);
    await evidence(member, info, 'API授权后文件列表可用');
  } finally {
    for (const context of contexts) await context.close();
  }
});

test('recovery and reset keep the editor reachable and restore both surfaces', async ({ page, instance }, info) => {
  await installPlatform(instance, { username: 'admin', email: 'admin@example.test', password: adminPassword });
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const config = await admin.web!.menuConfig();
  const labelOf = (routeId: string) => nodeDisplayLabel(pageNode(config, routeId) ?? { label: '', id: routeId, route_id: routeId });

  // Hide the menu editor itself: the recovery entry keeps it reachable.
  const menusNode = pageNode(config, 'menus')!;
  await admin.web!.saveMenuConfig({ version: config.version, sections: config.sections, nodes: config.nodes.map(node => node.id === menusNode.id ? { ...node, visible: false } : node) });
  await adminLogin(page, instance.url, 'admin', adminPassword);
  if (info.project.name === 'mobile') await page.getByRole('button', { name: '打开导航', exact: true }).click();
  const sidebar = page.locator('.sidebar');
  // The recovery section is synthesized server- or client-side; its id always
  // carries "recovery" and its entry keeps the menu editor reachable.
  const recovery = sidebar.locator('section[data-nav-section*="recovery"]');
  await expect(recovery).toBeVisible();
  await recovery.getByRole('button', { name: /菜单管理|menus/ }).click();
  await expect(page).toHaveURL(`${instance.url}/admin/menus`);
  await evidence(page, info, '菜单恢复入口');

  // Reset restores both surfaces and wipes operator overrides.
  await page.getByRole('button', { name: '恢复默认', exact: true }).click();
  const resetDialog = page.getByRole('alertdialog', { name: '恢复默认菜单配置', exact: true });
  await expect(resetDialog.getByText(/清空用户端与管理端/)).toBeVisible();
  await resetDialog.getByRole('button', { name: '恢复默认', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '菜单配置已保存' })).toBeVisible();
  await loginClient(admin, 'admin', adminPassword);
  const reset = await admin.web!.menuConfig();
  expect(reset.nodes.find(node => node.route_id === 'menus')?.visible).toBe(true);
  await page.reload();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await expect(sidebar.getByRole('button', { name: labelOf('menus'), exact: true })).toBeVisible();
  await page.goto(`${instance.url}/admin/menus`);
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
  await evidence(page, info, '恢复默认两区域');
});

test('visibility toggles persist through save', async ({ page, instance }) => {
  await installPlatform(instance, { username: 'admin', email: 'admin@example.test', password: adminPassword });
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  await adminLogin(page, instance.url, 'admin', adminPassword);
  await page.goto(`${instance.url}/admin/menus`);
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
  await page.locator('tr[data-node="administration"]').getByRole('button', { name: /展开或收起/ }).click();
  const tasksRow = rowByTarget(page, 'tasks');
  await expect(tasksRow).toBeVisible();
  const tasksSwitch = tasksRow.getByRole('switch');
  await tasksSwitch.click();
  await expect(tasksSwitch).toHaveAttribute('data-state', 'unchecked');
  await expect(page.getByText('有未保存的更改', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存菜单配置', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '菜单配置已保存' })).toBeVisible();
  const tree = await admin.web!.menuConfig();
  expect(tree.nodes.find(node => node.route_id === 'tasks')?.visible).toBe(false);
});
