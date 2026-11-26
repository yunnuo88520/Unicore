// Author: yunnuo <ymz@ebox.vip>
// Description: Platform file catalogue exercises real ownership, branding, references, access and local selection.
import { mkdir, readFile } from 'node:fs/promises';
import { adminLogin, chooseOption, expect, installPlatform, loginClient, sdkClient, test, workspaceLogin } from './fixtures';

test('platform file governance uses real files, permissions and catalogue actions', async ({ page, instance, browser }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);

  const admin = sdkClient(instance.url);
  await loginClient(admin, 'admin', 'administrator-password-strong');
  const administrator = await admin.bootstrap();
  expect(administrator.identity_realm).toBe('administrator');
  expect(administrator.current_user?.roles).toContain('super_admin');

  const member = await admin.createUser({ username: 'filemember', email: 'filemember@example.test', password: 'member-password-strong', role: 'user' });
  const memberApi = sdkClient(instance.url, 'user');
  await loginClient(memberApi, member.username, 'member-password-strong');
  await memberApi.saveAccountProfile({ display_name: '林小满' });
  const memberFile = await memberApi.businessFiles!('notes').uploadFile(new globalThis.File(['member private bytes'], 'member-governance.txt', { type: 'text/plain' }));

  const referenced = await admin.files!.uploadFile(new globalThis.File(['referenced private bytes'], 'referenced-governance.txt', { type: 'text/plain' }));
  await admin.createNote({ title: 'Governance attachment reference', body: 'A real note keeps this file referenced.', status: 'open', attachment_ids: [referenced.file_id] });
  const removable = await admin.files!.uploadFile(new globalThis.File(['unreferenced private bytes'], 'removable-governance.txt', { type: 'text/plain' }));
  const brandBytes = await readFile('assets/brand/icon-64.png');
  await admin.updateBranding!({ slot: 'logo', content: brandBytes.toString('base64') });

  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await page.evaluate(() => {
    const key = 'unicore.preferences.v1';
    const previous = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...previous, locale: 'zh-CN', theme: 'dark' }));
  });
  await page.goto(`${instance.url}/admin/files`);
  await expect(page.getByRole('heading', { name: '文件管理', exact: true })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole('button', { name: '目录', exact: true }).click();
  const tree = page.getByRole('tree', { name: '存储目录' });
  await expect(tree).toContainText('默认上传目录');
  await tree.getByRole('treeitem', { name: /默认上传目录/ }).click();
  const directory = `build/acceptance/file-governance/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  if (info.project.name === 'chromium') {
    await page.evaluate(() => {
      const key = 'unicore.preferences.v1';
      const previous = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...previous, locale: 'zh-CN', theme: 'light' }));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: '文件管理', exact: true })).toBeVisible();
    const table = page.getByRole('table');
    const visibleRow = table.getByRole('row').filter({ hasText: 'member-governance.txt' });
    await expect(visibleRow).toBeVisible();
    await expect(visibleRow).toContainText('林小满');
    await expect(visibleRow).toContainText('@filemember');
    await expect(visibleRow.getByRole('button', { name: '下载文件', exact: true })).toBeVisible();
    expect(await table.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `${directory}/files-zh-light-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.evaluate(() => {
      const key = 'unicore.preferences.v1';
      const previous = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...previous, locale: 'zh-CN', theme: 'dark' }));
    });
    await page.reload();
  }

  const search = page.getByRole('searchbox', { name: '搜索文件' });
  await search.fill('member-governance.txt');
  const memberRow = page.getByRole('row').filter({ hasText: 'member-governance.txt' });
  await expect(memberRow).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'referenced-governance.txt' })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await memberRow.getByRole('button', { name: '下载文件', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('member-governance.txt');

  await search.fill('referenced-governance.txt');
  const referencedRow = page.getByRole('row').filter({ hasText: 'referenced-governance.txt' });
  await expect(referencedRow).toBeVisible();
  await expect(referencedRow.getByRole('button', { name: '删除文件', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '迁移当前筛选的全部可用文件', exact: true })).toBeVisible();

  await search.fill('removable-governance.txt');
  const removableRow = page.getByRole('row').filter({ hasText: 'removable-governance.txt' });
  await removableRow.getByRole('button', { name: '删除文件', exact: true }).click();
  const deleteDialog = page.getByRole('alertdialog', { name: '删除文件', exact: true });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(removableRow).toHaveCount(0);
  const deletedMessage = page.getByText('文件已删除', { exact: true });
  await expect(deletedMessage).toBeVisible();
  await expect(deletedMessage).toHaveCount(0, { timeout: 5000 });
  expect((await admin.fileCatalog!.catalog({ search: 'removable-governance.txt' })).total).toBe(0);

  await search.fill('member-governance.txt');
  await tree.getByRole('treeitem', { name: /全部文件/ }).click();
  const selectedRow = page.getByRole('row').filter({ hasText: 'member-governance.txt' });
  await selectedRow.getByRole('checkbox').check();
  await page.getByRole('button', { name: /迁移所选/ }).click();
  const drawer = page.getByRole('dialog', { name: '迁移文件', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('1 个可用文件');
  const target = drawer.getByRole('combobox', { name: '目标存储位置' });
  await expect(target).toBeVisible();
  await expect(drawer.getByRole('button', { name: '开始迁移', exact: true })).toBeDisabled();
  await chooseOption(page, '目标存储位置', /本地存储/, drawer);
  await drawer.getByRole('button', { name: '开始迁移', exact: true }).click();
  const sameTargetMessage = page.getByText('所选文件已在目标存储位置', { exact: true });
  await expect(sameTargetMessage).toBeVisible();
  await expect(drawer).toBeVisible();
  await expect(sameTargetMessage).toHaveCount(0, { timeout: 5000 });
  await page.screenshot({ path: `${directory}/migration-drawer-zh-dark.png`, fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '迁移当前筛选的全部可用文件', exact: true }).click();
  const bulkDrawer = page.getByRole('dialog', { name: '迁移文件', exact: true });
  await expect(bulkDrawer).toContainText('当前筛选下全部可用文件');
  await chooseOption(page, '目标存储位置', /本地存储/, bulkDrawer);
  await page.getByRole('button', { name: '开始迁移', exact: true }).click();
  await expect(bulkDrawer).toHaveCount(0);
  await expect(page.getByText('当前筛选没有可迁移的文件', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const key = 'unicore.preferences.v1';
    const previous = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...previous, locale: 'en', theme: 'dark' }));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'File management', exact: true })).toBeVisible();
  const englishTable = page.getByRole('table');
  const englishRow = englishTable.getByRole('row').filter({ hasText: 'member-governance.txt' });
  await expect(englishRow).toBeVisible();
  await expect(englishRow.getByRole('button', { name: 'Download file', exact: true })).toBeVisible();
  expect(await englishTable.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  if (info.project.name === 'chromium') await page.screenshot({ path: `${directory}/files-en-dark-desktop.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Migrate all available files in this filter', exact: true }).click();
  const englishDrawer = page.getByRole('dialog', { name: 'Migrate file', exact: true });
  await expect(englishDrawer).toBeVisible();
  await expect(englishDrawer).toContainText('all available files in the current filter');
  await page.screenshot({ path: `${directory}/migration-drawer-en-dark.png`, fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const memberPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await workspaceLogin(memberPage, instance.url, member.username, 'member-password-strong');
  await memberPage.goto(`${instance.url}/files`);
  await expect(memberPage.getByRole('heading', { name: '没有访问权限', exact: true })).toBeVisible();
  await expect(memberPage.getByRole('button', { name: '上传文件', exact: true })).toHaveCount(0);
  await memberPage.close();

  if (info.project.name === 'mobile') {
    await page.goto(`${instance.url}/admin/files`);
    await page.evaluate(() => {
      const key = 'unicore.preferences.v1';
      const previous = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...previous, locale: 'zh-CN', theme: 'dark' }));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: '文件管理', exact: true })).toBeVisible();
    const mobileTable = page.getByRole('table');
    const mobileRow = mobileTable.getByRole('row').filter({ hasText: 'member-governance.txt' });
    await expect(mobileRow).toBeVisible();
    await expect(mobileRow).toContainText('林小满');
    await expect(mobileRow.getByRole('button', { name: '下载文件', exact: true })).toBeVisible();
    expect(await mobileTable.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `${directory}/files-zh-dark-375.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => {
      const key = 'unicore.preferences.v1';
      const previous = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...previous, locale: 'en', theme: 'dark' }));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'File management', exact: true })).toBeVisible();
    await expect(mobileTable.getByRole('row').filter({ hasText: 'member-governance.txt' })).toBeVisible();
    expect(await mobileTable.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `${directory}/files-en-dark-375.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  expect(memberFile.file_id).toBeTruthy();
  expect(referenced.file_id).toBeTruthy();
});
