// Author: yunnuo <ymz@ebox.vip>
// Description: The status-page family: 404 router page, 403 permission page, 5xx boot failure and the maintenance 503.
import { test, expect, installStandalone, installPlatform, sdkClient, loginClient, workspaceLogin } from './fixtures';
import { capture } from './visual';

test('404 renders the full-page status route for unregistered paths', async ({ page, instance }, info) => {
  await installStandalone(instance);
  await page.goto(`${instance.url}/nonexistent`);
  await expect(page.getByRole('heading', { name: '页面不存在', exact: true })).toBeVisible();
  await capture(page, info, 'error-404');
});

test('403 renders inside the workspace for accounts without grants', async ({ page, instance }, info) => {
  await installPlatform(instance);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', 'administrator-password-strong');
  await admin.web!.createUser({ username: 'restricted', email: 'restricted@example.test', password: 'member-password-strong' });
  await workspaceLogin(page, instance.url, 'restricted', 'member-password-strong');
  await page.goto(`${instance.url}/admin/users`);
  await expect(page.getByRole('heading', { name: '没有访问权限', exact: true })).toBeVisible();
  await capture(page, info, 'error-403');
});

test('boot failures surface the status page with the real HTTP status', async ({ page, instance }, info) => {
  await installStandalone(instance);
  // A 500 envelope with an OK code makes the transport raise HTTP_ERROR carrying the status.
  await page.route('**/bootstrap', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'OK', message: '', request_id: 'test', data: null }) }));
  await page.goto(instance.url);
  await expect(page.getByRole('heading', { name: '暂时无法连接核心', exact: true })).toBeVisible();
  await expect(page.getByText('500', { exact: true })).toBeVisible();
  await capture(page, info, 'error-500');
});

test('maintenance mode renders the 503 status page with the operator message', async ({ page, instance }, info) => {
  await installPlatform(instance);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', 'administrator-password-strong');
  await admin.bootstrap();
  await admin.patchSettings({ changes: [{ key: 'maintenance.enabled', value: 'true' }, { key: 'maintenance.message', value: 'Planned work: back soon' }] });
  await page.goto(instance.url);
  await expect(page.getByRole('heading', { name: '站点维护中', exact: true })).toBeVisible();
  await expect(page.getByText('Planned work: back soon')).toBeVisible();
  await capture(page, info, 'error-503');
});
