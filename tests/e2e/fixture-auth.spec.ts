// Author: yunnuo <ymz@ebox.vip>
// Description: Login fixtures observe real authentication results before checking the rendered workspace.
import { operations } from '../../packages/contracts/src/operations.gen';
import { test, expect, installPlatform, adminLogin, workspaceLogin, sdkClient, loginClient, memberPassword } from './fixtures';

test.setTimeout(90000);
const adminPassword = 'administrator-password-strong';

for (const realm of ['administrator', 'user'] as const) {
  const administrator = realm === 'administrator';
  const operation = operations[administrator ? 'adminLogin' : 'login'];
  const bootstrap = operations[administrator ? 'adminBootstrap' : 'bootstrap'];
  const login = administrator ? adminLogin : workspaceLogin;

  test(`${realm} login waits for a successful response slower than a DOM assertion`, async ({ page, instance }, info) => {
    if (info.project.name === 'mobile') expect(page.viewportSize()?.width).toBe(375);
    await installPlatform(instance);
    const owner = sdkClient(instance.url);
    await loginClient(owner, 'admin', adminPassword);
    const member = await owner.createUser({ username: 'fixture-member', email: 'fixture-member@example.test', password: memberPassword, role: 'user' });
    // Forward to the real server and preserve its status, body and session
    // cookies. Only delivery is delayed to reproduce the measured 5.5s CI login.
    await page.route(new URL(operation.path, instance.url).href, async route => {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 5500));
      await route.fulfill({ response });
    });
    await login(page, instance.url, administrator ? 'admin' : member.username, administrator ? adminPassword : memberPassword);
    const response = await page.request.get(new URL(bootstrap.path, instance.url).href);
    expect(response.status()).toBe(200);
    expect((await response.json()).data.current_user.username).toBe(administrator ? 'admin' : member.username);
  });

  test(`${realm} login fixture rejects invalid credentials and leaves no session`, async ({ page, instance }) => {
    await installPlatform(instance);
    await expect(login(page, instance.url, 'admin', 'incorrect-password-strong')).rejects.toThrow('login must succeed');
    await expect(page.getByText('账号或密码不正确', { exact: true })).toBeVisible();
    const response = await page.request.get(new URL(bootstrap.path, instance.url).href);
    expect(response.status()).toBe(200);
    expect((await response.json()).data.current_user).toBeFalsy();
  });
}
