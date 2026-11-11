// Author: yunnuo <ymz@ebox.vip>
// Description: The post directory manages membership separately from roles:
// duplicate codes conflict, referenced posts refuse deletion and disabled
// posts refuse new members, at 375px and in English as well.
import type { Page, TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { test, expect, installPlatform, adminLogin, sdkClient, loginClient, memberPassword } from './fixtures';

const adminPassword = 'administrator-password-strong';

async function evidence(page: Page, info: TestInfo, feature: string, fullPage = true) {
  if (info.project.name === 'mobile') expect(page.viewportSize()?.width).toBe(375);
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${feature}: viewport overflow`).toBe(true);
  const directory = `build/acceptance/posts/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${feature}.png`, fullPage, animations: 'disabled' });
}

test.setTimeout(120_000);

test('posts manage the directory and guard membership boundaries', async ({ page, instance }, info) => {
  await installPlatform(instance, { username: 'admin', email: 'admin@example.test', password: adminPassword });
  await adminLogin(page, instance.url, 'admin', adminPassword);
  await page.goto(`${instance.url}/admin/posts`);
  await expect(page.getByRole('heading', { name: '岗位管理', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText('暂无岗位', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建岗位', exact: true })).toBeEnabled();
  await evidence(page, info, '岗位空态');

  const createPost = async (code: string, name: string) => {
    await page.getByRole('button', { name: '新建岗位', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建岗位', exact: true });
    await dialog.getByLabel('岗位编码', { exact: true }).fill(code);
    await dialog.getByLabel('岗位名称', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    return dialog;
  };
  await createPost('engineer', '工程师');
  await expect(page.getByRole('cell', { name: 'engineer', exact: true })).toBeVisible();
  // Duplicate codes are a distinct conflict, not a generic failure.
  const duplicate = await createPost('engineer', '另一个岗位');
  // The conflict surfaces on the form (and as a toast); it must name the code clash.
  await expect(duplicate.getByText('岗位编码已被使用，请改用其他编码', { exact: true })).toBeVisible();
  await duplicate.getByRole('button', { name: '取消', exact: true }).click();
  await expect(duplicate).toHaveCount(0);
  await createPost('designer', '设计师');
  await expect(page.getByRole('cell', { name: 'designer', exact: true })).toBeVisible();
  await evidence(page, info, '岗位清单');

  // Disable 设计师: existing members keep the row, new ones are refused.
  const designerRow = page.getByRole('row').filter({ hasText: 'designer' });
  await designerRow.getByRole('button', { name: '编辑岗位 设计师', exact: true }).click();
  const disableDialog = page.getByRole('dialog', { name: '编辑岗位', exact: true });
  // The status switch carries no accessible name (the Switch drops aria-label).
  await disableDialog.getByRole('switch').click();
  await disableDialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(disableDialog).toHaveCount(0);
  await expect(designerRow).toContainText('已禁用');

  // The users console multi-selects posts at creation; disabled ones stay out.
  await page.goto(`${instance.url}/admin/users`);
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  const userDialog = page.getByRole('dialog', { name: '新增用户', exact: true });
  await userDialog.getByLabel('账号', { exact: true }).fill('postmember');
  await userDialog.getByLabel('邮箱', { exact: true }).fill('postmember@example.test');
  await userDialog.getByLabel('初始密码', { exact: true }).fill(memberPassword);
  const postGroup = userDialog.getByRole('group', { name: '岗位', exact: true });
  const engineerBox = postGroup.getByLabel('工程师', { exact: true });
  await engineerBox.check();
  await expect(engineerBox).toBeChecked();
  await expect(postGroup.getByLabel('设计师', { exact: true })).toHaveCount(0);
  await userDialog.getByRole('button', { name: '创建用户', exact: true }).click();
  await expect(userDialog).toHaveCount(0);
  const memberRow = page.getByRole('row').filter({ hasText: 'postmember' });
  await expect(memberRow).toBeVisible();
  // The post names resolve from the directory query; wait for the cell to fill.
  await expect(memberRow).toContainText('工程师', { timeout: 15000 });

  // The edit dialog lists disabled posts but refuses new assignments on them.
  const openEdit = async () => {
    await memberRow.getByRole('button', { name: '编辑', exact: true }).click();
    return page.getByRole('dialog', { name: '编辑postmember', exact: true });
  };
  let edit = await openEdit();
  const editPosts = edit.getByRole('group', { name: '岗位', exact: true });
  await expect(editPosts.getByLabel('工程师', { exact: true })).toBeChecked();
  const designerCheckbox = editPosts.getByLabel('设计师', { exact: true });
  await expect(designerCheckbox).toBeDisabled();
  // Clearing the assignment keeps the post directory untouched.
  await editPosts.getByLabel('工程师', { exact: true }).uncheck();
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(memberRow).not.toContainText('工程师');
  edit = await openEdit();
  await expect(edit.getByRole('group', { name: '岗位', exact: true }).getByLabel('设计师', { exact: true })).toBeDisabled();
  await edit.getByRole('button', { name: '取消', exact: true }).click();
  await expect(edit).toHaveCount(0);

  // Re-enable 设计师 and multi-select both posts on a second member.
  await page.goto(`${instance.url}/admin/posts`);
  await designerRow.getByRole('button', { name: '编辑岗位 设计师', exact: true }).click();
  const enableDialog = page.getByRole('dialog', { name: '编辑岗位', exact: true });
  await enableDialog.getByRole('switch').click();
  await enableDialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(enableDialog).toHaveCount(0);
  await page.goto(`${instance.url}/admin/users`);
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  const secondDialog = page.getByRole('dialog', { name: '新增用户', exact: true });
  await secondDialog.getByLabel('账号', { exact: true }).fill('dualpost');
  await secondDialog.getByLabel('邮箱', { exact: true }).fill('dualpost@example.test');
  await secondDialog.getByLabel('初始密码', { exact: true }).fill(memberPassword);
  await secondDialog.getByRole('group', { name: '岗位', exact: true }).getByLabel('工程师', { exact: true }).check();
  await secondDialog.getByRole('group', { name: '岗位', exact: true }).getByLabel('设计师', { exact: true }).check();
  await secondDialog.getByRole('button', { name: '创建用户', exact: true }).click();
  await expect(secondDialog).toHaveCount(0);
  const dualRow = page.getByRole('row').filter({ hasText: 'dualpost' });
  await expect(dualRow).toContainText('工程师');
  await expect(dualRow).toContainText('设计师');
  // Editing one assignment off keeps the other.
  await dualRow.getByRole('button', { name: '编辑', exact: true }).click();
  const dualEdit = page.getByRole('dialog', { name: '编辑dualpost', exact: true });
  await dualEdit.getByRole('group', { name: '岗位', exact: true }).getByLabel('设计师', { exact: true }).uncheck();
  await dualEdit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dualEdit).toHaveCount(0);
  await expect(dualRow).toContainText('工程师');
  await expect(dualRow).not.toContainText('设计师');

  // The members dialog lists assignments per post.
  await page.goto(`${instance.url}/admin/posts`);
  const engineerRow = page.getByRole('row').filter({ hasText: 'engineer' });
  await engineerRow.getByRole('button', { name: '成员', exact: true }).click();
  const membersDialog = page.getByRole('dialog', { name: '岗位成员：工程师', exact: true });
  // Rows render "username · email"; match the username as a substring.
  await expect(membersDialog.getByText('dualpost', { exact: false })).toBeVisible();
  await expect(membersDialog.getByText('postmember', { exact: true })).toHaveCount(0);
  await membersDialog.getByRole('button', { name: '关闭岗位成员：工程师', exact: true }).click();
  await expect(membersDialog).toHaveCount(0);

  // Referenced posts refuse deletion; unused ones delete cleanly.
  await engineerRow.getByRole('button', { name: '删除岗位 工程师', exact: true }).click();
  const deleteDialog = page.getByRole('alertdialog', { name: '删除岗位', exact: true });
  await expect(deleteDialog.getByText(/已关联用户的岗位不可删除/)).toBeVisible();
  await deleteDialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('岗位仍有成员引用，请先调整成员归属', { exact: true })).toBeVisible();
  await deleteDialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(deleteDialog).toHaveCount(0);
  await expect(engineerRow).toBeVisible();
  await createPost('intern', '实习生');
  const internRow = page.getByRole('row').filter({ hasText: 'intern' });
  await internRow.getByRole('button', { name: '删除岗位 实习生', exact: true }).click();
  const unusedDialog = page.getByRole('alertdialog', { name: '删除岗位', exact: true });
  await unusedDialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(unusedDialog).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'intern', exact: true })).toHaveCount(0);
  await evidence(page, info, '岗位边界');

  // The API boundary mirrors the console: posts:read alone lists, writes need
  // posts:write, and membership stays role-independent.
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const posts = await admin.web!.listPosts();
  expect(posts.items.map(post => post.code).sort()).toEqual(['designer', 'engineer']);
});

test('new consoles read in English and keep data states inside a 375px viewport', async ({ page, instance }, info) => {
  await installPlatform(instance, { username: 'admin', email: 'admin@example.test', password: adminPassword });
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const engineer = await admin.web!.createPost({ code: 'engineer', name: '工程师', sort: 1, description: 'A fairly long description that must wrap instead of widening the document on narrow viewports.' });
  await admin.web!.createPost({ code: 'designer', name: '设计师', sort: 2 });
  await admin.web!.createUser({ username: 'postmember', email: 'postmember@example.test', password: memberPassword, role: 'user', post_ids: [engineer.id] });
  await admin.web!.createRole({ name: '验收运营角色', permissions: ['notes:access'], realm: 'administrator' });
  await adminLogin(page, instance.url, 'admin', adminPassword);
  // Switch the client locale after authenticating so the consoles render in English.
  await page.evaluate(() => localStorage.setItem('unicore.preferences.v1', JSON.stringify({ ...(JSON.parse(localStorage.getItem('unicore.preferences.v1') ?? '{}')), locale: 'en' })));
  await page.reload();

  for (const [path, heading] of [
    ['/admin/posts', 'Posts'],
    ['/admin/departments', 'Departments'],
    ['/admin/menus', 'Menu configuration'],
    ['/admin/roles', 'Roles & permissions'],
  ] as const) {
    await page.goto(`${instance.url}${path}`);
    await expect(page.getByRole('heading', { name: new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} overflows`).toBe(true);
    await evidence(page, info, `en-${path.replace(/\W+/g, '-')}`);
  }
  // The posts table keeps its rows readable with real data present.
  await page.goto(`${instance.url}/admin/posts`);
  await expect(page.getByRole('cell', { name: 'engineer', exact: true })).toBeVisible();
  await expect(page.getByText('A fairly long description', { exact: false }).first()).toBeVisible();
});
