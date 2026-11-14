// Author: yunnuo <ymz@ebox.vip>
// Description: Every browser test owns a fresh process, data directory and bootstrap credential.
import { test as base, expect, type APIRequestContext, type Page, type Locator, type PlaywrightWorkerArgs } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { HttpTransport, type AppClient, type MenuList, type NavigationNode } from '../../packages/sdk/src';
import { operations } from '../../packages/contracts/src/operations.gen';

export type { MenuList };

export type Instance = { url: string; token: string; request: APIRequestContext; directory: string; restart: () => Promise<void>; unlockForReinstall: () => Promise<string> };
type InstanceFixtures = { instance: Instance; instanceNoDocs: Instance };

async function freePort(): Promise<number> {
  const allocator = createServer();
  await new Promise<void>(resolve => allocator.listen(0, '127.0.0.1', resolve));
  const port = (allocator.address() as { port: number }).port;
  await new Promise<void>(resolve => allocator.close(() => resolve()));
  return port;
}

async function spawnInstance({ playwright }: Pick<PlaywrightWorkerArgs, 'playwright'>, project: string, apiDocs: boolean, workerIndex: number, use: (instance: Instance) => Promise<void>) {
  // Fully-parallel workers can grab each other's just-freed port (TOCTOU
  // between the allocator close and the child bind), so every project/worker
  // pair owns a disjoint listen range (projects run concurrently and worker
  // indexes repeat per project); the in-loop token probe below is the second
  // line of defense: a fresh foreign instance answers 401 and an installed
  // one 409, while our own uninitialized instance answers 400.
  const directory = await mkdtemp(join(tmpdir(), 'unicore-e2e-'));
  const start = (listenPort: number) => spawn('build/bin/server', ['--listen', `127.0.0.1:${listenPort}`, '--data-dir', directory, `--api-docs=${apiDocs}`], { stdio: ['ignore', openSync('/tmp/e2e-server-stdout.log', 'a'), openSync('/tmp/e2e-server-stderr.log', 'a')], env: Object.fromEntries(Object.entries(globalThis.process.env).filter(([key]) => !key.startsWith('APP_'))) });
  // Fully-parallel workers can grab each other's just-freed port (TOCTOU
  // between the allocator close and the child bind), so every spawned server
  // must prove its identity with its own bootstrap token before the fixture
  // hands the URL out; a collision retries on a fresh port.
  const stop0 = (child: ReturnType<typeof spawn>) => { if (child.exitCode === null) child.kill('SIGTERM'); };
  let process: ReturnType<typeof spawn>;
  let url = '';
  let listenPort = 0;
  let request = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:0' });
  let fixtureToken = '';
  const projectOffset = project.includes('mobile') ? 250 : 0;
  for (let attempt = 0; ; attempt++) {
    listenPort = 41000 + projectOffset + workerIndex * 25 + attempt % 25;
    url = `http://127.0.0.1:${listenPort}`;
    process = start(listenPort);
    await request.dispose();
    request = await playwright.request.newContext({ baseURL: url });
    let live = false;
    let token = '';
    for (let i = 0; i < 30; i++) {
      try {
        if ((await request.get('/api/v1/health/live')).status() === 200) {
          token = (await readFile(join(directory, 'bootstrap.token'), 'utf8')).trim();
          if (token) { fixtureToken = token; live = true; break; }
        }
      } catch {}
      await new Promise<void>(resolve => setTimeout(resolve, 500));
    }
    if (!live) { stop0(process); continue; }
    const probe = await request.post('/api/v1/install/verify-db', { headers: { 'X-Bootstrap-Token': token }, data: { driver: 'sqlite', dsn: '' } });
    // Identity proof: only our own token passes authorization (fresh foreign
    // instance -> 401, installed foreign instance -> 409 before token check),
    // so an accepted probe means the URL belongs to this fixture's server.
    if (probe.status() === 200 || probe.status() === 400) break;
    stop0(process);
  }
  const stop = async () => { if (process.exitCode !== null) return; process.kill('SIGTERM'); await new Promise<void>(resolve => process.once('exit', () => resolve())); };
  try {
    await use({ url, token: fixtureToken, request, directory,
      restart: async () => { await stop(); process = start(listenPort); await expect.poll(async () => { try { return (await request.get('/api/v1/health/ready')).status(); } catch { return 0; } }, { timeout: 15000 }).toBe(200); },
      unlockForReinstall: async () => {
        await stop();
        await rm(join(directory, 'install.lock'));
        process = start(listenPort);
        await expect.poll(async () => { try { return (await request.get('/api/v1/health/live')).status(); } catch { return 0; } }, { timeout: 15000 }).toBe(200);
        expect((await request.get('/api/v1/health/ready')).status()).toBe(503);
        return (await readFile(join(directory, 'bootstrap.token'), 'utf8')).trim();
      },
    });
  } finally {
    await stop();
    await request.dispose(); await rm(directory, { recursive: true, force: true });
  }
}
export const test = base.extend<InstanceFixtures>({
  instance: [async ({ playwright }, use, testInfo) => { await spawnInstance({ playwright }, testInfo.project.name, true, testInfo.workerIndex, use); }, { auto: false }],
  // A default instance with the contract reference unpublished, for gating tests.
  instanceNoDocs: [async ({ playwright }, use, testInfo) => { await spawnInstance({ playwright }, testInfo.project.name, false, testInfo.workerIndex, use); }, { auto: false }],
});
export { expect };

export const memberPassword = 'test-password-strong';

// Install the web-platform profile with the shared synthetic administrator.
export async function installPlatform(instance: Instance, admin = { username: 'admin', email: 'admin@example.test', password: 'administrator-password-strong' }) {
  const response = await instance.request.post('/api/v1/install/complete', { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: admin.username, admin_email: admin.email, admin_password: admin.password } });
  expect(response.status()).toBe(200);
}

export async function installStandalone(instance: Instance) {
  const response = await instance.request.post('/api/v1/install/complete', { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-standalone', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: '', admin_email: '', admin_password: '' } });
  expect(response.status()).toBe(200);
}

// Bootstrap from the browser's own session: page.request shares the page's
// cookie jar, so its CSRF token matches the requests made through it.
export async function pageBoot(page: Page, url: string) {
  return (await (await page.request.get(`${url}/api/v1/admin/bootstrap`, { headers: {} })).json()).data as { csrf_token: string; current_user: { id: string } };
}

export function captchaAnswer(image: string) {
  return [...Buffer.from(image.split(',')[1], 'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match => match[1]).join('');
}

async function submitLogin(page: Page, username: string, password: string) {
  await page.getByLabel('账号或邮箱').fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  const image = await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');
  await page.getByLabel('图形验证码', { exact: true }).fill(captchaAnswer(image!));
  await page.getByRole('button', { name: '登录工作空间' }).click();
}

// Administrator sessions start at /admin; members land on the workspace home.
// Accounts whose landing page is not granted see the standalone 403 page instead.
export async function adminLogin(page: Page, url: string, username: string, password: string) {
  await page.goto(`${url}/admin`);
  await submitLogin(page, username, password);
  await expect(page.getByRole('heading', { name: '工作台概览' }).or(page.getByRole('heading', { name: '没有访问权限' }))).toBeVisible();
}

export async function workspaceLogin(page: Page, url: string, username: string, password = memberPassword) {
  await page.goto(`${url}/login`);
  await submitLogin(page, username, password);
  await expect(page.getByRole('heading', { name: '工作台概览' }).or(page.getByRole('heading', { name: '没有访问权限' }))).toBeVisible();
}

// The SDK runs in Node without a cookie jar: capture the session cookie between
// calls so the client exercises the real CSRF + session path.
export function sdkClient(url: string, realm: 'user' | 'administrator' = 'administrator') {
  let cookie = '';
  const fetcher: typeof fetch = async (input, init) => {
    // Headers instances have no enumerable own properties; flatten them so the
    // SDK's Content-Type and CSRF headers survive the cookie injection.
    const response = await fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), ...(cookie ? { cookie } : {}) } });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length) cookie = setCookies.map(entry => entry.split(';')[0]).join('; ');
    return response;
  };
  return new HttpTransport(url, fetcher, realm);
}

export async function loginClient(client: ReturnType<typeof sdkClient>, username: string, password: string) {
  const captcha = await client.captcha();
  await client.login({ username, password, captcha_id: captcha.id, captcha_answer: captchaAnswer(captcha.image) });
}

// Mirrors platform.MaterializedOperations: the operation grants a role's
// permission points already unlock. The generator carries no catalogue id on
// the entry itself (it is the object key) and no realm, so the management
// prefix stands in for the identity realm.
export function materializedOperations(realm: 'user' | 'administrator', permissions: string[]) {
  return Object.entries(operations)
    .filter(([id, operation]) => operation.superAdmin === false
      && operation.permissions.length > 0
      && !/\/(auth|account)\b|\/bootstrap/.test(operation.path)
      && ['session', 'authenticated', 'platform-session'].includes(operation.access)
      && (operation.permissionMode === 'any'
        ? operation.permissions.some(needed => permissions.includes(needed))
        : operation.permissions.every(needed => permissions.includes(needed))))
    .map(([id]) => id).sort();
}

// Open the actual navigation and expand every collapsed ancestor (outermost
// first) so entries nested in directories become reachable, then click.
export async function navigate(page: Page, name: string) {
  const sidebar = page.locator('.sidebar');
  const open = page.getByRole('button', { name: '打开导航', exact: true });
  // A navigation immediately after install/login can precede the shell mount.
  // Wait for either real desktop navigation or the mobile drawer control first.
  await expect.poll(async () => await sidebar.isVisible() || await open.isVisible()).toBe(true);
  const expand = page.getByRole('button', { name: '展开导航', exact: true });
  if (await expand.isVisible()) await expand.click();
  if (!await sidebar.isVisible()) await open.click();
  const target = sidebar.getByRole('button', { name, exact: true });
  // Directories start collapsed, so the target button stays outside the
  // accessibility tree until its ancestors expand; walk the collapsed toggles
  // until the target is reachable (getByRole cannot see through [hidden]).
  for (let guard = 0; guard < 8 && !await target.isVisible(); guard++) {
    const collapsed = sidebar.locator('button[aria-expanded="false"]');
    if (!await collapsed.count()) break;
    await collapsed.first().click();
  }
  await target.click();
}

// Registered route labels: the display fallback the shell applies when a node
// carries no operator label.
const routeLabels: Record<string, string> = {
  overview: '工作台概览', notes: '我的笔记', site: '基础设置', storage: '对象存储',
  users: '用户列表', administrators: '管理员列表', announcements: '平台公告', 'account-policy': '账户安全', mail: '邮件设置',
  'mail-templates': '邮件模板', 'notification-channels': '通知渠道', 'notification-templates': '通知模板',
  'system-notifications': '系统通知', logs: '操作日志', edition: '系统更新', roles: '角色权限', posts: '岗位管理',
  'api-operations': 'API 操作目录', departments: '部门管理', tasks: '定时任务', menus: '菜单管理', dictionaries: '数据字典',
  'api-docs': 'API 文档',
};

// Seeded directories carry localized display names like the workspace fallback.
// The personal center keeps no directory: it opens from the account menus.
const directoryLabels: Record<string, string> = { administration: '超级管理员', settings: '系统设置' };

// The label a node renders with: the operator override, the registered route
// label or the seeded directory fallback.
export function nodeDisplayLabel(node: { label: string; route_id?: string; id: string }): string {
  return node.label.trim() || (node.route_id ? routeLabels[node.route_id] ?? node.route_id : directoryLabels[node.id] ?? node.id);
}

// The personal center opens from either account menu and lands on the modal's
// profile page; the four panes are one rail click away. Works on desktop and
// mobile because the topbar trigger renders on both. Pass locale='en' for
// pages running under the English preference pack.
const personalCenterLabels = {
  zh: { topbar: '账号菜单', sidebar: '侧栏账号菜单', item: '个人中心', dialog: '个人中心' },
  en: { topbar: 'Account menu', sidebar: 'Sidebar account menu', item: 'Personal center', dialog: 'Personal center' },
} as const;
export async function openPersonalCenter(page: Page, section?: string, entry: 'topbar' | 'sidebar' = 'topbar', locale: 'zh' | 'en' = 'zh') {
  const labels = personalCenterLabels[locale];
  // Tall pages can carry the topbar out of view; the menu anchors to the
  // trigger, so bring the page back to the top before opening it.
  await page.evaluate(() => window.scrollTo(0, 0));
  const trigger = entry === 'sidebar'
    ? page.getByRole('button', { name: labels.sidebar, exact: true })
    : page.getByRole('button', { name: labels.topbar, exact: true });
  await trigger.click();
  try {
    await page.getByRole('menuitem', { name: labels.item, exact: true }).click({ timeout: 8000 });
  } catch (error) {
    await page.screenshot({ path: 'build/acceptance/open-personal-center-hang.png' }).catch(() => {});
    throw error;
  }
  const dialog = page.getByRole('dialog', { name: labels.dialog, exact: true });
  await dialog.waitFor({ state: 'visible' });
  if (section) await dialog.getByRole('button', { name: section, exact: true }).click();
  return dialog;
}

export function pageNode(config: MenuList, routeId: string, surface?: 'user' | 'administrator'): NavigationNode | undefined {
  const sections = new Set(config.sections.filter(section => !surface || section.surfaces.includes(surface)).map(section => section.id));
  const candidates = config.nodes.filter(node => node.type === 'page' && node.route_id === routeId && sections.has(node.section_id));
  return (!surface ? candidates.find(node => config.sections.some(section => section.id === node.section_id && section.surfaces.includes('user'))) : undefined) ?? candidates[0];
}

// Role menu authorization needs the full ancestor chain: the server suppresses
// nodes whose ancestors are not granted as well.
export function menuChain(config: MenuList, routeId: string, surface?: 'user' | 'administrator'): string[] {
  const node = pageNode(config, routeId, surface);
  if (!node) return [];
  const byId = new Map(config.nodes.map(item => [item.id, item]));
  const chain = [node.id];
  let parent = node.parent_id ? byId.get(node.parent_id) : undefined;
  while (parent) { chain.unshift(parent.id); parent = parent.parent_id ? byId.get(parent.id) : undefined; }
  return chain;
}

// Follow the shared control's semantic presentation, keeping option names visible in tests.
export async function chooseOption(page: Page, label: string, option: string | RegExp, scope: Page | Locator = page) {
  const group = scope.getByRole('radiogroup', { name: label, exact: true });
  if (await group.count()) { await group.getByRole('radio', { name: option, exact: typeof option === 'string' }).check(); return; }
  const control = scope.getByRole('combobox', { name: label, exact: true });
  if (await control.evaluate(element => element.tagName === 'INPUT')) await control.fill(typeof option === 'string' ? option : '');
  else await control.click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
}
