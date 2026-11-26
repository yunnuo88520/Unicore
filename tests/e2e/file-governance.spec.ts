// Author: yunnuo <ymz@ebox.vip>
// Description: Platform file governance exercises real files, filters, preview, references and the migration tab.
import { mkdir, readFile } from 'node:fs/promises';
import { adminLogin, expect, installPlatform, loginClient, sdkClient, test, workspaceLogin } from './fixtures';

test('platform file governance uses real files, permissions and governance actions', async ({ page, instance, browser }, info) => {
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

  const directory = `build/acceptance/file-governance/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await page.evaluate(() => {
    const key = 'unicore.preferences.v1';
    const previous = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...previous, locale: 'zh-CN', theme: 'dark' }));
  });
  await page.goto(`${instance.url}/admin/files`);
  await expect(page.getByRole('heading', { name: '文件管理', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '文件列表', exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: '搜索文件' });
  await search.fill('member-governance.txt');
  const memberRow = page.getByRole('row').filter({ hasText: 'member-governance.txt' });
  await expect(memberRow).toBeVisible();
  await expect(memberRow).toContainText('林小满');
  await expect(memberRow).toContainText('@filemember');
  await expect(page.getByRole('row').filter({ hasText: 'referenced-governance.txt' })).toHaveCount(0);

  const download = page.waitForEvent('download');
  await memberRow.getByRole('button', { name: '下载文件', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('member-governance.txt');

  // Inline preview renders whitelisted plain text inside a sandboxed dialog.
  await memberRow.getByRole('button', { name: /预览 member-governance\.txt/ }).click();
  const previewDialog = page.getByRole('dialog', { name: 'member-governance.txt', exact: true });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog).toContainText('member private bytes');
  await page.keyboard.press('Escape');
  await expect(previewDialog).toHaveCount(0);
  if (info.project.name === 'chromium') await page.screenshot({ path: `${directory}/files-zh-dark-desktop.png`, fullPage: true, animations: 'disabled' });

  await search.fill('referenced-governance.txt');
  const referencedRow = page.getByRole('row').filter({ hasText: 'referenced-governance.txt' });
  await expect(referencedRow).toBeVisible();
  await expect(referencedRow.getByRole('button', { name: '删除文件', exact: true })).toHaveCount(0);

  // Detail drawer exposes governance facts including the object key.
  await referencedRow.getByRole('button', { name: /详情 referenced-governance\.txt/ }).click();
  const drawer = page.getByRole('dialog', { name: '文件详情', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('对象键');
  await expect(drawer).toContainText('referenced-governance.txt');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);

  await search.fill('removable-governance.txt');
  const removableRow = page.getByRole('row').filter({ hasText: 'removable-governance.txt' });
  await removableRow.getByRole('button', { name: /删除文件 removable-governance\.txt/ }).click();
  const deleteDialog = page.getByRole('alertdialog', { name: '删除文件', exact: true });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(removableRow).toHaveCount(0);
  const deletedMessage = page.getByText('文件已删除', { exact: true });
  await expect(deletedMessage).toBeVisible();
  await expect(deletedMessage).toHaveCount(0, { timeout: 5000 });
  expect((await admin.fileCatalog!.catalog({ search: 'removable-governance.txt' })).total).toBe(0);

  // Purpose and type filters narrow the catalog server-side.
  await search.fill('');
  await page.getByRole('combobox', { name: '业务用途筛选' }).click();
  await page.getByRole('option', { name: '品牌资源', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'member-governance.txt' })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: '品牌资源' }).first()).toBeVisible();
  await page.getByRole('combobox', { name: '业务用途筛选' }).click();
  await page.getByRole('option', { name: '全部用途', exact: true }).click();

  // The migration tab reports an empty overview while every file sits on the default location.
  await page.getByRole('tab', { name: '存储迁移', exact: true }).click();
  await expect(page.getByText('待迁移概览', { exact: true })).toBeVisible();
  await expect(page.getByText('当前全局默认', { exact: true })).toBeVisible();
  await expect(page.getByText('没有待迁移的文件，所有可用文件都已在默认存储位置。', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '源存储位置（迁出）' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '目标存储位置（迁入）' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始迁移', exact: true })).toBeDisabled();
  await page.screenshot({ path: `${directory}/migration-tab-zh-dark.png`, fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('tab', { name: '文件列表', exact: true }).click();
  await search.fill('member-governance.txt');
  // Grid view shows the same entry with hover actions.
  await page.getByRole('button', { name: '网格视图', exact: true }).click();
  const card = page.getByRole('button', { name: /预览 member-governance\.txt/ }).first();
  await expect(card).toBeVisible();
  if (info.project.name === 'chromium') await page.screenshot({ path: `${directory}/files-grid-zh-dark.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '表格视图', exact: true }).click();

  await page.evaluate(() => {
    const key = 'unicore.preferences.v1';
    const previous = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...previous, locale: 'en', theme: 'dark' }));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'File management', exact: true })).toBeVisible();
  const englishRow = page.getByRole('row').filter({ hasText: 'member-governance.txt' });
  await expect(englishRow).toBeVisible();
  await expect(englishRow.getByRole('button', { name: 'Download file', exact: true })).toBeVisible();
  expect(await page.getByRole('table').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.getByRole('tab', { name: 'Storage migration', exact: true }).click();
  await expect(page.getByText('Migration overview', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing left to migrate; every ready file already sits on the default storage.', { exact: true })).toBeVisible();
  if (info.project.name === 'chromium') await page.screenshot({ path: `${directory}/migration-tab-en-dark.png`, fullPage: true, animations: 'disabled' });

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
    await search.fill('member-governance.txt');
    const mobileRow = page.getByRole('row').filter({ hasText: 'member-governance.txt' });
    await expect(mobileRow).toBeVisible();
    await expect(mobileRow).toContainText('林小满');
    await expect(mobileRow.getByRole('button', { name: '下载文件', exact: true })).toBeVisible();
    expect(await page.getByRole('table').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `${directory}/files-zh-dark-375.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  expect(memberFile.file_id).toBeTruthy();
  expect(referenced.file_id).toBeTruthy();
  expect(removable.file_id).toBeTruthy();
});
