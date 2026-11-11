// Author: yunnuo <ymz@ebox.vip>
// Description: Framework menu/action/API grants exercised through the demo consumer.
import { test, expect, installPlatform, sdkClient, loginClient, workspaceLogin, adminLogin, memberPassword } from './fixtures';

test('menu, action and API revocations remain independent across role edits', async ({ page, instance }) => {
 test.setTimeout(90000);
 await installPlatform(instance);
 const owner=sdkClient(instance.url);await loginClient(owner,'admin','administrator-password-strong');
 const points=['notes:access','notes:create'];
 const role=await owner.createRole({name:'RBAC consumer',permissions:points,menu_ids:['overview','notes'],action_ids:[],operation_ids:['listNotes','createNote']});
 const member=await owner.createUser({username:'rbac-consumer',email:'rbac@example.test',password:memberPassword,role_ids:[role.id]});
 await workspaceLogin(page,instance.url,member.username);
 await page.goto(`${instance.url}/notes`);
 await expect(page.getByRole('heading',{name:/^我的笔记/})).toBeVisible();
 // Explicit empty buttons remain empty even when the API is callable.
 await expect(page.getByRole('button',{name:'新建笔记'})).toHaveCount(0);
 const boot=(await (await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
 const input={title:'Independent API grant',body:'Demo consumer',status:'open',attachment_ids:[]};
 expect((await page.request.post(`${instance.url}/api/v1/notes`,{headers:{'X-CSRF-Token':boot.csrf_token},data:input})).status()).toBe(200);
 expect((await page.request.post(`${instance.url}/api/v1/notes`,{data:input})).status()).toBe(403);
 // Menu removal blocks direct navigation. An omitted action set stays empty.
 let saved=await owner.updateRole(role.id,{name:'RBAC consumer',permissions:points,menu_ids:['overview'],operation_ids:['listNotes']});
 expect(saved.action_ids).toEqual([]);
 // A subsequent rename/widening must not resurrect createNote.
 saved=await owner.updateRole(role.id,{name:'RBAC consumer renamed',permissions:[...points,'notes:delete']});
 expect(saved.operation_ids).toEqual(['listNotes']);
 await workspaceLogin(page,instance.url,member.username);
 await page.goto(`${instance.url}/notes`);
 await expect(page.getByText('没有访问权限',{exact:true})).toBeVisible();
 const refreshed=(await (await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
 expect((await page.request.post(`${instance.url}/api/v1/notes`,{headers:{'X-CSRF-Token':refreshed.csrf_token},data:input})).status()).toBe(403);
});

test('a member role granted the full notes page publishes notes through the UI', async ({ page, instance }) => {
 test.setTimeout(90000);
 await installPlatform(instance);
 const owner=sdkClient(instance.url);await loginClient(owner,'admin','administrator-password-strong');
 // The role-editor payload shape: checking the notes page grants the menu, its
 // buttons and API operations, and derives the implied permission points.
 const role=await owner.createRole({
  name:'笔记运营',
  permissions:['notes:access','notes:create','notes:update','notes:delete'],
  menu_ids:['overview','notes'],
  action_ids:['op:listNotes','op:createNote','op:updateNote','op:deleteNote'],
  operation_ids:['listNotes','createNote','updateNote','deleteNote'],
 });
 const member=await owner.createUser({username:'notes-publisher',email:'publisher@example.test',password:memberPassword,role_ids:[role.id]});
 await workspaceLogin(page,instance.url,member.username);
 await page.goto(`${instance.url}/notes`);
 await expect(page.getByRole('heading',{name:/^我的笔记/})).toBeVisible();
 // The create entry renders for the granted member and the whole flow works.
 const create=page.getByRole('button',{name:'新建笔记'});
 await expect(create).toBeVisible();
 await create.click();
 await page.getByLabel('标题').fill('成员的第一篇笔记');
 await page.getByRole('button',{name:'保存笔记'}).click();
 await expect(page.getByText('笔记已创建')).toBeVisible();
 await expect(page.getByText('成员的第一篇笔记')).toBeVisible();
});

test('an administrator grants the notes page through the role editor UI and the member publishes from the page', async ({ page, instance }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  // The whole grant happens in the real editor: checking the notes page
  // cascades its buttons, API operations and implied points into one save.
  await page.goto(`${instance.url}/admin/roles`);
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '新建角色', exact: true });
  await editor.getByLabel('角色名称', { exact: true }).fill('笔记运营');
  await editor.getByRole('checkbox', { name: '我的笔记', exact: true }).check();
  await editor.getByRole('button', { name: '展开或收起 我的笔记', exact: true }).click();
  await editor.getByRole('checkbox', { name: '创建笔记', exact: true }).check();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  // The member account is created in the user console; the role chip group
  // swaps the builtin default for the new role.
  await page.goto(`${instance.url}/admin/users`);
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  const userDialog = page.getByRole('dialog', { name: '新增用户', exact: true });
  await userDialog.getByLabel('账号', { exact: true }).fill('ui-publisher');
  await userDialog.getByLabel('邮箱', { exact: true }).fill('ui-publisher@example.test');
  await userDialog.getByLabel('初始密码', { exact: true }).fill(memberPassword);
  await userDialog.getByRole('checkbox', { name: 'user', exact: true }).uncheck();
  await userDialog.getByRole('checkbox', { name: '笔记运营', exact: true }).check();
  await userDialog.getByRole('button', { name: '创建用户', exact: true }).click();
  await expect(userDialog).toHaveCount(0);
  // The administrator session rides the same browser context: drop it so the
  // member login form renders instead of the already-authenticated workspace.
  await page.context().clearCookies();
  // The member really publishes a note through the page, not a mocked API.
  await workspaceLogin(page, instance.url, 'ui-publisher');
  await page.goto(`${instance.url}/notes`);
  await expect(page.getByRole('heading', { name: /^我的笔记/ })).toBeVisible();
  await page.getByRole('button', { name: '新建笔记' }).click();
  await page.getByLabel('标题').fill('界面授权发布');
  await page.getByRole('button', { name: '保存笔记' }).click();
  await expect(page.getByText('笔记已创建')).toBeVisible();
  await expect(page.getByText('界面授权发布')).toBeVisible();
  const { mkdir } = await import('node:fs/promises');
  await mkdir('build/acceptance/permissions', { recursive: true });
  await page.screenshot({ path: `build/acceptance/permissions/${info.project.name}-member-publishes-note.png`, fullPage: true });
});

test('a legacy role row with complete grants but empty permission points heals at session resolution', async ({ page, instance }, info) => {
  test.setTimeout(120000);
  await installPlatform(instance);
  // The old tab-editor row shape: menu/action/operation grant rows complete,
  // unicore_role_permissions empty. WAL journaling plus busy_timeout make the
  // concurrent write safe while the server keeps serving; sessions re-resolve
  // from the database on every request, so the injection needs no restart.
  const statements = [
    "INSERT INTO unicore_roles(id,name,realm,data_scope) VALUES('legacy-role','旧版运营','user','self')",
    "INSERT INTO unicore_role_authorizations(role_id,initialized) VALUES('legacy-role',1)",
    "INSERT INTO unicore_role_menus(role_id,menu_id) VALUES('legacy-role','overview'),('legacy-role','notes')",
    "INSERT INTO unicore_role_actions(role_id,action_id) VALUES('legacy-role','op:listNotes'),('legacy-role','op:createNote')",
    "INSERT INTO unicore_role_operations(role_id,operation_id) VALUES('legacy-role','listNotes'),('legacy-role','createNote')",
  ];
  const database = `${instance.directory}/unicore.db`;
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  for (const statement of statements) await run('sqlite3', ['-cmd', '.timeout 5000', database, statement]);
  // The member joins through the real account API; role assignment only needs
  // the role row to exist, exactly like a legacy instance's data.
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', 'administrator-password-strong');
  await admin.web!.createUser({ username: 'legacy-member', email: 'legacy-member@example.test', password: memberPassword, role: 'legacy-role' });
  // Login resolves the effective permission union server-side; the page then
  // really publishes without any re-save of the role.
  await workspaceLogin(page, instance.url, 'legacy-member');
  await page.goto(`${instance.url}/notes`);
  await expect(page.getByRole('heading', { name: /^我的笔记/ })).toBeVisible();
  await page.getByRole('button', { name: '新建笔记' }).click();
  await page.getByLabel('标题').fill('存量角色自愈发布');
  await page.getByRole('button', { name: '保存笔记' }).click();
  await expect(page.getByText('笔记已创建')).toBeVisible();
  await expect(page.getByText('存量角色自愈发布')).toBeVisible();
  const { mkdir } = await import('node:fs/promises');
  await mkdir('build/acceptance/permissions', { recursive: true });
  await page.screenshot({ path: `build/acceptance/permissions/${info.project.name}-legacy-role-selfheal.png`, fullPage: true });
});
