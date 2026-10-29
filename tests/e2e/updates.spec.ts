// Author: yunnuo <ymz@ebox.vip>
// Description: Real local history, administrator-only update entry and offline response rendering.
import {test,expect,installStandalone} from './fixtures';
import {capture} from './visual';
import {readFileSync} from 'node:fs';
const version=readFileSync('VERSION','utf8').trim();
test('updates: standalone embedded history, offline check and responsive themes',async({page,instance},info)=>{
 test.skip(process.env.FEATURE_UPDATER==='false','Updater was compiled out');
 await installStandalone(instance);await page.goto(instance.url+'/#edition');
 await expect(page.getByRole('heading',{name:'在线更新',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'更新日志',exact:true})).toBeVisible();
 await expect(page.locator('.update-release').first()).toContainText('v'+version);
 const overview=(await(await page.request.get(instance.url+'/api/v1/updates')).json()).data;
 expect(overview.checked_at).toBe('');expect(overview.history.length).toBeGreaterThan(0);
 await page.route('**/api/v1/updates/check',route=>route.fulfill({json:{code:'OK',request_id:'offline-fixture',data:{...overview,last_error:'暂时无法连接更新渠道，以下保留内置与已缓存的更新日志'}}}));
 await page.getByRole('button',{name:'检查更新',exact:true}).click();
 await expect(page.getByText('暂时无法连接更新渠道，以下保留内置与已缓存的更新日志',{exact:true})).toBeVisible();
 await expect(page.locator('.update-release').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'更新并重启',exact:true})).toBeDisabled();
 for(const theme of ['light','dark']){await page.evaluate(v=>localStorage.setItem('unicore.preferences.v1',JSON.stringify({...JSON.parse(localStorage.getItem('unicore.preferences.v1')??'{}'),theme:v})),theme);await page.emulateMedia({colorScheme:theme as 'light'|'dark'});await page.reload();await expect(page.getByRole('heading',{name:'更新日志',exact:true})).toBeVisible();await capture(page,info,'updates-'+theme);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('updates: ordinary users have no version, route or API access',async({page,instance},info)=>{
 const installed=await page.request.post(instance.url+'/api/v1/install/complete',{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});expect(installed.status()).toBe(200);
 const admin=(await(await page.request.get(instance.url+'/api/v1/admin/bootstrap')).json()).data;
 await page.goto(instance.url+'/admin#edition');
 if(process.env.FEATURE_UPDATER!=='false')await expect(page.getByRole('heading',{name:'更新日志',exact:true})).toBeVisible();
 await capture(page,info,'updates-administrator');
 const created=await page.request.post(instance.url+'/api/v1/admin/users',{headers:{'X-CSRF-Token':admin.csrf_token},data:{username:'updatemember',email:'update@example.test',password:'member-password-strong',role:'user'}});expect(created.status()).toBe(200);
 const security=await page.request.patch(instance.url+'/api/v1/admin/settings',{headers:{'X-CSRF-Token':admin.csrf_token},data:{changes:[{key:'security.login_captcha',value:'false'}]}});expect(security.status()).toBe(200);
 await page.request.post(instance.url+'/api/v1/admin/auth/logout',{headers:{'X-CSRF-Token':admin.csrf_token},data:{}});
 const logged=await page.request.post(instance.url+'/api/v1/auth/login',{data:{username:'updatemember',password:'member-password-strong',captcha_id:'',captcha_answer:''}});expect(logged.status()).toBe(200);
 const member=(await(await page.request.get(instance.url+'/api/v1/bootstrap')).json()).data;expect(member.version).toBe('');expect(member.capabilities.updater).toBe(false);
 for(const path of ['/api/v1/admin/updates','/api/v1/admin/updates/check','/api/v1/admin/updates/apply']){const response=path.endsWith('updates')?await page.request.get(instance.url+path):await page.request.post(instance.url+path,{data:{version:'1.0.0',backup_confirmed:true}});expect(response.status()).toBe(403);}
 await page.goto(instance.url+'/#edition');await expect(page.getByRole('heading',{name:'在线更新',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'系统更新',exact:true})).toHaveCount(0);await capture(page,info,'updates-user-denied');
});
test('updates: confirmation modal requires backup and supports cancel',async({page,instance},info)=>{
 test.skip(process.env.FEATURE_UPDATER==='false','Updater was compiled out');await installStandalone(instance);
 const overview=(await(await page.request.get(instance.url+'/api/v1/updates')).json()).data;
 await page.route('**/api/v1/updates',route=>route.fulfill({json:{code:'OK',request_id:'confirmation-fixture',data:{...overview,latest_version:'99.0.0',available:true,verified:true,can_apply:true,reason:''}}}));
 await page.goto(instance.url+'/#edition');const update=page.getByRole('button',{name:'更新并重启',exact:true});await update.click();
 const dialog=page.getByRole('dialog',{name:'确认更新并重启'});await expect(dialog).toBeVisible();const backup=dialog.getByRole('checkbox');await expect(backup).toBeFocused();await expect(dialog.getByRole('button',{name:'确认更新',exact:true})).toBeDisabled();
 await capture(page,info,'updates-backup-modal');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(update).toBeFocused();await update.click();await backup.check();await expect(dialog.getByRole('button',{name:'确认更新',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(dialog).toHaveCount(0);
});
