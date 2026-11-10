// Author: yunnuo <ymz@ebox.vip>
// Description: Real Go-backed personal-center, authenticator, recovery and device flows on PC and mobile.
import {createHmac} from 'node:crypto';
import jsQR from 'jsqr';
import {PNG} from 'pngjs';
import {mkdir} from 'node:fs/promises';
import {test,expect,navigate} from './fixtures';

function code(secret:string,step:number){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret)bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');
 const key=Buffer.from(bits.match(/.{8}/g)!.map(v=>parseInt(v,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const hash=createHmac('sha1',key).update(counter).digest();const offset=hash.at(-1)!&15;
 return ((hash.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}

test('personal center supports profile, TOTP recovery login and device revocation',async({page,instance},info)=>{
 test.setTimeout(90000);
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 await page.goto(`${instance.url}/admin`);
 let boot=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers:{'X-CSRF-Token':boot.csrf_token},data:{changes:[{key:'security.login_captcha',value:'false'}]}})).status()).toBe(200);
 await navigate(page,'个人资料');
 await expect(page.getByLabel('用户名',{exact:true})).toBeDisabled();
 await page.getByLabel('昵称',{exact:true}).fill('My display name');await page.getByRole('button',{name:'保存个人资料',exact:true}).click();await expect(page.getByText('个人资料已保存',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByLabel('昵称',{exact:true})).toHaveValue('My display name');
 await page.getByRole('button',{name:'更换邮箱',exact:true}).click();const email=page.getByRole('dialog',{name:'更换邮箱',exact:true});
 await expect(email.getByLabel('邮箱验证码',{exact:true})).toBeFocused();
 await expect(email.getByRole('button',{name:'验证并继续',exact:true})).toBeDisabled();
 await email.getByRole('button',{name:'发送验证码',exact:true}).click();await expect(page.getByText('请先保存 SMTP 配置并成功发送测试邮件，再启用邮件账号流程',{exact:true})).toBeVisible();
 await expect(email).toBeVisible();await page.keyboard.press('Escape');await expect(email).toHaveCount(0);await expect(page.getByRole('button',{name:'更换邮箱',exact:true})).toBeFocused();
 await navigate(page,'安全设置');await page.getByRole('button',{name:'设置身份验证器',exact:true}).click();const setup=page.getByRole('dialog',{name:'设置身份验证器',exact:true});
 await setup.getByLabel('当前密码',{exact:true}).fill('test-password-strong');await setup.getByRole('button',{name:'验证并开始设置',exact:true}).click();
 await expect(setup.getByAltText('身份验证器设置二维码')).toBeVisible();
 const secret=await setup.getByLabel('手动密钥',{exact:true}).inputValue();expect(secret).toMatch(/^[A-Z2-7]{32}$/);
 const png=PNG.sync.read(Buffer.from((await setup.getByAltText('身份验证器设置二维码').getAttribute('src'))!.split(',')[1], 'base64'));
 const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);expect(decoded).toBeTruthy();
 const uri=new URL(decoded!.data);expect(uri.protocol).toBe('otpauth:');expect(uri.hostname).toBe('totp');expect(uri.searchParams.get('secret')).toBe(secret);expect(uri.searchParams.get('digits')).toBe('6');expect(uri.searchParams.get('period')).toBe('30');
 // A scanned enrollment key must survive the next code period without being replaced.
 await page.clock.install();await page.clock.fastForward(31000);await expect(setup.getByLabel('手动密钥',{exact:true})).toHaveValue(secret);

 // The server reads its verification clock after the enrollment queries, so
 // under load the accepted window drifts forward: submit the current window's
 // code (a previous-window code falls out of range across a 30s boundary).
 await setup.getByLabel('身份验证器验证码',{exact:true}).fill(code(secret,Math.floor(Date.now()/30000)));await setup.getByRole('button',{name:'开启双重验证',exact:true}).click();
 await expect(setup).toHaveCount(0);await expect(page.getByRole('button',{name:'下载恢复码',exact:true})).toBeVisible();
 const administrators=(await(await page.request.get(`${instance.url}/api/v1/admin/administrators`)).json()).data;
 expect(administrators.items.find((user:{username:string})=>user.username==='admin').totp_enabled).toBe(true);
 const recovery=await page.locator('code').allTextContents();expect(recovery).toHaveLength(10);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'下载恢复码',exact:true}).click();expect((await downloadPromise).suggestedFilename()).toBe('recovery-codes.txt');
 await page.getByRole('button',{name:'已保存，关闭',exact:true}).click();await expect(page.locator('code')).toHaveCount(0);
 // A second login is restricted until one unused recovery code is consumed.
 const extraLogin=await instance.request.post('/api/v1/admin/auth/login',{data:{username:'admin',password:'test-password-strong',captcha_id:'',captcha_answer:''}});expect(extraLogin.status()).toBe(200);
 const extra=(await extraLogin.json()).data;expect(extra.mfa_pending).toBe(true);
 expect((await instance.request.get('/api/v1/admin/account/profile')).status()).toBe(401);
 expect((await instance.request.post('/api/v1/admin/auth/mfa',{headers:{'X-CSRF-Token':extra.csrf_token},data:{code:recovery[0]}})).status()).toBe(200);
 await navigate(page,'登录会话');
 await expect(page.getByText('当前会话',{exact:true})).toBeVisible();await page.getByRole('button',{name:'下线其他设备',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'确认下线',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toHaveCount(0);expect((await instance.request.get('/api/v1/admin/auth/session')).status()).toBe(401);
 await instance.restart();await page.reload();await expect(page.getByText('当前会话',{exact:true})).toBeVisible();
 const directory=`build/acceptance/personal-center/${info.project.name}`;await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/sessions-zh.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'账号菜单',exact:true}).click();const __out=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/auth/logout'));const __item=page.getByRole('menuitem',{name:'退出登录',exact:true});await expect(__item).toBeVisible();await __item.click();await __out;
 await page.getByLabel('账号或邮箱',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('test-password-strong');await page.getByRole('button',{name:'登录工作空间',exact:true}).click();
 await expect(page.getByRole('heading',{name:'双重验证',exact:true})).toBeVisible();await expect(page.getByLabel('身份验证器验证码',{exact:true})).toBeVisible();
 // Exercise a genuine six-digit authenticator login before recovery fallback.
 await page.getByLabel('身份验证器验证码',{exact:true}).fill('000000');await page.getByRole('button',{name:'验证并登录',exact:true}).click();await expect(page.getByRole('heading',{name:'双重验证',exact:true})).toBeVisible();
 // The enrollment consumed this window's step, so submit the next window's
 // code: it verifies under the server's ±1 window skew whatever the current
 // phase is and always beats the replay guard (step > last consumed step).
 await page.getByLabel('身份验证器验证码',{exact:true}).fill(code(secret,Math.floor(Date.now()/30000)+1));await page.getByRole('button',{name:'验证并登录',exact:true}).click();await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
 await page.getByRole('button',{name:'账号菜单',exact:true}).click();const __out2=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/auth/logout'));const __item2=page.getByRole('menuitem',{name:'退出登录',exact:true});await expect(__item2).toBeVisible();await __item2.click();await __out2;
 await page.getByLabel('账号或邮箱',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('test-password-strong');await page.getByRole('button',{name:'登录工作空间',exact:true}).click();await expect(page.getByRole('heading',{name:'双重验证',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'使用恢复码',exact:true}).click();await page.getByLabel('恢复码',{exact:true}).fill(recovery[0]);await page.getByRole('button',{name:'验证并登录',exact:true}).click();await expect(page.getByRole('heading',{name:'双重验证',exact:true})).toBeVisible();
 await page.getByLabel('恢复码',{exact:true}).fill(recovery[1]);await page.getByRole('button',{name:'验证并登录',exact:true}).click();await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
 await page.evaluate(()=>{const key='unicore.preferences.v1';const v=JSON.parse(localStorage.getItem(key)||'{}');v.locale='en';v.theme='dark';localStorage.setItem(key,JSON.stringify(v));});
 await page.goto(`${instance.url}/admin/account-security`);await expect(page.getByRole('heading',{name:'Security',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Disable two-factor authentication',exact:true})).toBeVisible();
 await page.screenshot({path:`${directory}/security-en-dark.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(info.project.name==='mobile')await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 // Administrator personal pages fold into the shared 个人中心 directory at the
 // tail of the one business region; the active page auto-expands it and keeps
 // its entry highlighted inside that region.
 const businessSection=page.locator('.sidebar section[data-nav-section="business"]');
 await expect(businessSection.locator('h2')).toHaveText('Business');
 const personalDirectory=businessSection.getByRole('button',{name:'Personal center',exact:true});
 await expect(personalDirectory).toBeVisible();
 await expect(personalDirectory).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('.sidebar').getByRole('button',{name:'Security',exact:true})).toHaveClass(/bg-primary-soft/);
 await expect(businessSection.getByRole('button',{name:'Security',exact:true})).toBeVisible();
});

test('forced enrollment applies to ordinary users and preserves recovery codes across policy refresh',async({page,instance},info)=>{
 test.setTimeout(60000);
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 const boot=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;
 const headers={'X-CSRF-Token':boot.csrf_token};
 expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'member',email:'member@example.test',password:'member-password-strong',role:'user'}})).status()).toBe(200);
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'security.login_captcha',value:'false'},{key:'security.force_user_2fa',value:'true'}]}})).status()).toBe(200);
 expect((await page.request.get(`${instance.url}/api/v1/admin/users`)).status()).toBe(200);
 expect((await page.request.post(`${instance.url}/api/v1/auth/login`,{data:{username:'member',password:'member-password-strong',captcha_id:'',captcha_answer:''}})).status()).toBe(200);
 // Install the clock before mounting the shell so its polling interval is controlled.
 await page.clock.install();
 await page.goto(`${instance.url}/lab`);await expect(page).toHaveURL(`${instance.url}/account-security`);
 await expect(page.getByText('实例要求启用双重验证，请先完成安全设置。',{exact:true})).toBeVisible();
 expect((await page.request.get(`${instance.url}/api/v1/notes`)).status()).toBe(403);
 await page.getByRole('button',{name:'设置身份验证器',exact:true}).click();const dialog=page.getByRole('dialog',{name:'设置身份验证器',exact:true});
 await dialog.getByLabel('当前密码',{exact:true}).fill('member-password-strong');await dialog.getByRole('button',{name:'验证并开始设置',exact:true}).click();
 const secret=await dialog.getByLabel('手动密钥',{exact:true}).inputValue();
 // The server reads its verification clock after the enrollment queries, so
 // under load the accepted window drifts forward: submit the current window's
 // code (a previous-window code falls out of range across a 30s boundary).
 // Enabling refetches the profile; the fastForward below advances the mocked
 // clock past this request's 20s AbortSignal.timeout, so let the reload land
 // first or the cancelled profile query unmounts the one-time recovery codes.
 const profileRefresh=page.waitForResponse(response=>response.request().method()==='GET'&&response.url().includes('/api/v1/account/profile'));
 await dialog.getByLabel('身份验证器验证码',{exact:true}).fill(code(secret,Math.floor(Date.now()/30000)));await dialog.getByRole('button',{name:'开启双重验证',exact:true}).click();
 await expect(page.locator('code')).toHaveCount(10);
 await profileRefresh;
 const policyRefresh=page.waitForResponse(response=>response.url()===`${instance.url}/api/v1/bootstrap` && response.request().method()==='GET');
 await page.clock.fastForward(31000);
 expect((await policyRefresh).status()).toBe(200);
 await expect(page.getByText('实例要求启用双重验证，请先完成安全设置。',{exact:true})).toHaveCount(0);
 await expect(page.locator('code')).toHaveCount(10); // A bootstrap refresh must not unmount the one-time recovery-code display.
 await expect(page.getByRole('button',{name:'关闭双重验证',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'已保存，关闭',exact:true}).click();await expect(page.locator('code')).toHaveCount(0);
 expect((await page.request.get(`${instance.url}/api/v1/notes`)).status()).toBe(200);
 const current=(await(await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data.current_user;
 expect(current.username).toBe('member');expect(current.totp_enabled).toBe(true);
 expect((await page.request.get(`${instance.url}/api/v1/admin/users`)).status()).toBe(403);
 if(info.project.name==='mobile')await page.getByRole('button',{name:'打开导航',exact:true}).click();
 // The member workspace folds its personal pages into the same seeded
 // 个人中心 directory of the single 业务 region.
 const memberBusiness=page.locator('.sidebar section[data-nav-section="business"]');
 await expect(memberBusiness.locator('h2')).toHaveText('业务');
 await expect(memberBusiness.getByRole('button',{name:'个人中心',exact:true})).toBeVisible();
 await expect(page.locator('.sidebar').getByRole('button',{name:'系统设置',exact:true})).toHaveCount(0);
 // Management-flavoured pages never render on the user surface, even though a
 // persisted legacy menu tree still carries their nodes.
 for(const name of ['基础设置','API 文档','公告','文件管理'])await expect(page.locator('.sidebar').getByRole('button',{name,exact:true})).toHaveCount(0);
});
