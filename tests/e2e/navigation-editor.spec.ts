// Author: yunnuo <ymz@ebox.vip>
// Description: Unified navigation acceptance: administrator/member drawers and menu/role editors on both viewports.
import { mkdir } from 'node:fs/promises';
import { test, expect, adminLogin, installPlatform, workspaceLogin, pageBoot, openPersonalCenter } from './fixtures';

const password = 'test-password-strong';

test('page dialog keeps the route, badge controls and actions usable on narrow screens', async ({ page, instance }, info) => {
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await page.goto(`${instance.url}/admin/menus`);
  const add = page.getByRole('button', { name: '添加页面', exact: true });
  await add.click();
  const dialog = page.getByRole('dialog', { name: '添加页面', exact: true });
  const target = dialog.getByRole('combobox', { name: '目标页面（仅已注册路由）' });
  const icons = dialog.getByRole('button', { name: '选择图标' });
  await expect(target).toBeInViewport({ ratio: 1 });
  expect((await target.boundingBox())!.y).toBeLessThan((await icons.boundingBox())!.y);
  await expect(page.getByRole('group', { name: '图标选择器' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeInViewport({ ratio: 1 });
  const directory = `build/acceptance/admin-page-alignment/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/add-page.png`, animations: 'disabled' });
  await icons.click();
  const picker = page.getByRole('dialog', { name: '图标选择器' });
  const search = picker.getByRole('textbox', { name: '搜索图标名称或用途' });
  await expect(search).toBeFocused();
  await search.fill('火箭');
  await picker.getByRole('button', { name: 'Rocket', exact: true }).click();
  await expect(icons).toContainText('Rocket');
  await expect(icons).toBeFocused();
  await dialog.getByRole('button', { name: '排序与显示选项' }).click();
  const dot = dialog.getByRole('switch', { name: '圆点角标' });
  await dot.click();
  await expect(dot).toBeChecked();
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  if (info.project.name === 'chromium') await page.setViewportSize({ width: 760, height: 720 });
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  const english = page.getByRole('dialog', { name: /Add [Pp]age/ });
  await english.getByRole('button', { name: 'Order and display options' }).click();
  const state = english.getByRole('switch', { name: 'Dot badge' }).locator('..').getByText('Off', { exact: true });
  await state.scrollIntoViewIfNeeded();
  await expect(state).toHaveCSS('white-space', 'nowrap');
  expect(await state.evaluate(element => {
    const label = element.closest('label')!.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return bounds.right <= label.right + 1;
  })).toBe(true);
  await page.screenshot({ path: `${directory}/add-page-en-dark.png`, animations: 'disabled' });
});

test('admin navigation tree with the three directories, both viewports', async ({ page, instance }, info) => {
  test.setTimeout(120000);
  // A tall desktop viewport keeps the whole sidebar inside the capture.
  if (info.project.name === 'chromium') await page.setViewportSize({ width: 1440, height: 1500 });
  expect((await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: password } })).status()).toBe(200);
  await page.goto(`${instance.url}/admin`);
  await expect(page.getByRole('heading', { name: '工作台概览' })).toBeVisible();
  const directory = `build/acceptance/navigation-tree/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  // Desktop: the sidebar renders the two regions inline — the system region
  // keeps 系统设置 and 超级管理员; the personal center has no directory, it
  // opens from the account menus' settings modal.
  if (info.project.name === 'chromium') {
    const systemSection = page.locator('.sidebar section[data-nav-section="system"]');
    const businessSection = page.locator('.sidebar section[data-nav-section="business"]');
    const settings = systemSection.getByRole('button', { name: '系统设置', exact: true });
    await expect(settings).toBeVisible();
    await settings.click();
    await expect(systemSection.getByRole('button', { name: '基础设置', exact: true })).toBeVisible();
    await expect(businessSection.getByRole('button', { name: '个人中心', exact: true })).toHaveCount(0);
    const administration = systemSection.getByRole('button', { name: '超级管理员', exact: true });
    await administration.click();
    await expect(page.locator('.sidebar').getByRole('button', { name: '用户列表', exact: true })).toBeVisible();
    await page.screenshot({ path: `${directory}/admin-sidebar-directories.png`, fullPage: true });
    // The shared navigation tree editor.
    await page.goto(`${instance.url}/admin/menus`);
    await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
    await page.screenshot({ path: `${directory}/menu-editor.png`, fullPage: true });
    // The role editor tree.
    await page.goto(`${instance.url}/admin/roles`);
    await page.getByRole('button', { name: /新建角色/ }).click();
    await expect(page.getByRole('dialog', { name: /新建角色/ })).toBeVisible();
    await page.screenshot({ path: `${directory}/role-editor.png`, fullPage: true });
    await page.keyboard.press('Escape');
    return;
  }
  // Mobile: the drawer carries the same tree with directories expanded.
  await pageBoot(page, instance.url);
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  const drawer = page.locator('.sidebar');
  await expect(drawer).toHaveClass(/is-open/);
  await drawer.getByRole('button', { name: '系统设置', exact: true }).click();
  await expect(drawer.getByRole('button', { name: '基础设置', exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: '个人中心', exact: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: '超级管理员', exact: true }).click();
  await expect(drawer.getByRole('button', { name: '用户列表', exact: true })).toBeVisible();
  // Collapse the long administration directory and scroll the two lower
  // directories into the viewport-fixed drawer before capturing.
  await drawer.getByRole('button', { name: '超级管理员', exact: true }).click();
  await expect(drawer.getByRole('button', { name: '用户列表', exact: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: '系统设置', exact: true }).evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${directory}/admin-drawer-directories.png` });
  await page.keyboard.press('Escape');
  await page.goto(`${instance.url}/admin/menus`);
  await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
  await page.screenshot({ path: `${directory}/menu-editor.png`, fullPage: true });
});

test('member drawer keeps the collapsed surface without a personal directory, both viewports', async ({ page, browser, instance }, info) => {
  test.setTimeout(120000);
  expect((await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: password } })).status()).toBe(200);
  const boot = (await (await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;
  expect((await page.request.post(`${instance.url}/api/v1/admin/users`, { headers: { 'X-CSRF-Token': boot.csrf_token }, data: { username: 'member', email: 'member@example.test', password, role: 'user' } })).status()).toBe(200);
  await page.goto(`${instance.url}/`);
  const logout = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/auth/logout'));
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await logout;
  await workspaceLogin(page, instance.url, 'member');
  for (const name of ['基础设置', 'API 文档', '公告', '文件管理']) await expect(page.locator('.sidebar').getByRole('button', { name, exact: true })).toHaveCount(0);
  const directory = `build/acceptance/navigation-tree/${info.project.name}`;
  // The personal center opens from the account menu into the settings modal.
  if (info.project.name === 'chromium') {
    await expect(page.locator('.sidebar').getByRole('button', { name: '个人中心', exact: true })).toHaveCount(0);
    const center = await openPersonalCenter(page);
    await expect(center.getByRole('heading', { name: '个人资料', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${directory}/member-sidebar.png`, fullPage: true });
    return;
  }
  // Mobile: assert inside the opened drawer — the closed sidebar is off-canvas.
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  const drawer = page.locator('.sidebar');
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer.getByRole('button', { name: '个人中心', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const center = await openPersonalCenter(page);
  await expect(center.getByRole('heading', { name: '个人资料', exact: true })).toBeVisible();
  await page.screenshot({ path: `${directory}/member-drawer.png`, fullPage: true });
});
