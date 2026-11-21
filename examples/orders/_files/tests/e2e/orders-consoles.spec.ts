// Author: yunnuo <ymz@ebox.vip>
// Description: Browser acceptance for the orders example: per-role workbench entries and the
// two distinct shells over the shared page set, list and detail deep links, cross-workbench
// switching, and every denial asserted with its precise API status — through the browser
// session cookies as well as through raw sessions, so a wrong status code cannot pass.
import { test, expect, installPlatform, sdkClient, loginClient, workspaceLogin, captchaAnswer, memberPassword, type Instance } from './fixtures';

const adminPassword = 'administrator-password-strong';

// A raw session mirrors the platform session flow (captcha, login) and keeps the cookie and
// CSRF token so status assertions exercise the real session boundary, not a bypass.
async function sessionOf(instance: Instance, username: string, password: string) {
  const challenge = await (await fetch(`${instance.url}/api/v1/auth/captcha`)).json();
  const login = await fetch(`${instance.url}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, captcha_id: challenge.data.id, captcha_answer: captchaAnswer(challenge.data.image) }),
  });
  expect(login.status).toBe(200);
  const payload = await login.json();
  const cookie = (login.headers.getSetCookie() ?? []).map(entry => entry.split(';')[0]).join('; ');
  return { cookie, csrf: payload.data.csrf_token as string, id: payload.data.user.id as string };
}

async function call(instance: Instance, session: { cookie: string; csrf: string }, method: string, path: string, body?: unknown) {
  const response = await fetch(instance.url + path, {
    method, headers: { 'Content-Type': 'application/json', cookie: session.cookie, 'X-CSRF-Token': session.csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  // Handler errors nest under error; policy-middleware denials put code at the top level.
  const envelope = payload as { code?: string; error?: { code?: string }; data?: Record<string, unknown> };
  return { status: response.status, code: envelope.error?.code ?? envelope.code ?? '', data: envelope.data };
}

test('orders consoles accept roles, shells, deep links, switching and precise denials', async ({ page, instance }) => {
  test.setTimeout(240_000);
  await installPlatform(instance);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', adminPassword);
  const catalog = (await admin.roles()).permissions;
  expect(catalog.some(definition => definition.id === 'orders:access')).toBe(true);
  expect(catalog.some(definition => definition.id === 'orders:handle')).toBe(true);

  // Roles with explicit grants; operation grants never exceed the permission points and the
  // agents resolve orders through the server-side assignment relationship (self scope).
  const createRole = async (name: string, permissions: string[], operationIds: string[], dataScope: 'self' | 'all') =>
    (await admin.createRole({ name, permissions, operation_ids: operationIds, menu_ids: [], action_ids: [], data_scope: dataScope })).id;
  const customerRole = await createRole('客户', ['orders:access'], ['listOrders', 'readOrder'], 'self');
  const agentRole = await createRole('代理A组', ['orders:access', 'orders:handle'], ['listManagedOrders', 'readOrder', 'updateOrderStatus'], 'self');
  const opsRole = await createRole('运营', ['orders:access', 'orders:handle'], ['createManagedOrder', 'listManagedOrders', 'readOrder', 'updateOrderStatus'], 'all');
  const mkUser = async (username: string, roleIds: string[]) => {
    await admin.createUser({ username, email: `${username}@example.test`, password: memberPassword, role_ids: roleIds });
    return (await sessionOf(instance, username, memberPassword)).id;
  };
  const customerId = await mkUser('customer1', [customerRole]);
  const agentAId = await mkUser('agenta', [agentRole]);
  await mkUser('agentb', [agentRole]);
  await mkUser('ops', [opsRole]);
  const customer = await sessionOf(instance, 'customer1', memberPassword);
  const agentA = await sessionOf(instance, 'agenta', memberPassword);
  const agentB = await sessionOf(instance, 'agentb', memberPassword);
  const ops = await sessionOf(instance, 'ops', memberPassword);
  const opsClient = sdkClient(instance.url, 'user');
  await loginClient(opsClient, 'ops', memberPassword);
  // Assignment is a server-side field of the managed create, never a client-claimed role.
  const assigned = await opsClient.createManagedOrder({ owner_id: customerId, title: '客户甲的指定订单', amount_cents: 10000, agent_id: agentAId });
  await opsClient.createManagedOrder({ owner_id: customerId, title: '客户甲的待派订单', amount_cents: 5000 });

  // -- Precise API matrix ---------------------------------------------------
  const own = await call(instance, customer, 'GET', '/api/v1/orders?page=1');
  expect(own.status).toBe(200);
  expect(own.data?.total).toBe(2);
  expect(await call(instance, customer, 'GET', '/api/v1/orders/managed?page=1')).toMatchObject({ status: 403, code: 'PERMISSION_DENIED' });

  const agentAList = await call(instance, agentA, 'GET', '/api/v1/orders/managed?page=1');
  expect(agentAList.status).toBe(200);
  expect(agentAList.data?.total).toBe(1);
  expect(await call(instance, agentB, 'GET', '/api/v1/orders/managed?page=1')).toMatchObject({ status: 200 });
  expect((await call(instance, agentB, 'GET', '/api/v1/orders/managed?page=1')).data?.total).toBe(0);

  expect(await call(instance, agentB, 'GET', `/api/v1/orders/${assigned.id}`)).toMatchObject({ status: 404, code: 'ENTITY_NOT_FOUND' });
  expect(await call(instance, agentA, 'GET', '/api/v1/orders/not-a-real-id')).toMatchObject({ status: 404, code: 'ENTITY_NOT_FOUND' });

  expect(await call(instance, customer, 'PUT', `/api/v1/orders/${assigned.id}/status`, { status: 'processing', version: assigned.version })).toMatchObject({ status: 403, code: 'PERMISSION_DENIED' });
  const moved = await call(instance, agentA, 'PUT', `/api/v1/orders/${assigned.id}/status`, { status: 'processing', version: assigned.version });
  expect(moved.status).toBe(200);
  expect(await call(instance, agentB, 'PUT', `/api/v1/orders/${assigned.id}/status`, { status: 'processing', version: assigned.version })).toMatchObject({ status: 404, code: 'ENTITY_NOT_FOUND' });
  // A stale version on a visible order is a conflict, not a generic failure.
  expect(await call(instance, ops, 'PUT', `/api/v1/orders/${assigned.id}/status`, { status: 'done', version: assigned.version })).toMatchObject({ status: 409, code: 'ORDER_STATUS' });
  const done = await call(instance, ops, 'PUT', `/api/v1/orders/${assigned.id}/status`, { status: 'done', version: (moved.data as { version: number }).version });
  expect(done.status).toBe(200);
  // Terminal orders are immutable with the same precise conflict identity.
  expect(await call(instance, ops, 'PUT', `/api/v1/orders/${assigned.id}/status`, { status: 'processing', version: (done.data as { version: number }).version })).toMatchObject({ status: 409, code: 'ORDER_STATUS' });

  // -- Browser: customer sees the forbidden surface, never the data ---------
  // Fresh session per role: the previous browser session would redirect /login away.
  await page.context().clearCookies();
  await workspaceLogin(page, instance.url, 'customer1', memberPassword);
  await page.goto(`${instance.url}/workspaces/agent/orders`);
  await expect(page.getByRole('heading', { name: '没有访问权限', exact: true })).toBeVisible();
  const browserDenied = await page.context().request.get(`${instance.url}/api/v1/orders/managed?page=1`);
  expect(browserDenied.status()).toBe(403);
  expect(((await browserDenied.json()) as { code?: string }).code).toBe('PERMISSION_DENIED');

  // -- Browser: agent A gets the sidebar shell, only the assigned order, and the detail deep link
  // Fresh session per role: the previous browser session would redirect /login away.
  await page.context().clearCookies();
  await workspaceLogin(page, instance.url, 'agenta', memberPassword);
  await page.goto(`${instance.url}/workspaces/agent/orders`);
  await expect(page.getByRole('banner').getByText('代理工作台')).toBeVisible();
  await expect(page.getByLabel('代理工作台导航')).toBeVisible();
  await expect(page.getByRole('heading', { name: '订单处理', exact: true })).toBeVisible();
  await expect(page.getByText('客户甲的指定订单')).toBeVisible();
  await expect(page.getByText('客户甲的待派订单')).toBeHidden();
  await page.goto(`${instance.url}/workspaces/agent/orders/${assigned.id}`);
  await expect(page.getByText('客户甲的指定订单')).toBeVisible();
  await expect(page.getByRole('button', { name: '返回列表' })).toBeVisible();
  // The same permission point enters the operations console with its own top-tab shell.
  await page.goto(`${instance.url}/workspaces/operations/orders`);
  await expect(page.getByLabel('运营工作台导航')).toBeVisible();
  await expect(page.getByRole('banner').getByText('运营工作台')).toBeVisible();

  // -- Browser: agent B gets the empty managed list and the invisible-order detail ----------
  // Fresh session per role: the previous browser session would redirect /login away.
  await page.context().clearCookies();
  await workspaceLogin(page, instance.url, 'agentb', memberPassword);
  await page.goto(`${instance.url}/workspaces/agent/orders`);
  await expect(page.getByText('暂无待处理订单')).toBeVisible();
  await page.goto(`${instance.url}/workspaces/agent/orders/${assigned.id}`);
  await expect(page.getByText('订单不可见')).toBeVisible();

  // -- Browser: operations sees both orders in the top-tab shell ----------------------------
  // Fresh session per role: the previous browser session would redirect /login away.
  await page.context().clearCookies();
  await workspaceLogin(page, instance.url, 'ops', memberPassword);
  await page.goto(`${instance.url}/workspaces/operations/orders`);
  await expect(page.getByLabel('运营工作台导航')).toBeVisible();
  await expect(page.getByText('客户甲的指定订单')).toBeVisible();
  await expect(page.getByText('客户甲的待派订单')).toBeVisible();
});
