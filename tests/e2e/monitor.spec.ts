// Author: yunnuo <ymz@ebox.vip>
// Description: Runtime monitor boundaries: super-admin console without dashboard monitoring, member exclusion at page and API level, and the standalone local view.
import { test, expect, installPlatform, installStandalone, adminLogin, workspaceLogin, sdkClient, loginClient, memberPassword } from './fixtures';

test('platform: super admin sees monitor pages while the dashboard stays free of monitoring', async ({ instance, page }, testInfo) => {
  await installPlatform(instance);
  const admin = sdkClient(instance.url);
  await loginClient(admin, 'admin', 'administrator-password-strong');
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  // The monitor directory sits last in the system region; directories start
  // collapsed, so expanding it reveals the three page entries (desktop
  // project; the mobile viewport keeps the tree in its drawer).
  if (testInfo.project.name !== 'mobile') {
    const directory = page.getByRole('button', { name: '运行监控' });
    await expect(directory).toBeVisible();
    await expect(directory).toHaveAttribute('aria-expanded', 'false');
    await directory.click();
    // Sidebar rows render as buttons that navigate programmatically (no link role).
    await expect(page.getByRole('button', { name: '运行概览' })).toBeVisible();
    await expect(page.getByRole('button', { name: '服务健康' })).toBeVisible();
    await expect(page.getByRole('button', { name: '资源监控' })).toBeVisible();
    await expect(page.getByRole('button', { name: '运行事件', exact: true })).toBeVisible();
  }
  // Monitor pages live on the administrator surface (the user surface 403s
  // them by design, covered in the member test below).
  const renderedSnapshot = page.waitForResponse(response => response.url() === `${instance.url}/api/v1/admin/monitor` && response.request().method() === 'GET');
  await page.goto(`${instance.url}/admin/monitor`);
  const currentSnapshot = (await (await renderedSnapshot).json()).data;
  await expect(page.locator('#main-content').getByRole('heading', { name: '运行概览' })).toBeVisible();
  await expect(page.getByText('连接正常')).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeVisible();
  // The overview is a summary: usage tiles with sparklines plus compact
  // service cards; the full trend charts live on the resources page.
  await expect(page.getByText('CPU 使用率', { exact: true }).first()).toBeVisible();
  if (currentSnapshot.tasks.applicable) {
    await expect(page.getByRole('heading', { name: '最近异常', exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: '最近异常', exact: true })).toHaveCount(0);
  }
  await page.goto(`${instance.url}/admin/monitor-services`);
  await expect(page.locator('#main-content').getByRole('heading', { name: '服务健康' })).toBeVisible();
  await expect(page.getByText('HTTP 服务')).toBeVisible();
  // The storage probe is an explicit action, never part of the read-only snapshot.
  await expect(page.getByRole('button', { name: '立即探活' }).first()).toBeVisible();
  await page.goto(`${instance.url}/admin/monitor-resources`);
  await expect(page.locator('#main-content').getByRole('heading', { name: '资源监控' })).toBeVisible();
  // Host hardware cards answer with real sampled values, not placeholders.
  await expect(page.getByText('主机信息').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /CPU 使用率/ }).first()).toBeVisible();
  await expect(page.getByText('磁盘空间').first()).toBeVisible();
  await expect(page.getByText('网络 I/O').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '进程与 Go Runtime' })).toBeVisible();
  // Monitoring stays in its dedicated console, never on the dashboard.
  await page.goto(`${instance.url}/admin`);
  await expect(page.getByRole('region', { name: '运行状态摘要' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '进入运行监控' })).toHaveCount(0);
  // The events page renders the in-process ring buffer (fresh install: empty
  // state with the capacity disclosure).
  await page.goto(`${instance.url}/admin/monitor-events`);
  await expect(page.locator('#main-content').getByRole('heading', { name: '运行事件', exact: true })).toBeVisible();
  // A fresh instance always carries its startup lifecycle event.
  await expect(page.getByText('实例已启动')).toBeVisible();
  await expect(page.getByText('关于运行事件')).toBeVisible();
  // The snapshot API answers the super admin with real data.
  const snapshot = await admin.monitorSnapshot!();
  expect(snapshot.status === 'healthy' || snapshot.status === 'degraded').toBe(true);
  expect(snapshot.database.status).toBe('healthy');
  // The snapshot must report the installed form, not the pre-install default.
  expect(snapshot.profile).toBe('web-platform');

  // Alert rules: the super admin reads the initialized defaults and can
  // retune them; a normal administrator cannot even read the endpoint.
  const rules = await admin.alertRules!();
  expect(rules.version).toBe(1);
  const ids = rules.rules.map(rule => rule.id);
  expect(ids).toContain('db_unavailable');
  expect(ids).not.toContain('overall_health');
  const dbRule = rules.rules.find(rule => rule.id === 'db_unavailable')!;
  expect(dbRule.enabled).toBe(true);
  const submitted = { version: 1, rules: rules.rules.map(rule =>
    rule.id === 'db_unavailable' ? { ...rule, consecutive: 1 } : rule) };
  const saved = await admin.updateAlertRules!(submitted);
  expect(saved.rules.find(rule => rule.id === 'db_unavailable')!.consecutive).toBe(1);
  expect(saved.rules.find(rule => rule.id === 'db_unavailable')!.consecutive).toBe(1);
  // A real alert fires within ticks: with consecutive=1 the unhealthy
  // database in a freshly restarted broken instance would alert; here the
  // healthy instance stays quiet and the events page renders the engine.
  await page.goto(`${instance.url}/admin/monitor-events`);
  await expect(page.getByText('关于运行事件')).toBeVisible();

  const member = sdkClient(instance.url);
  await admin.web!.createUser({ username: 'plainadmin2', email: 'plainadmin2@example.test', password: memberPassword, role: 'user' });
  await loginClient(member, 'plainadmin2', memberPassword);
  await expect(member.alertRules!()).rejects.toThrow();
});

test('platform: members never see monitor navigation, pages, widget or API', async ({ instance, page }, testInfo) => {
  await installPlatform(instance);
  const admin = sdkClient(instance.url);
  await loginClient(admin, 'admin', 'administrator-password-strong');
  await admin.web!.createUser({ username: 'plainmember', email: 'plainmember@example.test', password: memberPassword, role: 'user' });
  await workspaceLogin(page, instance.url, 'plainmember');
  // No monitor entries anywhere in the workspace navigation.
  await expect(page.getByText('运行监控', { exact: true })).toHaveCount(0);
  // Direct page access renders the standalone 403, never the console.
  await page.goto(`${instance.url}/monitor`);
  // The 403 page replaces the whole workspace shell, so no #main-content scope.
  await expect(page.getByRole('heading', { name: '没有访问权限' })).toBeVisible();
  // The user dashboard stays free of instance metrics.
  await page.goto(`${instance.url}`);
  await expect(page.getByRole('region', { name: '运行状态摘要' })).toHaveCount(0);
  // Server-side enforcement: the member session is rejected on the API.
  const member = sdkClient(instance.url, 'user');
  await loginClient(member, 'plainmember', memberPassword);
  await expect(member.monitorSnapshot!()).rejects.toThrow();
  // A truly anonymous caller: plain fetch, no cookie jar — instance.request
  // carries the super-admin session seeded by install/complete auto-login.
  const anonymous = await fetch(`${instance.url}/api/v1/admin/monitor`);
  expect(anonymous.status).toBe(401);
});

test('standalone: the local view serves the tabbed console with the same semantics', async ({ instance, page }, testInfo) => {
  await installStandalone(instance);
  // Local read-only API: anonymous on the local surface, platform surface 404
  // (plain fetch keeps the platform cookie out of these checks).
  const response = await fetch(`${instance.url}/api/v1/monitor`);
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.data.profile).toBe('web-standalone');
  expect(payload.data.database.status).toBe('healthy');
  expect(payload.data.http_service.applicable).toBe(true);
  expect(payload.data.storage.applicable).toBe(false);
  const adminSurface = await fetch(`${instance.url}/api/v1/admin/monitor`);
  expect(adminSurface.status).toBe(404);
  // The workspace navigation carries the single monitor console entry (the
  // mobile viewport keeps the tree inside the closed drawer, so entry
  // visibility is asserted on the desktop project and mobile navigates by URL).
  await page.goto(instance.url);
  if (testInfo.project.name !== 'mobile') {
    await expect(page.getByRole('button', { name: '运行监控' })).toBeVisible();
    await page.getByRole('button', { name: '运行监控' }).click();
  } else {
    await page.goto(`${instance.url}/monitor`);
  }
  await expect(page.locator('#main-content').getByRole('heading', { name: '运行监控' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '运行概览' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '服务健康' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '资源监控' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '运行事件' })).toBeVisible();
  await expect(page.getByText('连接正常')).toBeVisible();
  // Tabs render the same sections without any platform identity dependency.
  await page.getByRole('tab', { name: '服务健康' }).click();
  await expect(page.getByText('HTTP 服务')).toBeVisible();
  for (const label of ['对象存储', '后台任务', '不适用', '平台任务']) await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  // The resources tab carries the same host hardware cards as the platform.
  await page.getByRole('tab', { name: '资源监控' }).click();
  await expect(page.getByText('主机信息').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /CPU 使用率/ }).first()).toBeVisible();
  // The events tab serves the same in-process ring buffer.
  await page.getByRole('tab', { name: '运行事件' }).click();
  await expect(page.getByText('实例已启动')).toBeVisible();
  await expect(page.getByText(/对象存储探活失败|定时任务失败|系统通知|平台/)).toHaveCount(0);
  // The framework demo remains; only the live monitoring summary is removed.
  await page.goto(instance.url);
  await expect(page.getByRole('region', { name: '运行状态摘要' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '运行状态', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '我的项目', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '最近动态', exact: true })).toBeVisible();
  await expect(page.getByText(/Wails Bridge|Web 平台|CLI/)).toHaveCount(0);
});
