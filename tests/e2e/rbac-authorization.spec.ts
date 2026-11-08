// Author: yunnuo <ymz@ebox.vip>
// Description: Framework menu/action/API grants exercised through the demo consumer.
import { test, expect, installPlatform, sdkClient, loginClient, workspaceLogin, memberPassword } from './fixtures';

test('menu, action and API revocations remain independent across role edits', async ({ page, instance }) => {
 test.setTimeout(90000);
 await installPlatform(instance);
 const owner=sdkClient(instance.url);await loginClient(owner,'admin','administrator-password-strong');
 const points=['notes:access','notes:create'];
 const role=await owner.createRole({name:'RBAC consumer',permissions:points,menu_ids:['user:overview','user:notes'],action_ids:[],operation_ids:['listNotes','createNote']});
 const member=await owner.createUser({username:'rbac-consumer',email:'rbac@example.test',password:memberPassword,role_ids:[role.id]});
 await workspaceLogin(page,instance.url,member.username);
 await page.goto(`${instance.url}/notes`);
 await expect(page.getByRole('heading',{name:/^我的笔记/})).toBeVisible();
 await expect(page.getByRole('button',{name:'新建笔记'})).toHaveCount(0);
 const boot=(await (await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
 const input={title:'Independent API grant',body:'Demo consumer',status:'open',attachment_ids:[]};
 expect((await page.request.post(`${instance.url}/api/v1/notes`,{headers:{'X-CSRF-Token':boot.csrf_token},data:input})).status()).toBe(200);
 expect((await page.request.post(`${instance.url}/api/v1/notes`,{data:input})).status()).toBe(403);
 // Menu removal blocks direct navigation. An omitted action set stays empty.
 let saved=await owner.updateRole(role.id,{name:'RBAC consumer',permissions:points,menu_ids:['user:overview'],operation_ids:['listNotes']});
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
