// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator account-security controls and read-only 2FA columns in both identity lists.
import {test,expect,navigate} from './fixtures';
import {mkdir} from 'node:fs/promises';

test('account security is a separate management page with independent realm settings',async({page,instance},info)=>{
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 await page.goto(`${instance.url}/admin`);await navigate(page,'账户安全');
 await expect(page.getByRole('heading',{name:'账户安全',exact:true,level:1})).toBeVisible();await expect(page.getByRole('tab')).toHaveCount(0);
 for(const [label,value] of [['登录失败封禁次数','5'],['IP 封禁时长（分钟）','15'],['用户端空闲超时（分钟）','1440'],['管理端空闲超时（分钟）','360'],['管理端最长登录时间（分钟）','1440']])await expect(page.getByLabel(label,{exact:true})).toHaveValue(value);
 await expect(page.getByLabel('强制管理员两步验证',{exact:true})).not.toBeChecked();await expect(page.getByLabel('强制用户两步验证',{exact:true})).not.toBeChecked();
 await expect(page.getByLabel('邮箱验证码登录',{exact:true})).not.toBeChecked();await expect(page.getByLabel('登录图形验证码',{exact:true})).toHaveCount(0);
 await page.getByLabel('登录失败封禁次数',{exact:true}).fill('3');await page.getByLabel('强制用户两步验证',{exact:true}).check();const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/admin/settings')&&r.status()===200);await page.getByRole('button',{name:'保存设置',exact:true}).click();await saved;await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();await page.reload();
 await expect(page.getByLabel('强制用户两步验证',{exact:true})).toBeChecked();await expect(page.getByLabel('强制管理员两步验证',{exact:true})).not.toBeChecked();
 const dir=`build/acceptance/account-policy/${info.project.name}`;await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/security-zh.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await navigate(page,'用户列表');await expect(page.getByRole('columnheader',{name:'双因素认证',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'未开启',exact:true})).toBeVisible();
 await expect(page.getByRole('columnheader',{name:'手机号',exact:true})).toBeVisible();
 await page.evaluate(()=>{const key='unicore.preferences.v1';const prefs=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({...prefs,locale:'en',theme:'dark'}));});await page.goto(`${instance.url}/admin/account-policy`);await expect(page.getByLabel('Require user two-factor authentication',{exact:true})).toBeChecked();await page.screenshot({path:`${dir}/security-en-dark.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
