// Author: yunnuo <ymz@ebox.vip>
// Description: Real settings persistence, secret semantics, template preview and bilingual responsive notification pages.
import { mkdir } from 'node:fs/promises';
import { test, expect, installStandalone } from './fixtures';
test.use({actionTimeout:10000});

test('notification channels, drafts, routing and restart', async ({page,instance},info)=>{
 test.setTimeout(90000);
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 const directory=`build/acceptance/notifications/${info.project.name}`;await mkdir(directory,{recursive:true});
 await page.goto(`${instance.url}/admin/notification-channels`);
 await expect(page.getByRole('heading',{name:'选择通知渠道',exact:true})).toBeVisible();
 await page.getByRole('radio',{name:/自定义 Webhook/}).check();
 await page.getByLabel('回调地址',{exact:true}).fill('https://notify.example.test/hook?token=synthetic');
 await page.getByLabel('签名密钥（可选）',{exact:true}).fill('synthetic-secret');
 await page.getByRole('switch',{name:'启用通知渠道',exact:true}).check();
 await page.getByRole('button',{name:'保存设置',exact:true}).click();
 await expect(page.getByText('通知设置已保存',{exact:true})).toBeVisible();
 await expect(page.getByLabel('回调地址',{exact:true})).toHaveValue('');
 await page.screenshot({path:`${directory}/channels.png`,fullPage:true});
 await page.getByRole('button',{name:'测试发送',exact:true}).click();
 const testDialog=page.getByRole('dialog',{name:'测试发送',exact:true});
 await expect(testDialog).toContainText('自定义 Webhook');
 await expect(testDialog.getByRole('radio')).toHaveCount(0);
 await expect(testDialog.getByText('邮件通知',{exact:true})).toHaveCount(0);
 await expect(testDialog.getByLabel('测试收件邮箱',{exact:true})).toHaveCount(0);
 // This synthetic .test address has no receiver. Exercise the real backend
 // failure path and ensure the error refers to the selected channel.
 await testDialog.getByRole('button',{name:'发送测试通知',exact:true}).click();
 await expect(page.getByText('通知渠道发送失败，请检查渠道凭据、机器人状态与网络连接',{exact:true})).toBeVisible({timeout:15000});
 await expect(testDialog).toBeVisible();
 await testDialog.getByRole('button',{name:'取消',exact:true}).click();

 const response=await page.request.get(`${instance.url}/api/v1/admin/settings/notifications`);const config=(await response.json()).data;
 expect(config.webhook_configured).toBe(true);expect(config.webhook_url).toBe('');expect(config.signing_secret).toBe('');
 await page.goto(`${instance.url}/admin/notification-templates`);
 await expect(page.getByLabel('通知标题',{exact:true})).toBeVisible();
 await page.getByLabel('通知标题',{exact:true}).fill('{{site_name}} · 登录提醒');
 await page.getByLabel('通知内容',{exact:true}).fill('账户 {{username}} 已完成登录。\n时间 {{event_time}}\n来源 {{ip}}');
 await page.getByRole('button',{name:'预览',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'通知预览',exact:true})).toContainText('example_user');
 await page.screenshot({path:`${directory}/template-preview.png`,fullPage:true});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'保存设置',exact:true}).click();
 await expect(page.getByText('通知设置已保存',{exact:true})).toBeVisible();
 await page.screenshot({path:`${directory}/templates.png`,fullPage:true});
 await page.goto(`${instance.url}/admin/system-notifications`);
 await expect(page.getByRole('switch',{name:'启用系统通知',exact:true})).not.toBeChecked();
 await page.getByRole('switch',{name:'启用系统通知',exact:true}).check();
 await page.getByRole('tab',{name:'管理员通知',exact:true}).click();
 await page.getByRole('switch',{name:'登录成功 · 通知渠道',exact:true}).check();
 await page.getByRole('button',{name:'保存设置',exact:true}).click();
 await expect(page.getByText('通知设置已保存',{exact:true})).toBeVisible();
 await page.screenshot({path:`${directory}/system.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await instance.restart();await page.reload();
 await expect(page.getByRole('switch',{name:'启用系统通知',exact:true})).toBeChecked();
 await page.getByRole('tab',{name:'管理员通知',exact:true}).click();
 await expect(page.getByRole('switch',{name:'登录成功 · 通知渠道',exact:true})).toBeChecked();
 // Invalid variables are rejected without replacing the saved draft.
 await page.goto(`${instance.url}/admin/notification-templates`);
 await page.getByLabel('通知标题',{exact:true}).fill('{{password}}');
 await page.getByRole('button',{name:'预览',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'通知预览',exact:true})).toHaveCount(0);
 const invalid=await page.request.post(`${instance.url}/api/v1/admin/settings/notifications/preview`,{headers:{'X-CSRF-Token':(await (await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data.csrf_token},data:{event:'login',title:'{{password}}',body:'invalid'}});
 expect(invalid.status()).toBe(400);
 await page.goto(`${instance.url}/admin/system-notifications`);
 // The shared language setting must translate the new routes and event controls.
 await page.evaluate(()=>{localStorage.setItem('unicore.preferences.v1',JSON.stringify({locale:'en',theme:'dark'}))});await page.reload();await expect(page.getByRole('heading',{name:'Enable system notifications',exact:true})).toBeVisible();await page.screenshot({path:`${directory}/system-en-dark.png`,fullPage:true});
});

test('notification management is unavailable in standalone',async({page,instance})=>{
 await installStandalone(instance);
 expect((await page.request.get(`${instance.url}/api/v1/admin/settings/notifications`)).status()).not.toBe(200);
});
