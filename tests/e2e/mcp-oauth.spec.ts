// Author: yunnuo <ymz@ebox.vip>
// Description: Real browser OAuth loop: consent with PKCE, denial callback, personal revocation and the admin client console at desktop and 375px.
import { createHash, randomBytes } from 'node:crypto';
import { test, expect, installPlatform, sdkClient, loginClient, workspaceLogin, adminLogin, navigate, openPersonalCenter, memberPassword } from './fixtures';

test.use({ trace: 'off' }); // One-time client secrets must not enter persisted browser traces.

function pkcePair() {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

test('browser consent completes the authorization-code loop and personal revocation', async ({ page, instance }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  const admin = sdkClient(instance.url);
  await loginClient(admin, 'admin', 'administrator-password-strong');
  await admin.patchMcpConfig({ expected_revision: 0, enabled: true, pat_enabled: true, oauth_enabled: true });
  const member = await admin.createUser({ username: 'consent-user', email: 'consent@example.test', password: memberPassword, role_ids: ['user'] });
  const registered = await admin.createMcpOauthClient({ name: 'E2E Inspector', client_type: 'public', redirect_uris: [`${instance.url}/callback`] });
  await admin.updateMcpOauthClient(registered.client.id, { name: 'E2E Inspector', redirect_uris: [`${instance.url}/callback`], enabled: true, expected_version: registered.client.version });

  const { verifier, challenge } = pkcePair();
  const authorize = new URL(`${instance.url}/authorize`);
  authorize.searchParams.set('client_id', registered.client.id);
  authorize.searchParams.set('redirect_uri', `${instance.url}/callback`);
  authorize.searchParams.set('scope', 'mcp.read offline_access');
  authorize.searchParams.set('state', 'e2e-state');
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');

  await workspaceLogin(page, instance.url, member.username);
  await page.goto(authorize.toString());
  const consent = page.getByRole('heading', { name: '授权 "E2E Inspector" 访问工作空间' });
  await expect(consent).toBeVisible();
  await expect(page.getByText('读取 MCP 能力')).toBeVisible();
  await expect(page.getByText('在离线后保持连接（刷新令牌）')).toBeVisible();
  // One held role: no selector; the consent card carries the revoke hint instead.
  await expect(page.getByText('授权绑定所选角色当前的权限；你可以随时在个人中心撤销。')).toBeVisible();

  await page.getByRole('button', { name: '同意授权', exact: true }).click();
  await page.waitForURL(/code=/, { timeout: 15000 });
  const callback = new URL(page.url());
  expect(callback.pathname).toBe('/callback');
  expect(callback.searchParams.get('state')).toBe('e2e-state');
  expect(callback.searchParams.get('code')).toMatch(/.+/);
  // The one-time code never stays visible beyond the redirect target.
  expect(await page.getByText(/ucx_/).count()).toBe(0);

  // The granted authorization shows up in the personal center and revokes cleanly.
  // The callback itself is an unregistered SPA path (404 page, no shell): re-enter
  // the workspace before opening the account menu.
  await page.goto(`${instance.url}/`);
  await openPersonalCenter(page, '已授权应用');
  const app = page.getByText('E2E Inspector', { exact: true });
  await expect(app).toBeVisible();
  await page.getByRole('button', { name: '撤销授权', exact: true }).click();
  await page.getByRole('alertdialog', { name: '撤销授权' }).getByRole('button', { name: '确认撤销', exact: true }).click();
  await expect(page.getByText('暂无已授权应用')).toBeVisible();

  // Denial follows RFC 6749: back to the callback with error and state only.
  await page.goto(authorize.toString());
  await expect(consent).toBeVisible();
  await page.getByRole('button', { name: '拒绝', exact: true }).click();
  await page.waitForURL(/error=/, { timeout: 15000 });
  const denial = new URL(page.url());
  expect(denial.searchParams.get('error')).toBe('access_denied');
  expect(denial.searchParams.get('state')).toBe('e2e-state');
  expect(denial.searchParams.get('code')).toBeNull();
});

test('the admin OAuth console registers, governs and revokes clients', async ({ page, instance }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  const admin = sdkClient(instance.url);
  await loginClient(admin, 'admin', 'administrator-password-strong');
  await admin.patchMcpConfig({ expected_revision: 0, enabled: true, pat_enabled: true, oauth_enabled: true });

  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  await navigate(page, 'OAuth 接入');
  await expect(page.getByRole('heading', { name: 'OAuth 接入' })).toBeVisible();

  await page.getByRole('button', { name: '注册客户端', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '注册客户端', exact: true });
  await dialog.getByLabel('名称', { exact: true }).fill('Nightly CLI');
  await dialog.getByRole('combobox', { name: '客户端类型', exact: true }).click();
  await page.getByRole('option', { name: '机密客户端（密钥）', exact: true }).click();
  await dialog.getByLabel('回调地址', { exact: true }).fill('https://cli.example.test/callback');
  await dialog.getByRole('button', { name: '注册', exact: true }).click();
  const secret = dialog.getByLabel('客户端密钥', { exact: true });
  await expect(secret).toBeVisible();
  expect(await secret.inputValue()).toMatch(/.+/);
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  const row = page.getByRole('row', { name: /Nightly CLI/ });
  await expect(row).toBeVisible();
  await expect(row.getByText('机密客户端（密钥）', { exact: true })).toBeVisible();
  await expect(row.getByText('已停用', { exact: true })).toBeVisible();

  // Enable the client through the CAS editor.
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑客户端', exact: true });
  await editor.getByRole('switch', { name: '允许发起新授权' }).click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(row.getByText('已启用', { exact: true })).toBeVisible();

  // No consent yet: the grants view starts empty and stays reachable.
  await row.getByRole('button', { name: '授权记录', exact: true }).click();
  await expect(page.getByText('该客户端暂无有效授权。')).toBeVisible();
  await page.keyboard.press('Escape');

  // The registered secret never lingers in the page markup.
  expect(await page.locator('body').textContent()).not.toMatch(/ucs_/);
});
