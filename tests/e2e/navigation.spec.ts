// Author: yunnuo <ymz@ebox.vip>
// Description: The menu console edits the persisted section/node tree that every
// navigation presentation renders; role assignments filter visibility without
// ever widening API capability.
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { MenuList } from '../../packages/sdk/src';
import { chooseOption, test, expect, installPlatform, adminLogin, workspaceLogin, sdkClient, loginClient, nodeDisplayLabel, pageNode, menuChain, memberPassword } from './fixtures';

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
// target instead of operator labels. The page is one tree table whose columns
// are 名称/类型/目标, so the target is the third cell; node rows carry their
// owning region id in data-section and region rows are tr[data-region].
function rowByTarget(page: Page, target: string) {
  return page.locator('tr[data-node-type="page"]').filter({ has: page.locator('td').nth(2).filter({ hasText: target }) });
}

async function pageTargets(page: Page) {
  return page.locator('tr[data-node-type="page"]').evaluateAll(rows => rows.map(row => row.querySelector('td:nth-child(3)')?.textContent?.trim() ?? ''));
}

// Node rows keep their owning region id in data-section, so the region row is
// resolved from the row instead of DOM nesting (tree rows are siblings).
async function regionRowOf(page: Page, row: ReturnType<Page['locator']>) {
  return page.locator(`tr[data-region="${await row.getAttribute('data-section')}"]`);
}

// The editor reads three landing zones per row: the upper third inserts the
// dragged row before the target, the lower third after it, and the middle
// nests it as the target's child; a region row always takes the subtree to
// that region's top level. Edge offsets keep the pointer inside the requested
// third whatever the rendered row height.
async function rowPoint(page: Page, selector: string, edge: 'top' | 'middle' | 'bottom') {
  const box = await page.locator(selector).boundingBox();
  const x = (box?.x ?? 0) + 40;
  if (edge === 'top') return { x, y: (box?.y ?? 0) + 8 };
  if (edge === 'bottom') return { x, y: (box?.y ?? 0) + Math.round(box?.height ?? 0) - 8 };
  return { x: (box?.x ?? 0) + Math.round((box?.width ?? 0) / 2), y: (box?.y ?? 0) + Math.round((box?.height ?? 0) / 2) };
}

// HTML5 drag between two rows through raw pointer steps: hover the source,
// press, move to the requested target point and release. This drives exactly
// the dragstart/dragover/drop sequence the editor reads — the locator dragTo
// pre-check loop can stall across repeated drags under mobile emulation.
async function dragRow(page: Page, sourceSelector: string, targetSelector: string, edge: 'top' | 'middle' | 'bottom') {
  await page.locator(sourceSelector).hover();
  const point = await rowPoint(page, targetSelector, edge);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 4 });
  await page.mouse.up();
}

// Pointer drags never deliver dragover to off-viewport coordinates or to rows
// hidden under the sticky header band, and a scroll that centers one endpoint
// can push the other out of view. Center the span covering both endpoints,
// then shift both below the header band.
async function revealSpan(page: Page, firstSelector: string, secondSelector: string) {
  await page.evaluate(([first, second]) => {
    const firstRow = document.querySelector(first);
    const secondRow = document.querySelector(second);
    if (!firstRow || !secondRow) return;
    const top = Math.min(firstRow.getBoundingClientRect().top, secondRow.getBoundingClientRect().top);
    const bottom = Math.max(firstRow.getBoundingClientRect().bottom, secondRow.getBoundingClientRect().bottom);
    if (top < 0 || bottom > window.innerHeight) {
      window.scrollBy({ top: Math.round((top + bottom) / 2 - window.innerHeight / 2) });
    }
    const minTop = Math.min(firstRow.getBoundingClientRect().top, secondRow.getBoundingClientRect().top);
    const headerBand = 64;
    if (minTop < headerBand) window.scrollBy({ top: Math.round(minTop - headerBand) });
  }, [firstSelector, secondSelector]);
}

// Every row's action column holds one ⋯ trigger; clicking it opens the
// more-actions dropdown whose items render in a portal (page root).
async function openRowMenu(page: Page, row: ReturnType<Page['locator']>, name: string) {
  await row.getByRole('button', { name: `更多操作：${name}`, exact: true }).click();
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
  // One shared tree: both seeded regions render once as region root rows and no
  // workspace concept (surfaces toggles or badges) ever appears in the editor.
  for (const section of ['business', 'system']) {
    await expect(page.locator(`tr[data-region="${section}"]`)).toBeVisible();
  }
  await expect(page.getByRole('checkbox', { name: '成员端', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '管理端', exact: true })).toHaveCount(0);
  // Directories start collapsed; expanding the seeded 超级管理员 and 系统设置
  // directories exposes their pages as editable rows keyed by target (the
  // personal center keeps no directory — it opens from the account menus).
  await page.locator('tr[data-node="administration"]').getByRole('button', { name: /展开或收起/ }).click();
  await page.locator('tr[data-node="settings"]').getByRole('button', { name: /展开或收起/ }).click();
  const targets = await pageTargets(page);
  for (const route of ['users', 'roles', 'menus', 'tasks', 'edition', 'dictionaries', 'posts', 'site', 'storage', 'logs']) {
    expect(targets, `editor row for ${route}`).toContain(route);
  }
  await expect(page.getByRole('button', { name: '保存菜单配置', exact: true })).toBeEnabled();
  await evidence(page, info, '菜单管理默认清单');

  // Rename the section that owns the 用户列表 row.
  const usersRow = rowByTarget(page, 'users');
  await expect(usersRow).toBeVisible();
  const governSection = await regionRowOf(page, usersRow);
  await governSection.getByLabel('区域名称', { exact: true }).fill('运营与治理');
  await expect(page.getByText('有未保存的更改', { exact: true })).toBeVisible();

  // A fresh directory in the same section becomes the nesting target; the
  // region row's ⋯ menu carries 添加子菜单 and opens the node dialog preset
  // to that region.
  await openRowMenu(page, governSection, '运营与治理');
  await page.getByRole('menuitem', { name: '添加子菜单', exact: true }).click();
  const directoryDialog = page.getByRole('dialog', { name: '添加目录', exact: true });
  await directoryDialog.getByLabel('显示名称', { exact: true }).fill('报表中心');
  await directoryDialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(directoryDialog).toHaveCount(0);
  const reportDirectory = page.locator('tr[data-node-type="directory"]').filter({ hasText: '报表中心' });
  await expect(reportDirectory).toBeVisible();

  // Nesting: the 数据字典 page moves under the new directory.
  await openRowMenu(page, rowByTarget(page, 'dictionaries'), labelOf('dictionaries'));
  await page.getByRole('menuitem', { name: '移动…', exact: true }).click();
  const moveDialog = page.getByRole('dialog', { name: '移动节点', exact: true });
  await expect(moveDialog.getByText(/深度最多 5 层/)).toBeVisible();
  await moveDialog.getByRole('combobox', { name: '目标位置', exact: true }).click();
  await page.getByRole('option', { name: '报表中心', exact: true }).click();
  await moveDialog.getByRole('button', { name: '移动', exact: true }).click();
  await expect(moveDialog).toHaveCount(0);
  await expect(rowByTarget(page, 'dictionaries')).toBeVisible();

  // Operator links validate their URL and may open in a new tab; the directory
  // row's ⋯ menu presets the parent and the dialog picks the link type.
  await openRowMenu(page, reportDirectory, '报表中心');
  await page.getByRole('menuitem', { name: '添加子菜单', exact: true }).click();
  const linkTypeDialog = page.getByRole('dialog', { name: '添加目录', exact: true });
  await chooseOption(page, '菜单类型', '链接', linkTypeDialog);
  const linkDialog = page.getByRole('dialog', { name: '添加链接', exact: true });
  await linkDialog.getByLabel('显示名称', { exact: true }).fill('帮助中心');
  await linkDialog.getByLabel('链接地址', { exact: true }).fill('javascript:alert(1)');
  await linkDialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(linkDialog.getByText('链接地址需为站内已注册路径或 http(s) 地址', { exact: true })).toBeVisible();
  // A registered in-site path keeps the new-tab assertion free of external DNS.
  await linkDialog.getByLabel('链接地址', { exact: true }).fill('/notes');
  await chooseOption(page, '打开方式', '新标签', linkDialog);
  await linkDialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(linkDialog).toHaveCount(0);

  // Badge: the dictionaries page carries a dot plus text after an edit.
  await openRowMenu(page, rowByTarget(page, 'dictionaries'), labelOf('dictionaries'));
  await page.getByRole('menuitem', { name: '编辑', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑节点', exact: true });
  await editDialog.getByLabel('角标文字', { exact: true }).fill('新');
  // The dot switch sits inside a wrapping label whose text shadows the
  // accessible name, so target the switch inside that label.
  await editDialog.locator('label').filter({ hasText: '圆点角标' }).getByRole('switch').click();
  await editDialog.getByRole('button', { name: '确定', exact: true }).click();
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
    expect((await sidebar.boundingBox())!.width).toBe(60);
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
  const staleDirectoryRow = page.locator('tr[data-node-type="directory"]').filter({ hasText: '报表中心' });
  const staleSection = await regionRowOf(page, staleDirectoryRow);
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
    await expect(member.getByText('页面不存在', { exact: true })).toBeVisible();
    await expect(memberApi.files!.listFiles('', 1)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await evidence(member, info, '菜单过滤且API拒绝');

    // File infrastructure has no page/menu. Explicit API grants remain
    // independent and are configured through the role API.
    await admin.web!.updateRole(recorder.id, {
      name: recorder.name, permissions: ['notes:access', 'files:access'],
      menu_ids: notesChain, operation_ids: ['listNotes', 'listFiles', 'fileAccess'],
    });
    await member.context().clearCookies();
    await workspaceLogin(member, instance.url, 'scoped');
    await expect((await member.request.get(`${instance.url}/api/v1/files`)).status()).toBe(200);
    await expect(memberSidebar.getByRole('button', { name: labelOf('files'), exact: true })).toHaveCount(0);
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
  await expect(resetDialog.getByText(/清空全部自定义区域与节点/)).toBeVisible();
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

// A default instance starts with --api-docs=false: the api_docs capability is
// off, so the seeded administrator entry vanishes from the console sidebar and
// the direct URL fails closed instead of framing a dead reference.
test('an instance without the contract reference keeps API 文档 out of the console', async ({ page, instanceNoDocs }, info) => {
  await installPlatform(instanceNoDocs, { username: 'admin', email: 'admin@example.test', password: adminPassword });
  await adminLogin(page, instanceNoDocs.url, 'admin', adminPassword);
  if (info.project.name === 'mobile') await page.getByRole('button', { name: '打开导航', exact: true }).click();
  const sidebar = page.locator('.sidebar');
  await expect(sidebar.getByRole('button', { name: 'API 文档', exact: true })).toHaveCount(0);
  // The direct URL keeps its honest unavailable state instead of a dead frame.
  await page.goto(`${instanceNoDocs.url}/admin/api-docs`);
  await expect(page.getByText('API 文档不可用，请确认实例已启用 API 文档。', { exact: true })).toBeVisible();
  await evidence(page, info, '未启用契约文档无入口', false);
});

test('visibility toggles persist through save', async ({ page, instance }) => {  await installPlatform(instance, { username: 'admin', email: 'admin@example.test', password: adminPassword });
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

test('drag reordering and cross-region moves save the whole tree, survive a reload, then restore', async ({ page, instance }, info) => {
  await installPlatform(instance, { username: 'admin', email: 'admin@example.test', password: adminPassword });
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const before = await admin.web!.menuConfig();
  await adminLogin(page, instance.url, 'admin', adminPassword);
  await page.goto(`${instance.url}/admin/menus`);
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();

  // Seeded sibling order at the top of the business region: overview before notes.
  const nodeOrder = () => page.locator('tbody tr[data-node]').evaluateAll(rows => rows.map(row => row.getAttribute('data-node') ?? ''));
  expect(await nodeOrder()).toEqual(expect.arrayContaining(['overview', 'notes']));
  const indexOf = async (id: string) => (await nodeOrder()).indexOf(id);
  expect(await indexOf('overview')).toBeLessThan(await indexOf('notes'));

  // Drag the overview row onto the notes row: the drop lands in the lower third
  // of the target row, so overview moves after notes within the same sibling list.
  await dragRow(page, 'tr[data-node="overview"]', 'tr[data-node="notes"]', 'bottom');
  await expect(page.locator('tr[data-node="overview"]')).toBeVisible();
  expect(await indexOf('notes')).toBeLessThan(await indexOf('overview'));
  await expect(page.getByText('有未保存的更改', { exact: true })).toBeVisible();

  // One save submits the whole tree: the toast confirms and the version moves.
  await page.getByRole('button', { name: '保存菜单配置', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '菜单配置已保存' })).toBeVisible();
  await loginClient(admin, 'admin', adminPassword);
  const after = await admin.web!.menuConfig();
  expect(after.version).toBe(before.version + 1);
  const sortOf = (nodes: typeof after.nodes, id: string) => nodes.find(node => node.id === id)?.sort ?? -1;
  expect(sortOf(after.nodes, 'notes')).toBeLessThan(sortOf(after.nodes, 'overview'));

  // The order survives a reload: the server accepted the whole payload.
  await page.reload();
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
  expect(await indexOf('notes')).toBeLessThan(await indexOf('overview'));

  // Full tree drag & drop: releasing the seeded 超级管理员 directory on the
  // middle of the business region's root row means "into that region's top
  // level" — a cross-region move whose whole subtree follows with rewritten
  // sections.
  await revealSpan(page, 'tr[data-node="administration"]', 'tr[data-region="business"]');
  await dragRow(page, 'tr[data-node="administration"]', 'tr[data-region="business"]', 'middle');
  await expect(page.locator('tr[data-node="administration"]')).toHaveAttribute('data-section', 'business');
  await expect(page.getByText('有未保存的更改', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存菜单配置', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '菜单配置已保存' })).toBeVisible();
  await loginClient(admin, 'admin', adminPassword);
  const moved = await admin.web!.menuConfig();
  // The directory and its child page carry the target section together, so the
  // saved parent chain stays inside one section.
  expect(moved.nodes.find(node => node.id === 'administration')?.section_id).toBe('business');
  expect(moved.nodes.find(node => node.route_id === 'users')?.section_id).toBe('business');
  await page.reload();
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
  await expect(page.locator('tr[data-node="administration"]')).toHaveAttribute('data-section', 'business');
  await page.locator('tr[data-node="administration"]').getByRole('button', { name: /展开或收起/ }).click();
  await expect(page.locator('tr[data-node="users"]')).toHaveAttribute('data-section', 'business');
  await evidence(page, info, '拖动跨区移动', false);

  // Drag it back: dropping the directory on the middle of the system region's
  // root row returns the whole subtree to its seeded region. Collapse the
  // directory first — on the 375px viewport the expanded subtree pushes the
  // two drag endpoints further apart than one screen, and the pointer release
  // would land outside the viewport where no dragover ever fires.
  await page.locator('tr[data-node="administration"]').getByRole('button', { name: /展开或收起/ }).click();
  await revealSpan(page, 'tr[data-node="administration"]', 'tr[data-region="system"]');
  await dragRow(page, 'tr[data-node="administration"]', 'tr[data-region="system"]', 'middle');
  await expect(page.locator('tr[data-node="administration"]')).toHaveAttribute('data-section', 'system');
  await page.getByRole('button', { name: '保存菜单配置', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '菜单配置已保存' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
  await loginClient(admin, 'admin', adminPassword);
  const restored = await admin.web!.menuConfig();
  expect(restored.nodes.find(node => node.id === 'administration')?.section_id).toBe('system');
  expect(restored.nodes.find(node => node.route_id === 'users')?.section_id).toBe('system');
  // 系统设置 keeps its seeded lead inside the system region top level.
  const sortOfNode = (nodes: typeof restored.nodes, id: string) => nodes.find(node => node.id === id)?.sort ?? -1;
  expect(sortOfNode(restored.nodes, 'settings')).toBeLessThan(sortOfNode(restored.nodes, 'administration'));

  // Restore the seeded order: drop the overview row on the upper third of notes,
  // which inserts overview before notes again.
  await dragRow(page, 'tr[data-node="overview"]', 'tr[data-node="notes"]', 'top');
  expect(await indexOf('overview')).toBeLessThan(await indexOf('notes'));
  await page.getByRole('button', { name: '保存菜单配置', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '菜单配置已保存' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
  expect(await indexOf('overview')).toBeLessThan(await indexOf('notes'));
  await evidence(page, info, '拖动排序保存', false);
});
