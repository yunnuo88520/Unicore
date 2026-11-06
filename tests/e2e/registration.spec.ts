// Author: yunnuo <ymz@ebox.vip>
// Description: Independent registration policy, restriction editing and actual login without SMTP.
import {test,expect} from './fixtures';
import {mkdir} from 'node:fs/promises';

test('registration works without SMTP and exposes independent restrictions',async({page,instance},info)=>{
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 await page.goto(`${instance.url}/admin/site`);
 await expect(page.locator('fieldset label').filter({hasText:/^(站点名称|站点描述|站点地址|管理员邮箱|页脚版权|备案号（ICP）|备案查询链接|公安备案号|自定义页脚 HTML)$/})).toHaveText(['站点名称','站点描述','站点地址','管理员邮箱','页脚版权','备案号（ICP）','备案查询链接','公安备案号','自定义页脚 HTML']);
 await page.getByRole('tab',{name:'注册设置',exact:true}).click();
 await page.getByLabel('开放注册',{exact:true}).check();await expect(page.getByLabel('注册邮箱验证',{exact:true})).not.toBeChecked();
 await page.getByLabel('注册绑定手机号',{exact:true}).check();
 await expect(page.getByLabel('注册频率窗口（分钟）',{exact:true})).toHaveValue('1');await expect(page.getByLabel('窗口内注册上限',{exact:true})).toHaveValue('5');
 await page.getByLabel('邮箱后缀限制模式',{exact:true}).selectOption('allowlist');await page.getByLabel('邮箱后缀列表',{exact:true}).fill('example.test');
 for(const [key,value] of [['昵称黑名单','official'],['用户名黑名单','root'],['密码黑名单','password-password'],['IP 黑名单','203.0.113.*']])await page.getByLabel(key,{exact:true}).fill(value);
 await page.getByRole('button',{name:'保存设置',exact:true}).click();await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // Human verification and password recovery live under 安全与控制; the register captcha is disabled there for this flow.
 await page.getByRole('tab',{name:'安全与控制',exact:true}).click();
 await expect(page.getByLabel('登录图形验证码',{exact:true})).toBeChecked();await expect(page.getByLabel('注册图形验证码',{exact:true})).toBeChecked();await expect(page.getByLabel('邮件找回密码',{exact:true})).not.toBeChecked();
 await page.getByLabel('注册图形验证码',{exact:true}).uncheck();
 await page.getByRole('button',{name:'保存设置',exact:true}).click();await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'账号菜单',exact:true}).click();await page.getByRole('menuitem',{name:'退出登录',exact:true}).click();await page.goto(instance.url);
 const directory=`build/acceptance/auth-layout/${info.project.name}`;await mkdir(directory,{recursive:true});
 await expect(page.getByRole('heading',{name:'登录 Unicore',exact:true})).toBeVisible();await expect(page.locator('.flow-brand')).toBeVisible();
 await page.screenshot({path:`${directory}/login-zh-light.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'重发验证邮件',exact:true})).toHaveCount(0);await page.getByRole('link',{name:'注册账号',exact:true}).click();
 await page.getByLabel('账号',{exact:true}).fill('newmember');await page.getByLabel('邮箱',{exact:true}).fill('newmember@other.test');await page.getByLabel('密码',{exact:true}).fill('member-password-strong');await page.getByLabel('确认密码',{exact:true}).fill('member-password-strong');await page.getByLabel('手机号',{exact:true}).fill('13800138000');
 await page.screenshot({path:`${directory}/register-zh-light.png`,fullPage:true});
 await page.evaluate(()=>{const key='unicore.preferences.v1';localStorage.setItem(key,JSON.stringify({...JSON.parse(localStorage.getItem(key)||'{}'),locale:'en',theme:'dark'}));window.dispatchEvent(new StorageEvent('storage',{key}));});
 await expect(page.getByRole('heading',{name:'Create account',exact:true})).toBeVisible();await expect(page.getByLabel('Email',{exact:true})).toHaveValue('newmember@other.test');await page.screenshot({path:`${directory}/register-en-dark.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>{const key='unicore.preferences.v1';localStorage.setItem(key,JSON.stringify({...JSON.parse(localStorage.getItem(key)||'{}'),locale:'zh-CN',theme:'light'}));window.dispatchEvent(new StorageEvent('storage',{key}));});
 const rejected=page.waitForResponse(r=>r.url().endsWith('/auth/email/register'));await page.getByRole('button',{name:'注册',exact:true}).click();expect((await rejected).status()).toBe(400);
 await page.getByLabel('邮箱',{exact:true}).fill('newmember@example.test');await page.getByRole('button',{name:'注册',exact:true}).click();await expect(page.getByText('账号已创建，现在可以登录。',{exact:true})).toBeVisible();
 // Registration rate limiting: one UI registration already used the per-IP window, so four more pass and the sixth fails.
 const bulk=async(i:number)=>page.request.post(`${instance.url}/api/v1/auth/email/register`,{data:{username:`bulk${i}`,email:`bulk${i}@example.test`,password:'bulk-password-strong',phone:`1390013900${i}`,captcha_id:'',captcha_answer:''}});
 for(let i=0;i<4;i++)expect((await bulk(i)).status()).toBe(200);
 expect((await bulk(4)).status()).toBe(429);
 await page.getByRole('link',{name:'返回登录',exact:true}).first().click();await page.getByLabel('账号或邮箱',{exact:true}).fill('newmember');await page.getByLabel('密码',{exact:true}).fill('member-password-strong');
 // Reloading the login page refreshes its own captcha; extract the displayed SVG test glyphs.
 const src=await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');const svg=Buffer.from(src!.split(',')[1],'base64').toString();const answer=[...svg.matchAll(/>([0-9])<\/text>/g)].map(v=>v[1]).join('');await page.getByLabel('图形验证码',{exact:true}).fill(answer);
 await page.getByRole('button',{name:'登录工作空间',exact:true}).click();await expect(page.getByRole('heading',{name:/一份核心，\s*无限可能/})).toBeVisible();
 await instance.restart();await page.reload();await expect(page.getByRole('heading',{name:/一份核心，\s*无限可能/})).toBeVisible();
});
