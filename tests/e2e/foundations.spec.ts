// Author: yunnuo <ymz@ebox.vip>
// Description: Real session isolation, contract field errors and offline documentation at PC/375px.
import type { Page } from '@playwright/test';
import { test, expect, installStandalone } from './fixtures';
import { operations } from '../../packages/contracts/src/operations.gen';
import { capture } from './visual';

async function login(page: Page, username: string) {
  await page.getByLabel('账号或邮箱').fill(username);
  await page.getByLabel('密码', {exact:true}).fill('test-password-strong');
  const image=await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');
  const answer=[...Buffer.from(image!.split(',')[1],'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match=>match[1]).join('');
  await page.getByLabel('图形验证码',{exact:true}).fill(answer);
  await page.getByRole('button',{name:'登录工作空间'}).click();
  await expect(page.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
}

test('cross-tab logout/account switch, field focus and server revocation',async({page,context,instance},info)=>{
  test.setTimeout(60000);
  const installed=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});
  expect(installed.status()).toBe(200);
  await page.goto(`${instance.url}/admin`);
  async function nav(target: Page,name:string){if(info.project.name==='mobile')await target.getByRole('button',{name:'打开导航'}).click();await target.getByRole('button',{name,exact:true}).click();}
  await nav(page,'用户列表');
  await page.getByRole('button',{name:'新增用户',exact:true}).click();
  await page.getByLabel('账号',{exact:true}).fill('bad!');
  await page.getByLabel('邮箱',{exact:true}).fill('member@example.test');
  await page.getByLabel('初始密码').fill('test-password-strong');
  await page.getByRole('button',{name:'创建用户',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('格式不正确');
  await expect(page.getByLabel('账号',{exact:true})).toBeFocused();
  await expect(page.getByLabel('账号',{exact:true})).toHaveAttribute('aria-invalid','true');
  await capture(page,info,'foundation-field-error');
  await page.getByLabel('账号',{exact:true}).fill('member');
  await page.getByRole('button',{name:'创建用户',exact:true}).click();
  await expect(page.getByRole('cell',{name:'member',exact:true})).toBeVisible();
  const second=await context.newPage();await second.goto(`${instance.url}/admin#users`);
  await expect(second.getByRole('cell',{name:'member',exact:true})).toBeVisible();
  await second.getByRole('button',{name:'新增用户',exact:true}).click();
  await second.getByLabel('初始密码').fill('private-unsent-draft');
  await page.getByRole('button',{name:'账号菜单',exact:true}).click();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'管理员登录 · Unicore',exact:true})).toBeVisible();
  await expect(second.getByRole('heading',{name:'管理员登录 · Unicore',exact:true})).toBeVisible();
  await expect(second.getByRole('cell',{name:'member',exact:true})).toHaveCount(0);
  await capture(second,info,'foundation-cross-tab-logout');
  await page.goto(instance.url);await second.goto(`${instance.url}/#users`);
  await login(page,'member');
  await expect(second.getByText('没有访问权限',{exact:true})).toBeVisible();
  await expect(second.getByRole('button',{name:'新增用户',exact:true})).toHaveCount(0);
  await expect(second.getByLabel('初始密码')).toHaveCount(0);
  await capture(second,info,'foundation-account-guard');
  // A separate admin session revokes the member; the next UI request must expire both tabs.
  const admin=await context.browser()!.newContext();
  try{
    const captcha=(await(await admin.request.get(`${instance.url}/api/v1/auth/captcha`,{headers:{"X-Unicore-Identity":"administrator"}})).json()).data;
    const answer=[...Buffer.from(captcha.image.split(',')[1],'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match=>match[1]).join('');
    const auth=await admin.request.post(`${instance.url}/api/v1/auth/login`,{headers:{"X-Unicore-Identity":"administrator"},data:{username:'admin',password:'test-password-strong',captcha_id:captcha.id,captcha_answer:answer}});expect(auth.status()).toBe(200);
    const session=(await auth.json()).data;
    const users=(await(await admin.request.get(`${instance.url}/api/v1/admin/users`,{headers:{"X-Unicore-Identity":"administrator"}})).json()).data;
    const member=users.items.find((user:{username:string})=>user.username==='member');
    const update=await admin.request.patch(`${instance.url}/api/v1/admin/users/${member.id}`,{headers:{'X-Unicore-Identity':'administrator','X-CSRF-Token':session.csrf_token},data:{status:'disabled',role:'user'}});expect(update.status()).toBe(200);
    await page.getByRole('button',{name:'运行用例'}).click();
    await expect(page.getByRole('heading',{name:'登录 Unicore',exact:true})).toBeVisible();
    await expect(page.getByText('会话已失效，请重新登录。',{exact:true})).toBeVisible();
    await expect(second.getByRole('heading',{name:'登录 Unicore',exact:true})).toBeVisible();
    await capture(page,info,'foundation-session-expired');
    expect((await admin.request.patch(`${instance.url}/api/v1/admin/users/${member.id}`,{headers:{'X-Unicore-Identity':'administrator','X-CSRF-Token':session.csrf_token},data:{status:'active',role:'user'}})).status()).toBe(200);
    // Browser redirects can replace the session without broadcasting localStorage.
    const challenge=(await(await page.request.get(`${instance.url}/api/v1/auth/captcha`)).json()).data;
    const freshAnswer=[...Buffer.from(challenge.image.split(',')[1],'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match=>match[1]).join('');
    expect((await page.request.post(`${instance.url}/api/v1/auth/login`,{data:{username:'member',password:'test-password-strong',captcha_id:challenge.id,captcha_answer:freshAnswer}})).status()).toBe(200);
    await page.bringToFront();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();

  }finally{await admin.close();await second.close();}
});

test('unknown routes and generated API reference follow system theme',async({page,instance},info)=>{
  await installStandalone(instance);
  await page.goto(`${instance.url}/#missing-page`);
  await expect(page.getByText('找不到这个页面',{exact:true})).toBeVisible();
  await capture(page,info,'foundation-not-found');
  await page.getByRole('link',{name:'返回工作台'}).click();
  await expect(page.getByRole('button',{name:'运行用例'})).toBeVisible();
  await page.goto(`${instance.url}/docs/api`);
  await expect(page.getByRole('heading',{name:'API 文档',exact:true})).toBeVisible();
  await expect(page.locator('#operations details')).toHaveCount(Object.keys(operations).length);
  await page.locator('#createUser summary').click();
  await expect(page.locator('#createUser')).toContainText('users:create');
  await page.locator('#schema-EmailCodeInput summary').click();
  await expect(page.locator('#schema-EmailCodeInput')).toContainText('^[0-9]{6}$');
  await capture(page,info,'foundation-api-reference');
  await page.emulateMedia({colorScheme:'dark'});
  const dark=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({colorScheme:'light'});
  expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)).not.toBe(dark);
  const source=await page.request.get(`${instance.url}/openapi.json`);expect(source.status()).toBe(200);expect((await source.json()).openapi).toBe('3.1.0');
});
