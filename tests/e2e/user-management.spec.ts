// Author: yunnuo <ymz@ebox.vip>
// Description: The completed user editor (nickname, email, roles) and the row-level password reset, driven through the real dialogs against the real backend.
import { test, expect, installPlatform, sdkClient, loginClient, adminLogin, navigate, memberPassword, captchaAnswer } from './fixtures';

test('editing a user rewrites nickname and roles, and the reset password flow issues a working credential', async ({ page, instance }) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  const owner = sdkClient(instance.url);
  await loginClient(owner, 'admin', 'administrator-password-strong');
  const role = await owner.web!.createRole({ name: '笔记员', realm: 'user', permissions: ['notes:access'] });
  const member = await owner.createUser({ username: 'editable', email: 'editable@example.test', password: memberPassword, role_ids: ['user'] });

  // The admin UI drives every dialog below; member assertions ride their own
  // SDK client so the browser cookie jar keeps the administrator session.
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await navigate(page, '用户列表');
  const row = page.getByRole('row', { name: /editable/ });
  await expect(row).toBeVisible();

  // The full editor: the username is read-only, nickname and role submit with
  // the echoed email.
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /编辑/ });
  await expect(dialog.getByLabel('账号')).toHaveValue('editable');
  await expect(dialog.getByLabel('账号')).toHaveAttribute('readonly');
  await dialog.getByLabel('昵称').fill('编辑甲');
  await dialog.getByRole('checkbox', { name: '笔记员' }).check();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();

  // The list prefers the nickname and keeps the raw account beneath it.
  const renamed = page.getByRole('row', { name: /编辑甲/ });
  await expect(renamed).toBeVisible();
  await expect(renamed.getByText('editable', { exact: true })).toBeVisible();

  // The member session picks up both the nickname and the added role.
  const memberClient = sdkClient(instance.url, 'user');
  const memberCaptcha = await memberClient.captcha();
  const session = await memberClient.login({ username: 'editable', password: memberPassword, captcha_id: memberCaptcha.id, captcha_answer: captchaAnswer(memberCaptcha.image) });
  expect(session.user.display_name).toBe('编辑甲');
  expect(session.user.roles).toContain(role.id);

  // Row-level reset: the generated temporary password echoes once in the
  // toast, the old credential dies and the new one signs in.
  await renamed.getByRole('button', { name: '重置密码', exact: true }).click();
  const resetDialog = page.getByRole('dialog', { name: '重置密码' });
  await resetDialog.getByRole('radio', { name: '生成临时密码' }).check();
  await resetDialog.getByRole('button', { name: '重置密码', exact: true }).click();
  const toast = await page.getByRole('status').filter({ hasText: '新密码：' }).textContent({ timeout: 5000 });
  const temporary = toast!.match(/新密码：(\S+)/)![1];
  expect(temporary.length).toBeGreaterThanOrEqual(12);
  const staleCaptcha = await memberClient.captcha();
  await expect(memberClient.login({ username: 'editable', password: memberPassword, captcha_id: staleCaptcha.id, captcha_answer: captchaAnswer(staleCaptcha.image) })).rejects.toThrow();
  const fresh = sdkClient(instance.url, 'user');
  await loginClient(fresh, 'editable', temporary);

  // A member session can never reach the management reset endpoint.
  await expect(fresh.web!.resetUserPassword(member.id, {})).rejects.toThrow();
});
