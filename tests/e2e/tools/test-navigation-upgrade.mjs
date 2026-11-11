// Author: yunnuo <ymz@ebox.vip>
// Description: Navigation upgrade drill: boot the pre-redesign binary, seed a
// legacy workspace (roles, members, menu overrides), then boot the current
// build on the same data directory and prove the one-time conversion keeps
// every operator fact while materializing explicit authorizations.
// Usage: node tests/e2e/tools/test-navigation-upgrade.mjs [oldBinary] [newBinary]
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const oldBinary = process.argv[2] ?? 'build/menu-redesign-before.Pve2Gz/server';
const newBinary = process.argv[3] ?? 'build/bin/server';
const password = 'test-password-strong';
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

async function freePort() {
  const allocator = createServer();
  await new Promise(resolve => allocator.listen(0, '127.0.0.1', resolve));
  const port = allocator.address().port;
  await new Promise(resolve => allocator.close(resolve));
  return port;
}

function start(binary, port, directory) {
  const child = spawn(binary, ['--listen', `127.0.0.1:${port}`, '--data-dir', directory, '--api-docs=true'], {
    stdio: ['ignore', 'ignore', openSync('/tmp/navigation-upgrade-server.log', 'a')],
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('APP_'))),
  });
  return child;
}

async function waitLive(port) {
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`);
      if (response.status === 200) return;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server on ${port} never became live`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

async function waitReady(port) {
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health/ready`);
      if (response.status === 200) return;
    } catch { /* restarting */ }
    if (Date.now() > deadline) throw new Error(`server on ${port} never became ready`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

function jar(jarRef) {
  return async (input, init = {}) => {
    const response = await fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers ?? {}).entries()), ...(jarRef.cookie ? { cookie: jarRef.cookie } : {}) } });
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length) jarRef.cookie = cookies.map(entry => entry.split(';')[0]).join('; ');
    return response;
  };
}

async function captchaLogin(fetcher, port, username, password_, admin = false) {
  const base = `http://127.0.0.1:${port}/api/v1`;
  const captcha = await (await fetcher(`${base}/${admin ? 'admin/' : ''}auth/captcha`)).json();
  const image = captcha.data.image;
  const answer = [...Buffer.from(image.split(',')[1], 'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match => match[1]).join('');
  const login = await fetcher(`${base}/${admin ? 'admin/' : ''}auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: password_, captcha_id: captcha.data.id, captcha_answer: answer }) });
  const payload = await login.json();
  if (login.status !== 200) throw new Error(`login ${username}: ${login.status} ${JSON.stringify(payload)}`);
  return payload.data;
}

async function api(fetcher, port, method, path, token, body, csrf) {
  const response = await fetcher(`http://127.0.0.1:${port}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-bootstrap-token': token } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, payload: text ? JSON.parse(text) : null };
}

const directory = await mkdtemp(join(tmpdir(), 'unicore-nav-upgrade-'));
let process_ = null;
try {
  // Phase 1: the pre-redesign binary seeds a realistic legacy workspace.
  const oldPort = await freePort();
  process_ = start(oldBinary, oldPort, directory);
  await waitLive(oldPort);
  const oldJar = {};
  const oldFetch = jar(oldJar);
  const token = (await readFile(join(directory, 'bootstrap.token'), 'utf8')).trim();
  const installed = await api(oldFetch, oldPort, 'POST', '/install/complete', token, { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: `http://127.0.0.1:${oldPort}`, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: password });
  check('legacy install', installed.status === 200);
  const adminSession = await captchaLogin(oldFetch, oldPort, 'admin', password, true);
  check('legacy admin login', !!adminSession.csrf_token);

  // A custom role plus member, and two legacy menu overrides: a renamed and
  // hidden notes page plus an operator link. The legacy table stores operator
  // overrides only, so the notes row is authored here instead of pre-existing.
  const role = await api(oldFetch, oldPort, 'POST', '/admin/roles', undefined, { name: '记录员', permissions: ['notes:access', 'notes:create'] }, adminSession.csrf_token);
  check('legacy role create', role.status === 200, JSON.stringify(role.payload?.message ?? ''));
  const member = await api(oldFetch, oldPort, 'POST', '/admin/users', undefined, { username: 'member', email: 'member@example.test', password, role: role.payload.data.id }, adminSession.csrf_token);
  check('legacy member create', member.status === 200);
  const legacyMenus = await api(oldFetch, oldPort, 'GET', '/admin/menus', undefined, undefined, adminSession.csrf_token);
  check('legacy menu list', legacyMenus.status === 200 && Array.isArray(legacyMenus.payload.data.items));
  // The legacy contract carries no version field: the strict legacy decoder
  // refuses unknown keys, so the override save posts the bare items array.
  const items = legacyMenus.payload.data.items.filter(entry => entry.menu_key !== 'notes');
  items.push({ menu_key: 'notes', label: '随手记', group_key: '一级导航', sort: 100, visible: false, type: 'page' });
  items.push({ menu_key: 'link:drill', label: '演练外链', group_key: '一级导航', sort: 900, visible: true, type: 'link', url: 'https://example.com/drill' });
  const legacySave = await api(oldFetch, oldPort, 'PUT', '/admin/menus', undefined, { items }, adminSession.csrf_token);
  check('legacy menu override save', legacySave.status === 200, JSON.stringify(legacySave.payload?.message ?? ''));

  // A note proves the member's data survives alongside the grants; the legacy
  // contract still requires the attachment_ids field on note creation.
  const memberSession = await captchaLogin(oldFetch, oldPort, 'member', password, false);
  const note = await api(oldFetch, oldPort, 'POST', '/notes', undefined, { title: '升级前的笔记', body: 'body', status: 'open', attachment_ids: [] }, memberSession.csrf_token);
  check('legacy member note', note.status === 200, JSON.stringify(note.payload?.message ?? ''));
  const legacyList = await api(oldFetch, oldPort, 'GET', '/notes?page=1', undefined, undefined, memberSession.csrf_token);
  check('legacy member listNotes (pre-upgrade capability)', legacyList.status === 200);

  process_.kill('SIGTERM');
  await new Promise(resolve => process_.once('exit', resolve));
  process_ = null;

  // Phase 2: the current binary takes over, runs migrations and converts once.
  const newPort = await freePort();
  process_ = start(newBinary, newPort, directory);
  await waitLive(newPort);
  await waitReady(newPort);
  const newJar = {};
  const newFetch = jar(newJar);
  const newAdmin = await captchaLogin(newFetch, newPort, 'admin', password, true);

  const menus = await api(newFetch, newPort, 'GET', '/admin/menus', undefined, undefined, newAdmin.csrf_token);
  check('converted menu list', menus.status === 200);
  const menu = menus.payload.data;
  check('both surfaces seeded', ['user', 'administrator'].every(surface => menu.sections.some(section => section.surface === surface)), `sections=${menu.sections.length}`);
  const notesNode = menu.nodes.find(node => node.type === 'page' && node.route_id === 'notes' && node.section_id === 'user:business');
  check('notes page node exists', !!notesNode);
  // Legacy overrides describe the user workspace: they must merge onto the
  // user-surface node, never onto the same-id administrator node.
  check('renamed label survives', notesNode?.label === '随手记', `label=${notesNode?.label}`);
  check('hidden page survives', notesNode?.visible === false);
  const adminNotesNode = menu.nodes.find(node => node.type === 'page' && node.route_id === 'notes' && node.section_id === 'admin:business');
  check('administrator node untouched', adminNotesNode?.visible === true && !adminNotesNode?.label, `visible=${adminNotesNode?.visible} label=${adminNotesNode?.label}`);
  const linkNode = menu.nodes.find(node => node.type === 'link' && node.url === 'https://example.com/drill');
  check('operator link survives', !!linkNode);
  check('version advanced', menu.version >= 1, `version=${menu.version}`);

  const roles = await api(newFetch, newPort, 'GET', '/admin/roles', undefined, undefined, newAdmin.csrf_token);
  const converted = roles.payload.data.items.find(item => item.name === '记录员');
  check('role survives', !!converted);
  check('legacy role menu grants materialized', (converted?.menu_ids ?? []).length > 0, `menu_ids=${converted?.menu_ids?.length}`);
  check('legacy role API grants materialized', converted?.operation_ids?.includes('listNotes') === true, `operation_ids=${JSON.stringify(converted?.operation_ids)}`);
  const builtin = roles.payload.data.items.find(item => item.id === 'user');
  check('builtin role materialized', (builtin?.menu_ids ?? []).length > 0 && builtin?.operation_ids?.includes('listNotes') === true);

  // The member keeps every pre-upgrade capability without any re-granting.
  const newMember = await captchaLogin(newFetch, newPort, 'member', password, false);
  const bootstrap = (await (await newFetch(`http://127.0.0.1:${newPort}/api/v1/bootstrap`)).json()).data;
  check('member keeps permission point', bootstrap.current_user.permissions.includes('notes:access'));
  check('member navigation projected', (bootstrap.navigation?.nodes ?? []).length > 0);
  const memberList = await api(newFetch, newPort, 'GET', '/notes?page=1', undefined, undefined, newMember.csrf_token);
  check('member listNotes after upgrade', memberList.status === 200);
  check('member note survives', memberList.payload.data.items.some(item => item.title === '升级前的笔记'));
  // The saved note's API grant covers creation as well.
  const memberCreate = await api(newFetch, newPort, 'POST', '/notes', undefined, { title: '升级后的笔记', body: '', status: 'open' }, newMember.csrf_token);
  check('member createNote after upgrade', memberCreate.status === 200);

  // New operations stay denied until explicitly granted: the legacy role never
  // held files:access, so the file API must not open up after conversion.
  const memberFiles = await api(newFetch, newPort, 'GET', '/files?page=1', undefined, undefined, newMember.csrf_token);
  check('ungranted API stays closed', memberFiles.status === 403, `status=${memberFiles.status}`);

  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nupgrade drill passed');
  process.exitCode = failures.length ? 1 : 0;
} catch (error) {
  console.error('DRILL ERROR', error);
  process.exitCode = 1;
} finally {
  if (process_) process_.kill('SIGTERM');
  await rm(directory, { recursive: true, force: true }).catch(() => undefined);
}
