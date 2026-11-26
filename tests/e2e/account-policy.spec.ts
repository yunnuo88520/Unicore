// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator account-security controls and read-only 2FA columns in both identity lists.
import {test,expect,navigate,captchaAnswer} from './fixtures';
import {mkdir} from 'node:fs/promises';

test('account security is a separate management page with independent realm settings',async({page,instance},info)=>{
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 await page.goto(`${instance.url}/admin`);await navigate(page,'账户安全');
 await expect(page.getByRole('heading',{name:'账户安全',exact:true,level:1})).toBeVisible();await expect(page.getByRole('tab')).toHaveCount(0);
 for(const [label,value] of [['登录失败封禁次数','5'],['IP 封禁时长（分钟）','15'],['用户端空闲超时（分钟）','1440'],['管理端空闲超时（分钟）','1440'],['管理端最长登录时间（分钟）','1440']])await expect(page.getByLabel(label,{exact:true})).toHaveValue(value);
 await expect(page.getByLabel('强制管理员两步验证',{exact:true})).not.toBeChecked();await expect(page.getByLabel('强制用户两步验证',{exact:true})).not.toBeChecked();
 await expect(page.getByLabel('邮箱验证码登录',{exact:true})).not.toBeChecked();await expect(page.getByLabel('登录图形验证码',{exact:true})).toHaveCount(0);
 await page.getByLabel('登录失败封禁次数',{exact:true}).fill('3');await page.getByLabel('强制用户两步验证',{exact:true}).check();const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/admin/settings')&&r.status()===200);await page.getByRole('button',{name:'保存设置',exact:true}).click();await saved;await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();await page.reload();
 await expect(page.getByLabel('强制用户两步验证',{exact:true})).toBeChecked();await expect(page.getByLabel('强制管理员两步验证',{exact:true})).not.toBeChecked();
 const dir=`build/acceptance/account-policy/${info.project.name}`;await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/security-zh.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await navigate(page,'用户列表');await expect(page.getByRole('columnheader',{name:'双因素认证',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'未开启',exact:true})).toBeVisible();
 await expect(page.getByRole('columnheader',{name:'手机号',exact:true})).toBeVisible();
 await page.evaluate(()=>{const key='unicore.preferences.v1';const prefs=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({...prefs,locale:'en',theme:'dark'}));});await page.goto(`${instance.url}/admin/account-policy`);await expect(page.getByLabel('Require user two-factor authentication',{exact:true})).toBeChecked();await page.screenshot({path:`${dir}/security-en-dark.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('session lifetime defaults, persistence, cookie expiry and member settings denial',async({page,browser,instance})=>{
 test.setTimeout(90_000);
 const installed=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});
 expect(installed.status()).toBe(200);
 await page.goto(`${instance.url}/admin/account-policy`);
 await expect(page.getByLabel('会话有效期（小时）',{exact:true})).toHaveValue('24');
 await expect(page.getByLabel('用户端空闲超时（分钟）',{exact:true})).toHaveValue('1440');
 await expect(page.getByLabel('管理端空闲超时（分钟）',{exact:true})).toHaveValue('1440');
 await expect(page.getByLabel('管理端最长登录时间（分钟）',{exact:true})).toHaveValue('1440');

 await page.getByLabel('会话有效期（小时）',{exact:true}).fill('48');
 await page.getByLabel('管理端最长登录时间（分钟）',{exact:true}).fill('2880');
 const saved=page.waitForResponse(response=>response.request().method()==='PATCH'&&response.url().includes('/admin/settings')&&response.status()===200);
 await page.getByRole('button',{name:'保存设置',exact:true}).click();
 await saved;
 await page.reload();
 await expect(page.getByLabel('会话有效期（小时）',{exact:true})).toHaveValue('48');
 await expect(page.getByLabel('管理端最长登录时间（分钟）',{exact:true})).toHaveValue('2880');

 const metadata=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;
 const headers={'X-CSRF-Token':metadata.csrf_token};
 const created=await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'policy-member',email:'policy-member@example.test',password:'test-password-strong',role:'user'}});
 expect(created.status()).toBe(200);

 const adminContext=await browser.newContext();
 const memberContext=await browser.newContext();
 try{
  const captcha=(await(await adminContext.request.get(`${instance.url}/api/v1/admin/auth/captcha`)).json()).data;
  const adminLogin=await adminContext.request.post(`${instance.url}/api/v1/admin/auth/login`,{data:{username:'admin',password:'test-password-strong',captcha_id:captcha.id,captcha_answer:captchaAnswer(captcha.image)}});
  expect(adminLogin.status()).toBe(200);
  const setCookie=adminLogin.headersArray().find(header=>header.name.toLowerCase()==='set-cookie'&&header.value.startsWith('unicore_session='))?.value;
  expect(setCookie).toBeTruthy();
  const cookieExpiry=setCookie!.match(/expires=([^;]+)/i)?.[1];
  expect(cookieExpiry).toBeTruthy();
  const remaining=Date.parse(cookieExpiry!)-Date.now();
  expect(remaining).toBeGreaterThan(48*60*60*1000-10_000);
  expect(remaining).toBeLessThan(48*60*60*1000+10_000);

  const userCaptcha=(await(await memberContext.request.get(`${instance.url}/api/v1/auth/captcha`)).json()).data;
  const memberLogin=await memberContext.request.post(`${instance.url}/api/v1/auth/login`,{data:{username:'policy-member',password:'test-password-strong',captcha_id:userCaptcha.id,captcha_answer:captchaAnswer(userCaptcha.image)}});
  expect(memberLogin.status()).toBe(200);
  const memberSession=(await memberLogin.json()).data;
  expect((await memberContext.request.get(`${instance.url}/api/v1/admin/settings`)).status()).toBe(403);
  expect((await memberContext.request.patch(`${instance.url}/api/v1/admin/settings`,{headers:{'X-CSRF-Token':memberSession.csrf_token},data:{changes:[{key:'security.session_hours',value:'72'}]}})).status()).toBe(403);
  const persisted=(await(await page.request.get(`${instance.url}/api/v1/admin/settings`)).json()).data.items;
  expect(persisted.find((item:{key:string})=>item.key==='security.session_hours').value).toBe('48');
 }finally{
  await adminContext.close();
  await memberContext.close();
 }
});
