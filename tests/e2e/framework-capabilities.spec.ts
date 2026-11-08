// Author: yunnuo <ymz@ebox.vip>
// Description: Real platform capability acceptance with retained PC/375px evidence and SDK-backed setup.
import type { APIRequestContext, Download, Page, TestInfo } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { HttpTransport, type AppClient } from '../../packages/sdk/src';
import { operations } from '../../packages/contracts/src/operations.gen';
import { test, expect, navigate, nodeDisplayLabel, pageNode } from './fixtures';

const password = 'test-password-strong';
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Playwright's request context shares the browser cookie jar, including cookies issued by install/login.
// Adapt SDK fetch calls, including multipart uploads, without duplicating operation URLs or envelopes.
function client(request: APIRequestContext, url: string, realm: 'user' | 'administrator' = 'user') {
  const fetcher: typeof fetch = async (input, init) => {
    const headers = Object.fromEntries(new Headers(init?.headers));
    let multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> | undefined;
    if (init?.body instanceof FormData) {
      multipart = {};
      for (const [key, value] of init.body.entries()) {
        multipart[key] = typeof value === 'string' ? value : {
          name: value.name, mimeType: value.type, buffer: Buffer.from(await value.arrayBuffer()),
        };
      }
    }
    const response = await request.fetch(String(input), {
      method: init?.method ?? 'GET', headers,
      ...(multipart ? { multipart } : init?.body ? {
        data: init.body instanceof Blob ? Buffer.from(await init.body.arrayBuffer()) : init.body as string,
      } : {}),
    });
    return new Response(response.status() === 204 ? null : new Uint8Array(await response.body()), {
      status: response.status(), headers: response.headers(),
    });
  };
  return new HttpTransport(url, fetcher, realm);
}

async function install(api: AppClient, token: string, url: string) {
  await api.web!.completeInstall(token, {
    profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: url,
    admin_username: 'admin', admin_email: 'admin@example.test', admin_password: password,
  });
}

async function evidence(page: Page, info: TestInfo, feature: string, fullPage = true) {
  if (info.project.name === 'mobile') expect(page.viewportSize()?.width).toBe(375);
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${feature}: viewport overflow`).toBe(true);
  const directory = `build/acceptance/framework-capabilities/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${feature}.png`, fullPage, animations: 'disabled' });
}

async function downloaded(download: Promise<Download>, filename: string) {
  const result = await download;
  expect(result.suggestedFilename()).toBe(filename);
  expect(await result.failure()).toBeNull();
  return readFile((await result.path())!);
}

// XLSX is an ordinary ZIP archive. Keep this bounded helper local to the acceptance spec:
// it reads the real downloaded template and fills synthetic cells without adding a spreadsheet dependency.
function workbookEntries(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end, 'XLSX ZIP end record').toBeGreaterThanOrEqual(0);
  let offset = bytes.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let count = bytes.readUInt16LE(end + 10); count > 0; count--) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
    const compression = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const nameSize = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + nameSize).toString();
    const local = bytes.readUInt32LE(offset + 42);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + size);
    expect([0, 8]).toContain(compression);
    entries.set(name, compression === 8 ? inflateRawSync(compressed) : compressed);
    offset += 46 + nameSize + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  expect(entries.has('xl/worksheets/sheet1.xml')).toBe(true);
  return entries;
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function filledTemplate(template: Buffer) {
  const entries = workbookEntries(template);
  const cells = ['imported.member', 'imported.member@example.test', password, 'user']
    .map((value, index) => `<c r="${String.fromCharCode(65 + index)}2" t="inlineStr"><is><t>${value}</t></is></c>`).join('');
  entries.set('xl/worksheets/sheet1.xml', Buffer.from(entries.get('xl/worksheets/sheet1.xml')!.toString()
    .replace('</sheetData>', `<row r="2">${cells}</row></sheetData>`)));
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const encoded = Buffer.from(name), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(encoded.length, 26);
    local.push(header, encoded, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8); directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(encoded.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, encoded);
    offset += header.length + encoded.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.size, 8); end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function workbookText(bytes: Buffer) {
  return [...workbookEntries(bytes)].filter(([name]) => name.startsWith('xl/') && name.endsWith('.xml'))
    .map(([, value]) => value.toString()).join('\n');
}

test.setTimeout(120_000);

test('published announcements refresh the live bell, inbox reads persist and forbidden pages explain access', async ({ page, browser, instance }, info) => {
  await install(client(page.request, instance.url), instance.token, instance.url);
  const admin = client(page.request, instance.url, 'administrator');
  await admin.bootstrap();
  await admin.patchSettings({ changes: [{ key: 'security.login_captcha', value: 'false' }] });
  const member = await admin.web.createUser({ username: 'live.member', email: 'live.member@example.test', password, role: 'user' });
  const memberContext = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'mobile', hasTouch: info.project.name === 'mobile' });
  try {
    const api = client(memberContext.request, instance.url);
    await api.web.login({ username: member.username, password, captcha_id: '', captcha_answer: '' });
    const user = await memberContext.newPage();
    const connected = user.waitForResponse(response => new URL(response.url()).pathname === operations.events.path && response.status() === 200);
    await user.goto(instance.url);
    expect((await connected).headers()['content-type']).toContain('text/event-stream');
    const bell = user.getByRole('button', { name: '平台公告', exact: true });
    await expect(bell).toBeVisible();
    await expect(bell).not.toContainText('1');
    // No page reload, navigation or focus change occurs between publication and this assertion.
    const notice = await admin.web.createAnnouncement({ title: '实时验收公告', content: '发布后立即收到的站内通知',
      format: 'markdown', type: 'info', note: '', status: 'published', publish_at: Math.floor(Date.now() / 1000) - 1,
      ends_at: 0, notify_mode: 'silent', audience: 'selected', recipient_ids: [member.id] });
    await expect(bell).toContainText('2', { timeout: 10_000 });
    await bell.click();
    const inbox = user.getByRole('dialog', { name: '平台公告', exact: true });
    await expect(inbox.getByRole('button').filter({ hasText: '实时验收公告' })).toBeVisible();
    await inbox.getByRole('tab', { name: '通知', exact: true }).click();
    await expect(inbox.getByText('1 条未读通知', { exact: true })).toBeVisible();
    await inbox.getByRole('button').filter({ hasText: '实时验收公告' }).click();
    await expect(inbox.getByText('0 条未读通知', { exact: true })).toBeVisible();
    await expect(inbox.getByRole('button').filter({ hasText: '实时验收公告' })).toContainText('已读');
    await evidence(user, info, '实时通知已读');
    await user.reload();
    await user.getByRole('button', { name: '平台公告', exact: true }).click();
    const reopened = user.getByRole('dialog', { name: '平台公告', exact: true });
    await reopened.getByRole('tab', { name: '通知', exact: true }).click();
    await expect(reopened.getByText('0 条未读通知', { exact: true })).toBeVisible();
    const saved = await api.web.inbox();
    expect(saved.items.find(item => item.source_id === notice.id)?.read_at).toBeGreaterThan(0);
    await user.keyboard.press('Escape');
    await user.goto(`${instance.url}/users`);
    await expect(user.getByRole('alert')).toContainText('没有访问权限');
    await expect(api.web.users('', 1)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(user.getByText('没有访问权限', { exact: true })).toBeVisible();
    await expect(user.getByRole('button', { name: '新增用户', exact: true })).toHaveCount(0);
    await evidence(user, info, '权限拒绝403');
    await user.getByRole('button', { name: '返回工作台', exact: true }).click();
    await expect(user.getByRole('button', { name: '平台公告', exact: true })).toBeVisible();
  } finally { await memberContext.close(); }
});

test('XLSX import results, file export, column preferences and saved avatar survive reload', async ({ page, instance }, info) => {
  await install(client(page.request, instance.url), instance.token, instance.url);
  const api = client(page.request, instance.url, 'administrator');
  await api.bootstrap();
  await page.goto(`${instance.url}/admin/users`);
  const templateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载导入模板', exact: true }).click();
  const template = await downloaded(templateDownload, 'users-import-template.xlsx');
  expect(workbookText(template)).toContain('username');
  expect(workbookText(template)).toContain('password');
  const payload = { name: 'members.xlsx', mimeType: xlsxMime, buffer: filledTemplate(template) };
  async function importWorkbook() {
    await page.getByRole('button', { name: '导入用户', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '导入用户', exact: true });
    await dialog.getByLabel('选择 XLSX 文件', { exact: true }).setInputFiles(payload);
    await dialog.getByRole('button', { name: '开始导入', exact: true }).click();
    return page.getByRole('dialog', { name: '导入结果', exact: true });
  }
  const imported = await importWorkbook();
  await expect(imported).toContainText('成功导入 1 位用户');
  await imported.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'imported.member', exact: true })).toBeVisible();
  const duplicate = await importWorkbook();
  await expect(duplicate).toContainText('成功导入 0 位用户');
  await expect(duplicate.getByRole('alert')).toContainText('1 行导入失败');
  await expect(duplicate.getByRole('listitem')).toHaveText(/^2: .+/);
  await evidence(page, info, '用户XLSX导入结果');
  await duplicate.getByRole('button', { name: '关闭', exact: true }).click();
  expect((await api.web.users('imported.member', 1)).total).toBe(1);

  await page.getByRole('button', { name: '列设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '手机号', exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('columnheader', { name: '手机号', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('cell', { name: 'imported.member', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '手机号', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '列设置', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '手机号', exact: true })).not.toBeChecked();
  await page.keyboard.press('Escape');

  await navigate(page, '文件管理');
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  const upload = page.getByRole('dialog', { name: '上传文件', exact: true });
  await upload.getByLabel('选择文件', { exact: true }).setInputFiles({ name: 'acceptance-export.txt', mimeType: 'text/plain', buffer: Buffer.from('real exported file metadata') });
  await upload.getByRole('button', { name: '开始上传', exact: true }).click();
  await expect(upload).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole('cell').filter({ hasText: 'acceptance-export.txt' })).toBeVisible();
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出文件', exact: true }).click();
  expect(workbookText(await downloaded(exported, 'files.xlsx'))).toContain('acceptance-export.txt');
  await page.getByRole('button', { name: '列设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '上传时间', exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('cell').filter({ hasText: 'acceptance-export.txt' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '上传时间', exact: true })).toHaveCount(0);
  await evidence(page, info, '文件导出与列设置');

  await page.goto(`${instance.url}/admin/account`);
  await page.getByRole('button', { name: '上传头像', exact: true }).click();
  const avatar = page.getByRole('dialog', { name: '上传头像', exact: true });
  await avatar.getByLabel('选择文件', { exact: true }).setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: await readFile('assets/brand/icon-64.png') });
  await avatar.getByRole('button', { name: '开始上传', exact: true }).click();
  await expect(avatar).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole('region', { name: '个人资料', exact: true }).getByRole('status')).toHaveText('头像已上传，保存后生效');
  await page.getByLabel('昵称', { exact: true }).fill('验收管理员');
  await page.getByRole('button', { name: '保存个人资料', exact: true }).click();
  await expect(page.getByText('个人资料已保存', { exact: true })).toBeVisible();
  const profile = await api.web.accountProfile();
  expect(profile.avatar_url).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('验收管理员');
  const image = page.getByRole('region', { name: '个人资料', exact: true }).getByRole('img', { name: '当前头像', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  const saved = await api.web.accountProfile();
  expect(saved.avatar_url).toBeTruthy();
  // Signed grants may rotate on reload; the referenced avatar file must stay the same.
  expect(new URL(saved.avatar_url!, instance.url).pathname).toBe(new URL(profile.avatar_url!, instance.url).pathname);
  await evidence(page, info, '头像保存重载');
});

test('scheduled execution, persisted enablement, real admin charts and Scalar contract reference', async ({ page, instance }, info) => {
  await install(client(page.request, instance.url), instance.token, instance.url);
  const api = client(page.request, instance.url, 'administrator');
  await api.bootstrap();
  await expect.poll(async () => (await api.web.listTasks()).items.some(task => task.name === 'files.cleanup')).toBe(true);
  await page.goto(`${instance.url}/admin/tasks`);
  if (info.project.name === 'mobile') await page.getByRole('button', { name: '打开导航', exact: true }).click();
  const sidebar = page.locator('.sidebar');
  // The sidebar renders the persisted section tree: the tasks entry sits exactly
  // where the menu console keeps it, keyed by its node id.
  const config = await api.web.menuConfig();
  const labelOf = (routeId: string) => nodeDisplayLabel(pageNode(config, routeId) ?? { label: '', id: routeId, route_id: routeId });
  const tasksId = pageNode(config, 'tasks')!.id;
  await expect(sidebar.locator(`[data-nav-node="${tasksId}"]`)).toBeVisible();
  await expect(sidebar.getByRole('button', { name: labelOf('tasks'), exact: true })).toBeVisible();
  for (const route of ['menus', 'dictionaries']) {
    await expect(sidebar.getByRole('button', { name: labelOf(route), exact: true })).toBeVisible();
  }
  const navigationDirectory = `build/acceptance/navigation-primary/${info.project.name}`;
  await mkdir(navigationDirectory, { recursive: true });
  await page.screenshot({ path: `${navigationDirectory}/sidebar.png`, animations: 'disabled' });
  if (info.project.name === 'mobile') await sidebar.getByRole('button', { name: labelOf('tasks'), exact: true }).click();
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'files.cleanup', exact: true }) });
  const enabled = row.getByRole('switch', { name: '启用 files.cleanup', exact: true });
  await expect(enabled).toBeChecked();
  await enabled.click();
  await expect(enabled).not.toBeChecked();
  await expect.poll(async () => (await api.web.listTasks()).items.find(task => task.name === 'files.cleanup')?.enabled).toBe(false);
  const before = (await api.web.listTasks()).items.find(task => task.name === 'files.cleanup')!;
  await row.getByRole('button', { name: '立即执行', exact: true }).click();
  await expect(page.getByText('已触发立即执行', { exact: true })).toBeVisible();
  await expect.poll(async () => (await api.web.listTasks()).items.find(task => task.name === 'files.cleanup')?.run_count).toBeGreaterThan(before.run_count);
  await instance.restart();
  await page.reload();
  await expect(enabled).not.toBeChecked();
  await expect(row).toContainText('正常');
  await enabled.click();
  await expect(enabled).toBeChecked();
  await expect.poll(async () => (await api.web.listTasks()).items.find(task => task.name === 'files.cleanup')?.enabled).toBe(true);
  await instance.restart();
  await page.reload();
  await expect(enabled).toBeChecked();
  const taskTable = page.getByRole('table');
  const taskScroll = taskTable.locator('..');
  await taskScroll.evaluate(element => { element.scrollLeft = 0; });
  await evidence(page, info, '任务执行与启停持久化');
  if (info.project.name === 'mobile') {
    expect(await taskScroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await taskScroll.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    expect(await taskScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect(row.getByRole('button', { name: '立即执行', exact: true })).toBeInViewport();
    await evidence(page, info, '任务操作');
  }

  await page.goto(`${instance.url}/admin`);
  const activity = page.getByRole('region', { name: '近 7 日平台活动', exact: true });
  await expect(activity).toBeVisible();
  const chart = activity.locator('.recharts-wrapper');
  await expect(chart).toBeVisible();
  await expect(chart.locator('svg.recharts-surface')).toBeVisible();
  expect((await api.web.adminDashboard()).activity_7d.some(day => day.count > 0)).toBe(true);
  await evidence(page, info, '管理端活动图表');

  const contract = page.waitForResponse(response => new URL(response.url()).pathname === '/openapi.json' && response.status() === 200);
  await page.goto(`${instance.url}/admin/api-docs`);
  const document = await (await contract).json();
  expect(document.openapi).toBe('3.1.0');
  expect(document.paths[operations.listTasks.path]).toBeDefined();
  await expect(page.getByRole('heading', { name: 'API 文档', exact: true })).toBeVisible();
  const reference = page.locator('.api-reference');
  await expect(reference).toBeVisible({ timeout: 30_000 });
  const swagger = reference.locator('.swagger-ui');
  await expect(swagger).toBeVisible({ timeout: 30_000 });
  // Swagger UI embeds the OAS badge inside h1.info .title, so match the title text itself.
  await expect(swagger.locator('.info .title')).toContainText(document.info.title);
  await evidence(page, info, 'Swagger接口文档', false);
});
