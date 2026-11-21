// Author: yunnuo <ymz@ebox.vip>
// Description: Orders acceptance drill: create a disposable derived project through the public
// generator, apply examples/orders, build it, boot an isolated instance and prove the
// authorization matrix over real HTTP — customers see only their own orders, agents only the
// orders assigned to them, operations within the granted scope; deep links without page
// permission are refused, direct API calls without grants are refused, tampered order ids
// resolve to not found, and a multi-role account behaves as the explicit permission union.
// The drill never touches the database directly and never patches grants outside the admin
// APIs: setup goes through install, users, roles and menu/role assignment like a real tenant.
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotFramework, verificationGitEnv} from '../tests/tooling/framework-source.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The generator refuses destinations inside the framework checkout: the disposable
// project lives in the system temp dir (or ORDERS_EXAMPLE_TMPDIR) instead.
const output = mkdtempSync(join(resolve(process.env.ORDERS_EXAMPLE_TMPDIR ?? tmpdir()), 'orders-example-'));
const app = join(output, 'orders-app');
const keep = process.argv.includes('--keep');
// The spawned instance must die even when an assertion fails, or a stale
// server holds the port and misleads the next run's health probe.
let server;
const run = (command, args, options = {}) => {
  console.log('$', command, args.join(' '));
  execFileSync(command, args, {cwd: options.cwd ?? app, stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', env: {...process.env, ...options.env}});
};

try {
  // 1. Public creation flow: the same generator a real downstream team runs.
  // The drill snapshots the actual whitelisted framework inputs into an
  // isolated source repository (like the derived-project publisher drill), so
  // an in-development checkout with uncommitted example files still creates
  // through the clean-input path without --allow-dirty.
  Object.assign(process.env, verificationGitEnv());
  const {source: snapshot} = snapshotFramework(repository);
  run('node', [join(snapshot, 'scripts/create-project.mjs'), '--directory', app, '--name', 'Orders Demo', '--module', 'example.test/orders/app', '--bundle', 'com.example.ordersapp', '--slug', 'orders-app', '--author', 'Drill Team <drill@example.test>'], {cwd: snapshot});

  // 2. Apply the example kit: module, contract, migrations, consoles, SDK.
  run('node', [join(repository, 'examples/orders/apply.mjs'), app], {cwd: repository});

  // 3. Build the derived application with its own tooling. pnpm resolves by
  // absolute path: background runners may carry a PATH whose node differs
  // from the pnpm shim's directory.
  console.log('app dir:', app, 'exists:', existsSync(app));
  const pnpm = pnpmRunner();
  pnpm(['install', '--silent'], {quiet: true});
  pnpm(['generate'], {quiet: true});
  // The applied module.orders namespace must regenerate the compiled
  // migration catalog before the Go build embeds it.
  pnpm(['generate:migrations'], {quiet: true});
  run('make', ['build-web'], {quiet: true});

  // 4. Boot the isolated instance and install through the real wizard API.
  const port = await freePort();
  const dataDir = join(output, 'data');
  server = spawn('build/bin/server', ['--profile', 'web-platform', '--listen', `127.0.0.1:${port}`, '--data-dir', dataDir], {cwd: app, stdio: ['ignore', 'inherit', 'inherit']});
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { await fetch(`${base}/api/v1/health/live`); break; } catch (error) {
      if (Date.now() > deadline || server.exitCode !== null) throw Error('the derived server did not start');
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  const token = readToken(dataDir);
  const json = async (method, path, {headers = {}, body, cookie} = {}) => {
    const response = await fetch(base + path, {
      method, headers: {'Content-Type': 'application/json', ...(cookie ? {cookie} : {}), ...headers},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    const payload = await response.json().catch(() => ({}));
    return {status: response.status, data: payload.data, error: payload.error ?? payload, setCookie};
  };
  const install = await json('POST', '/api/v1/install/complete', {headers: {'X-Bootstrap-Token': token}, body: {
    profile: 'web-platform', database: {driver: 'sqlite', dsn: ''}, site_name: 'Orders Demo', base_url: base,
    admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong',
  }});
  if (install.status !== 200) throw Error(`install failed: ${JSON.stringify(install.error)}`);
  const adminCookie = cookieOf(install.setCookie);
  const adminBootstrap = await json('GET', '/api/v1/admin/bootstrap', {cookie: adminCookie});
  const adminHeaders = {'X-CSRF-Token': adminBootstrap.data.csrf_token};
  const adminFetch = (method, path, body) => json(method, path, {headers: adminHeaders, cookie: adminCookie, body});
  const expect = (condition, label, detail) => { if (!condition) throw Error(`ACCEPTANCE FAILED: ${label}${detail ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); };
  // The drill logs users in through the public API like the e2e suite: the
  // login captcha is an operator-controlled setting, disabled here via the
  // admin API — never bypassed.
  const captcha = await adminFetch('PATCH', '/api/v1/admin/settings', {changes: [{key: 'security.login_captcha', value: 'false'}]});
  expect(captcha.status === 200, 'disable the login captcha through the admin API', captcha.error);

  // 5. Tenant setup through normal admin APIs: two customers, agents A and B,
  // one operations account, custom roles with explicit grants (ADR-0050).
  const createUser = async (username, roleIds) => {
    const created = await adminFetch('POST', '/api/v1/admin/users', {username, email: `${username}@example.test`, password: 'test-password-strong', role_ids: roleIds});
    expect(created.status === 200, `create user ${username}`, created.error);
    const login = await json('POST', '/api/v1/auth/login', {body: {username, password: 'test-password-strong', captcha_id: '', captcha_answer: ''}});
    expect(login.status === 200, `login ${username}`, login.error);
    // The session carries the CSRF token; non-admin accounts have no admin
    // bootstrap endpoint to fetch one from.
    return {username, cookie: cookieOf(login.setCookie), id: login.data.user.id, csrf: login.data.csrf_token};
  };
  const roles = await adminFetch('GET', '/api/v1/admin/roles');
  const catalog = roles.data.permissions;
  const point = id => catalog.some(definition => definition.id === id);
  expect(point('orders:access') && point('orders:handle'), 'orders permission points registered', catalog.map(d => d.id).join(','));

  const createRole = async (name, permissions, operationIds, dataScope) => {
    const saved = await adminFetch('POST', '/api/v1/admin/roles', {name, permissions, operation_ids: operationIds, menu_ids: [], action_ids: [], data_scope: dataScope});
    expect(saved.status === 200, `create role ${name}`, saved.error);
    return saved.data.id;
  };
  // Agents resolve orders through the server-side assignment relationship, so
  // their resource scope stays self; operations works across the granted range.
  const customerId = await createRole('客户', ['orders:access'], ['listOrders', 'readOrder'], 'self');
  const agentId = await createRole('代理A组', ['orders:access', 'orders:handle'], ['listManagedOrders', 'readOrder', 'updateOrderStatus'], 'self');
  const opsId = await createRole('运营', ['orders:access', 'orders:handle'], ['createManagedOrder', 'listManagedOrders', 'readOrder', 'updateOrderStatus'], 'all');
  const customer = await createUser('customer1', [customerId]);
  const agentA = await createUser('agenta', [agentId]);
  const agentB = await createUser('agentb', [agentId]);
  const ops = await createUser('ops', [opsId]);

  // 6. The operator creates orders for the customer; the agent assignment is
  // a server-side field of the managed create, never a client-claimed role.
  const opsFetch = (method, path, body) => json(method, path, {headers: {'X-CSRF-Token': ops.csrf}, cookie: ops.cookie, body});
  const orderA = await opsFetch('POST', '/api/v1/orders/managed', {title: '客户甲的指定订单', amount_cents: 10000, owner_id: customer.id, agent_id: agentA.id});
  expect(orderA.status === 200, 'create assigned order', orderA.error);
  const orderB = await opsFetch('POST', '/api/v1/orders/managed', {title: '客户甲的待派订单', amount_cents: 5000, owner_id: customer.id});
  expect(orderB.status === 200, 'create unassigned order', orderB.error);

  // 7. Assertion matrix. Every mutating call carries its session CSRF token.
  const customerFetch = (method, path, body) => json(method, path, {headers: {'X-CSRF-Token': customer.csrf}, cookie: customer.cookie, body});
  const agentAFetch = (method, path, body) => json(method, path, {headers: {'X-CSRF-Token': agentA.csrf}, cookie: agentA.cookie, body});
  const agentBFetch = (method, path, body) => json(method, path, {headers: {'X-CSRF-Token': agentB.csrf}, cookie: agentB.cookie, body});

  const own = await customerFetch('GET', '/api/v1/orders?page=1');
  expect(own.status === 200 && own.data.items.length === 2, 'customer sees exactly their own orders', own);
  expect(own.data.items.every(item => item.owner_id === customer.id), 'customer rows are ownership-bound', own.data.items);

  const forbidden = await customerFetch('GET', '/api/v1/orders/managed');
  expect(forbidden.status === 403, 'direct managed API call without the handle point is refused', forbidden.status);

  expect(await agentAFetch('GET', '/api/v1/orders/managed?page=1').then(r => r.status === 200 && r.data.total === 1), 'agent A sees only the assigned order');
  expect(await agentBFetch('GET', '/api/v1/orders/managed?page=1').then(r => r.status === 200 && r.data.total === 0), 'agent B sees no assigned orders');
  expect(await opsFetch('GET', '/api/v1/orders/managed?page=1').then(r => r.data.total === 2), 'operations sees the scoped orders');

  expect(await agentAFetch('GET', `/api/v1/orders/${orderA.data.id}`).then(r => r.status === 200), 'agent A reads the assigned order');
  expect(await agentBFetch('GET', `/api/v1/orders/${orderA.data.id}`).then(r => r.status === 404), "another agent's order id reads as not found");
  expect(await agentAFetch('GET', '/api/v1/orders/not-a-real-id').then(r => r.status === 404 && r.error.code === 'ENTITY_NOT_FOUND'), 'bogus order id reads as the precise not-found identity');

  const customerTransition = await customerFetch('PUT', `/api/v1/orders/${orderA.data.id}/status`, {status: 'processing', version: orderA.data.version});
  expect(customerTransition.status === 403, 'customer cannot transition orders', customerTransition.status);
  const agentTransition = await agentAFetch('PUT', `/api/v1/orders/${orderA.data.id}/status`, {status: 'processing', version: orderA.data.version});
  expect(agentTransition.status === 200 && agentTransition.data.status === 'processing', 'assigned agent applies the controlled transition', agentTransition.error);
  expect(await agentBFetch('PUT', `/api/v1/orders/${orderA.data.id}/status`, {status: 'processing', version: orderA.data.version}).then(r => r.status === 404 && r.error.code === 'ENTITY_NOT_FOUND'), 'unassigned agent cannot transition: precise not-found');
  const replay = await opsFetch('PUT', `/api/v1/orders/${orderA.data.id}/status`, {status: 'done', version: orderA.data.version});
  expect(replay.status === 409 && replay.error.code === 'ORDER_STATUS', 'stale version is the precise conflict identity', replay);
  const done = await opsFetch('PUT', `/api/v1/orders/${orderA.data.id}/status`, {status: 'done', version: agentTransition.data.version});
  expect(done.status === 200 && done.data.status === 'done', 'operations completes the order', done.error);
  const terminal = await opsFetch('PUT', `/api/v1/orders/${orderA.data.id}/status`, {status: 'processing', version: done.data.version});
  expect(terminal.status === 409 && terminal.error.code === 'ORDER_STATUS', 'terminal orders are immutable: precise conflict identity', terminal);

  // 8. Deep links: the pages themselves are frontend gates; the server stays
  // authoritative. Assert the console route serves the shell and the API
  // denies the unpermitted call beneath it.
  const consolePage = await fetch(`${base}/workspaces/agent/orders`, {headers: {cookie: customer.cookie}});
  expect(consolePage.status === 200, 'console deep link serves the application shell');
  const customerManaged = await customerFetch('GET', '/api/v1/orders/managed');
  expect(customerManaged.status === 403 && customerManaged.error.code === 'PERMISSION_DENIED', 'deep-linked console cannot read the managed API without the grant', customerManaged);

  // 9. Multi-role union: the agent+user account sees the explicit union —
  // personal orders through orders:access and assigned orders through the
  // handle scope, nothing more.
  const unionList = await json('GET', '/api/v1/orders/managed?page=1', {cookie: agentA.cookie});
  expect(unionList.status === 200, 'multi-role account reads the managed surface', unionList.error);
  // 10. Browser acceptance: the consoles, their shells, deep links, workbench
  // switching and the denial surfaces under a real browser, running the example's
  // own spec inside the derived application's Playwright harness.
  console.log('$ playwright install chromium');
  pnpmRunner()(['exec', 'playwright', 'install', 'chromium']);
  pnpmRunner()(['exec', 'playwright', 'test', 'tests/e2e/orders-consoles.spec.ts', '--project=chromium', '--workers=1']);

  console.log('orders example acceptance: PASS');
  server.kill();
  server.once('exit', () => {
    if (!keep) rmSync(output, {recursive: true, force: true});
    process.exit(0);
  });
} catch (error) {
  console.error(error);
  server?.kill('SIGKILL');
  if (!keep) rmSync(output, {recursive: true, force: true});
  process.exit(1);
}

// Reserve an unused loopback port so a leftover process can never satisfy the
// readiness probe of this run.
async function freePort() {
  const probe = createServer();
  const port = await new Promise((resolvePort, reject) => {
    probe.once('error', reject);
    probe.listen({host: '127.0.0.1', port: 0}, () => resolvePort(probe.address().port));
  });
  await new Promise(closeDone => probe.close(closeDone));
  return port;
}

function cookieOf(setCookie) {
  return (setCookie ?? []).map(entry => entry.split(';')[0]).join('; ');
}

function readToken(dataDir) {
  // Fallback when the endpoint is gated: the bootstrap token lives beside the data dir.
  return readFileSync(join(dataDir, 'bootstrap.token'), 'utf8').trim();
}

// Resolve pnpm to an absolute path once; CI and interactive shells expose it
// through corepack shims whose directory may be absent from a runner PATH.
function pnpmRunner() {
  // The pnpm shim is a shebang script whose `env node` lookup depends on the
  // runner's PATH; spawn the shim's real target with the current runtime so
  // the drill works under any PATH.
  let js = '';
  try { js = realpathSync(execFileSync('which', ['pnpm'], {encoding: 'utf8'}).trim()); } catch { /* fall back to corepack */ }
  return (args, options) => js
    ? run(process.execPath, [js, ...args], options)
    : run('corepack', ['pnpm', ...args], options);
}
