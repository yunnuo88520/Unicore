// Author: yunnuo <ymz@ebox.vip>
// Description: Two fixed roles across menus, direct routes, every management API and isolated client appearance.
import type { Page } from '@playwright/test';
import { operations } from '../../packages/contracts/src/operations.gen';
import { mkdir } from 'node:fs/promises';
import { test, expect } from './fixtures';

async function login(page: Page,url: string){
 await page.goto(url);await page.getByLabel('账号或邮箱').fill('member');await page.getByLabel('密码',{exact:true}).fill('test-password-strong');
 const image=await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');
 const answer=[...Buffer.from(image!.split(',')[1],'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match=>match[1]).join('');
 await page.getByLabel('图形验证码',{exact:true}).fill(answer);await page.getByRole('button',{name:'登录工作空间'}).click();await expect(page.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
}
test('fixed roles enforce menus, all management APIs and client-only appearance',async({page,browser,instance},info)=>{
 test.setTimeout(60000);
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 await page.goto(`${instance.url}/admin#roles`);await expect(page.getByRole('heading',{name:'角色权限',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'新增角色',exact:true})).toHaveCount(0);await expect(page.locator('.role-card')).toHaveCount(2);
 const boot=(await(await page.request.get(`${instance.url}/api/v1/bootstrap`,{headers:{"X-Unicore-Identity":"administrator"}})).json()).data;const headers={'X-Unicore-Identity':'administrator','X-CSRF-Token':boot.csrf_token};
 const roles=(await(await page.request.get(`${instance.url}/api/v1/admin/roles`,{headers})).json()).data;
 expect(roles.items.map((item:{id:string})=>item.id).sort()).toEqual(['super_admin','user']);
 const created=await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'member',email:'member@example.test',password:'test-password-strong',role:'user'}});expect(created.status()).toBe(200);const memberID=(await created.json()).data.id;
 expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'custom',email:'custom@example.test',password:'test-password-strong',role:'custom'}})).status()).toBe(400);
 expect((await page.request.patch(`${instance.url}/api/v1/admin/administrators/${boot.current_user.id}`,{headers,data:{role:'super_admin',status:'disabled'}})).status()).toBe(409);
 await page.reload();await expect(page.locator('.role-card').filter({hasText:'普通用户'})).toContainText('1 位用户');
 const directory=`build/acceptance/permissions/${info.project.name}`;await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/admin-fixed-roles.png`,fullPage:true});
 const contexts=[];
 try{
  const memberContext=await browser.newContext({viewport:page.viewportSize()!,isMobile:info.project.name==='mobile',hasTouch:info.project.name==='mobile',colorScheme:'light'});contexts.push(memberContext);
  const member=await memberContext.newPage();await login(member,instance.url);
  const metadata=(await(await member.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;expect(metadata.current_user.roles).toEqual(['user']);expect(metadata.current_user.permissions).toEqual([]);
  const memberHeaders={'X-CSRF-Token':metadata.csrf_token};
  for(const operation of Object.values(operations).filter(item=>item.path.startsWith('/api/v1/admin/'))){
   const path=operation.path.replace('{id}',memberID);
   const options={method:operation.method,...(operation.method==='GET'?{}:{data:{}})};
   expect((await instance.request.fetch(`${instance.url}${path}`,options)).status(),`anonymous ${operation.method} ${path}`).toBe(401);
   expect((await member.request.fetch(`${instance.url}${path}`,{...options,headers:memberHeaders})).status(),`member ${operation.method} ${path}`).toBe(403);
  }
  const managementReads:string[]=[];member.on('request',request=>{if(request.url().includes('/api/v1/admin/'))managementReads.push(request.url());});
  for(const route of ['users','administrators','roles','mail','logs']){await member.goto(`${instance.url}/#${route}`);await expect(member.getByText('没有访问权限',{exact:true})).toBeVisible();}
  expect((await member.request.get(`${instance.url}/admin`)).status()).toBe(200);
  await member.goto(`${instance.url}/#site?tab=mail`);
  if(info.project.name==='mobile')await member.getByRole('button',{name:'打开导航'}).click();
  for(const name of ['平台仪表盘','用户管理','角色权限','基础设置'])await expect(member.getByRole('button',{name,exact:true})).toHaveCount(0);
  await member.getByRole('button',{name:'外观设置',exact:true}).click();
  await expect(member.getByLabel('站点名称',{exact:true})).toHaveCount(0);await expect(member.getByRole('tab')).toHaveCount(0);await expect(member.getByText('仅当前客户端',{exact:true})).toBeVisible();
  const writes:string[]=[];member.on('request',request=>{if(request.method()!=='GET')writes.push(request.url());});
  await member.getByRole('button',{name:/深色.*柔和低光/}).click();await member.getByRole('button',{name:'保存设置',exact:true}).click();await expect(member.getByText('外观已保存到当前客户端',{exact:true})).toBeVisible();
  await expect(member.locator('html')).toHaveAttribute('data-theme','dark');await member.reload();await expect(member.locator('html')).toHaveAttribute('data-theme','dark');expect(writes).toEqual([]);
  expect(managementReads).toEqual([]);
  await member.screenshot({path:`${directory}/member-local-appearance.png`,fullPage:true});
  expect(await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const clean=await browser.newContext({viewport:page.viewportSize()!,colorScheme:'light'});contexts.push(clean);const other=await clean.newPage();await login(other,instance.url);await expect(other.locator('html')).toHaveAttribute('data-theme','light');
  const global=(await(await page.request.get(`${instance.url}/api/v1/admin/settings`,{headers})).json()).data;expect(global.items.some((item:{key:string})=>item.key==='appearance.theme')).toBe(false);
  expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'appearance.theme',value:'dark'}]}})).status()).toBe(400);
  expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'site.name',value:'管理员统一品牌'}]}})).status()).toBe(200);
  await member.reload();await expect(member).toHaveTitle('管理员统一品牌 · 工作空间');await expect(member.locator('html')).toHaveAttribute('data-theme','dark');
  // Realm conversion is rejected; administrators are created in their own table.
  expect((await page.request.patch(`${instance.url}/api/v1/admin/users/${memberID}`,{headers,data:{role:'super_admin',status:'active'}})).status()).toBe(400);
  expect((await member.request.get(`${instance.url}/api/v1/auth/session`)).status()).toBe(200);
  expect((await page.request.post(`${instance.url}/api/v1/admin/administrators`,{headers,data:{username:'member',email:'member@example.test',password:'administrator-password-strong',role:'super_admin'}})).status()).toBe(200);
  expect((await page.request.get(`${instance.url}/api/v1/admin/administrators`,{headers})).status()).toBe(200);
 }finally{for(const context of contexts)await context.close();}
});
