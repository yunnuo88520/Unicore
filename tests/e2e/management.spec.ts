// Author: yunnuo <ymz@ebox.vip>
// Description: Dialog accessibility, fixed navigation, independent accounts and functional avatar actions.
import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect, navigate, sdkClient, loginClient, nodeDisplayLabel, pageNode } from './fixtures';

async function login(page:Page, username:string, password:string){
 await page.getByLabel('账号或邮箱').fill(username);await page.getByLabel('密码',{exact:true}).fill(password);
 const image=await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');
 const answer=[...Buffer.from(image!.split(',')[1],'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(m=>m[1]).join('');
 await page.getByLabel('图形验证码',{exact:true}).fill(answer);await page.getByRole('button',{name:'登录工作空间',exact:true}).click();
}

test('management groups, modal creation, independent logins and avatar password change',async({page,browser,instance},info)=>{
 test.setTimeout(60000);
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 await page.goto(`${instance.url}/admin`);
 const nav=async(name:string)=>navigate(page,name);
 if(info.project.name==='mobile')await page.getByRole('button',{name:'打开导航',exact:true}).click();
 // The persisted section tree renders expanded; nested pages indent under their directory.
 const admin=sdkClient(instance.url,'administrator');
 await loginClient(admin,'admin','test-password-strong');
 const config=await admin.web!.menuConfig();
 const labelOf=(routeId:string)=>nodeDisplayLabel(pageNode(config,routeId)??{label:'',id:routeId,route_id:routeId});
 const usersNode=pageNode(config,'users')!;
 const parentNode=usersNode.parent_id?config.nodes.find(node=>node.id===usersNode.parent_id):undefined;
 const sidebar=page.locator('.sidebar');
 const usersButton=sidebar.getByRole('button',{name:labelOf('users'),exact:true});
 if(parentNode){
  // Directories start collapsed; expanding the parent reveals the child row.
  const parentButton=sidebar.getByRole('button',{name:nodeDisplayLabel(parentNode),exact:true});
  await parentButton.click();
  await expect(usersButton).toBeVisible();
  const parentIcon=await parentButton.locator('svg').first().boundingBox();
  const childIcon=await usersButton.locator('svg').boundingBox();
  expect(childIcon!.x).toBeGreaterThan(parentIcon!.x+12);
 }
 expect(await usersButton.locator('svg').count()).toBe(1);
 await expect(page.getByRole('button',{name:'平台仪表盘',exact:true})).toHaveCount(0);
 const directory=`build/acceptance/management/${info.project.name}`;await mkdir(directory,{recursive:true});
 if(info.project.name==='chromium'){
  await page.setViewportSize({width:1440,height:720});
  const utilities=page.locator('.sidebar .sidebar-utilities');await utilities.scrollIntoViewIfNeeded();
  await expect(utilities).toBeInViewport();
  const before=await page.locator('.sidebar .sidebar-utilities').boundingBox();await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  expect((await page.locator('.sidebar .sidebar-utilities').boundingBox())!.y).toBe(before!.y);
  await page.screenshot({path:`${directory}/fixed-sidebar-720.png`});await page.evaluate(()=>window.scrollTo(0,0));
 }
 await usersButton.click();
 const add=page.getByRole('button',{name:'新增用户',exact:true});await add.click();
 const dialog=page.getByRole('dialog',{name:'新增用户',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByLabel('账号',{exact:true})).toBeFocused();
 await dialog.getByLabel('账号',{exact:true}).fill('discarded');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(add).toBeFocused();
 await add.click();await expect(dialog.getByLabel('账号',{exact:true})).toHaveValue('');
 await dialog.getByLabel('账号',{exact:true}).fill('sharedname');await dialog.getByLabel('邮箱',{exact:true}).fill('shared@example.test');await dialog.getByLabel('初始密码',{exact:true}).fill('member-password-strong');
 await page.screenshot({path:`${directory}/new-user-dialog.png`});
 await dialog.getByRole('button',{name:'创建用户',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('cell',{name:'sharedname',exact:true})).toBeVisible();
 // The management alias shares global account uniqueness with the user API.
 await expect(admin.web!.createAdministrator({username:'sharedname',email:'shared@example.test',password:'administrator-password-strong',role:'super_admin'})).rejects.toMatchObject({code:'ACCOUNT_EXISTS'});
 await nav(labelOf('mail'));await expect(page.getByRole('tab')).toHaveCount(0);await expect(page.getByRole('button',{name:'发送测试',exact:true})).toBeVisible();await expect(page.getByText('投递记录',{exact:true})).toHaveCount(0);
 await nav(labelOf('logs'));await expect(page.getByRole('tab',{name:'操作日志',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'新增用户',exact:true}).first()).toBeVisible();
 if(process.env.FEATURE_UPDATER!=='false' || process.env.FEATURE_LICENSE==='true') {
  await nav(labelOf('edition'));
  if(process.env.FEATURE_UPDATER!=='false')await expect(page.getByRole('heading',{name:'更新日志',exact:true})).toBeVisible();
  if(process.env.FEATURE_LICENSE==='true')await expect(page.getByText('待对接',{exact:true})).toBeVisible();
 }
 const memberContext=await browser.newContext({viewport:page.viewportSize()!,isMobile:info.project.name==='mobile',hasTouch:info.project.name==='mobile'});const member=await memberContext.newPage();await member.goto(`${instance.url}/login`);await login(member,'sharedname','administrator-password-strong');await expect(member.locator('main').getByRole('alert')).toContainText('账号或密码不正确');
 await login(member,'sharedname','member-password-strong');
 // Login completes asynchronously and navigates home; wait before opening notes.
 await expect(member.getByRole('heading',{name:'工作台概览'})).toBeVisible();
 await member.goto(`${instance.url}/notes`);await expect(member.getByRole('heading',{name:'我的笔记',exact:true})).toBeVisible();
 const adminBoot=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`,{headers:{}})).json()).data;
 const memberBoot=(await(await member.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
 expect(adminBoot.current_user.roles).toEqual(['super_admin']);expect(memberBoot.current_user.roles).toEqual(['user']);expect(adminBoot.current_user.id).not.toBe(memberBoot.current_user.id);
 expect((await member.request.post(`${instance.url}/api/v1/account/password`,{data:{current_password:'member-password-strong',password:'changed-member-password'}})).status()).toBe(403);
 await member.getByRole('button',{name:'账号菜单',exact:true}).click();await member.getByRole('menuitem',{name:'修改密码',exact:true}).click();
 const password=member.getByRole('dialog',{name:'修改密码',exact:true});await password.getByLabel('当前密码',{exact:true}).fill('wrong-password-strong');await password.getByLabel('新密码',{exact:true}).fill('changed-member-password');await password.getByLabel('确认新密码',{exact:true}).fill('mismatch-password-strong');await password.getByRole('button',{name:'保存新密码',exact:true}).click();await expect(password.getByRole('alert')).toContainText('两次新密码不一致');
 await password.getByLabel('确认新密码',{exact:true}).fill('changed-member-password');await password.getByRole('button',{name:'保存新密码',exact:true}).click();await expect(password.getByRole('alert')).toContainText('账号或密码不正确');
 await password.getByLabel('当前密码',{exact:true}).fill('member-password-strong');await member.screenshot({path:`${directory}/password-dialog.png`});await password.getByRole('button',{name:'保存新密码',exact:true}).click();
 await expect(member.getByRole('heading',{name:'登录 Unicore',exact:true})).toBeVisible();await expect(member.getByText('密码已更新，所有设备的旧会话已退出，请重新登录。',{exact:true})).toBeVisible();
 expect((await page.request.get(`${instance.url}/api/v1/admin/auth/session`,{headers:{}})).status()).toBe(200);
 await login(member,'sharedname','changed-member-password');
 await expect(member.getByRole('heading',{name:'工作台概览'})).toBeVisible();
 await member.goto(`${instance.url}/notes`);await expect(member.getByRole('heading',{name:'我的笔记',exact:true})).toBeVisible();
 await member.getByRole('button',{name:'账号菜单',exact:true}).click();await member.getByRole('menuitem',{name:'退出登录',exact:true}).click();await expect(member).toHaveURL(/\/home$/);await memberContext.close();
 await page.reload();await expect(page.getByRole('button',{name:'账号菜单',exact:true})).toBeVisible();
 await nav(labelOf('users'));
 for(const scheme of ['light','dark'] as const){await page.evaluate(value=>localStorage.setItem('unicore.preferences.v1',JSON.stringify({...JSON.parse(localStorage.getItem('unicore.preferences.v1')??'{}'),theme:value})),scheme);await page.reload();await page.screenshot({path:`${directory}/management-${scheme}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});

test('the live log console opens at the tail and pages history on scroll-up',async({page,instance})=>{
 test.setTimeout(60000);
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 // Every request logs a completion line: enough volume pushes the ring past
 // one page so the console has older history to page through.
 for(let i=0;i<220;i++)await page.request.get(`${instance.url}/api/v1/auth/policy`);
 await page.goto(`${instance.url}/admin`);
 await page.getByRole('button',{name:'实时日志'}).click();
 const log=page.getByRole('log',{name:'实时日志行'});
 await expect(log).toBeVisible();
 // The console opens on the newest page already stuck to the tail instead of
 // waiting for a manual jump.
 const indicator=log.getByText(/已省略 \d+ 条更早日志/);
 await expect(indicator).toBeVisible();
 await page.waitForTimeout(3000);
 const diag=await log.evaluate(node=>({arm:node.dataset.arm,fired:node.dataset.fired,cleared:node.dataset.cleared,stick:node.dataset.stick,scrolls:node.dataset.scrolls,d:node.scrollHeight-node.scrollTop-node.clientHeight,sh:node.scrollHeight,st:node.scrollTop}));
 console.log('STATE',JSON.stringify(diag));
 await expect.poll(async()=>log.evaluate(node=>node.scrollHeight-node.scrollTop-node.clientHeight),{timeout:10000}).toBeLessThan(48);
 // Scrolling to the top pulls the next history page and keeps the viewport
 // anchored instead of jumping.
 await log.evaluate(node=>{node.scrollTop=0;});
 // The ring of a fresh instance fits one page: scrolling up exhausts the
 // history and lands on the buffer-start notice with the earliest row shown.
 await expect(log.getByText('已到缓冲区起点',{exact:true})).toBeVisible({timeout:10000});
 await expect(log.getByText(/server started/)).toBeVisible();
 await page.getByRole('button',{name:'关闭对话框'}).click();
 await expect(page.getByRole('log')).toHaveCount(0);
});
