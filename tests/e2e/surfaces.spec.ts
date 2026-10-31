// Author: yunnuo <ymz@ebox.vip>
// Description: Distinct client/admin surfaces and accessible drag-and-drop uploads against real local storage.
import {mkdir} from 'node:fs/promises';
import {test,expect,installStandalone} from './fixtures';

test('separate entries, registration policy and redesigned file selection',async({page,browser,instance},info)=>{
 const installed=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});expect(installed.status()).toBe(200);
 await page.goto(`${instance.url}/admin#site?tab=security`);
 await expect(page.getByRole('switch',{name:'登录图形验证码',exact:true})).toBeChecked();
 await expect(page.getByRole('switch',{name:'注册图形验证码',exact:true})).toBeChecked();
 await expect(page.getByRole('switch',{name:'开放注册（需验证邮箱）',exact:true})).not.toBeChecked();
 const other=await browser.newContext({viewport:page.viewportSize()!});
 try{
  const user=await other.newPage();await user.goto(`${instance.url}/register`);
  await expect(user.getByRole('heading',{name:'创建账号',exact:true})).toBeVisible();
  await expect(user.getByRole('button',{name:'注册并验证邮箱',exact:true})).toBeDisabled();
  await expect(user.getByRole('link',{name:'管理员登录',exact:true})).toHaveCount(0);
  await user.getByRole('button',{name:'返回登录',exact:true}).click();await expect(user).toHaveURL(/\/login$/);
  expect((await user.request.get(`${instance.url}/api/v1/admin/users`)).status()).toBe(401);
 }finally{await other.close();}
 await page.goto(`${instance.url}/admin#files`);await page.getByRole('button',{name:'上传文件',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'上传文件',exact:true});await expect(dialog.locator('.upload-zone')).toBeFocused();
 await expect(dialog.getByRole('button',{name:'开始上传',exact:true})).toBeDisabled();
 const transfer=await page.evaluateHandle(()=>{const data=new DataTransfer();data.items.add(new File(['private drag bytes'],'drag-example.txt',{type:'text/plain'}));return data;});
 await dialog.locator('.upload-zone').dispatchEvent('drop',{dataTransfer:transfer});await expect(dialog.locator('.upload-file-card')).toContainText('drag-example.txt');
 await dialog.getByRole('button',{name:'移除已选文件',exact:true}).click();await expect(dialog.locator('.upload-file-card')).toHaveCount(0);
 await expect(dialog.locator('.upload-zone')).toBeFocused();await expect(dialog.getByRole('button',{name:'开始上传',exact:true})).toBeDisabled();
 await dialog.getByLabel('选择文件').setInputFiles({name:'design-review.txt',mimeType:'text/plain',buffer:Buffer.from('private upload verification')});
 const directory=`build/acceptance/surfaces/${info.project.name}`;await mkdir(directory,{recursive:true});
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:`${directory}/upload-${theme}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await dialog.getByRole('button',{name:'开始上传',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'下载 design-review.txt',exact:true})).toBeVisible();
});

test('standalone rejects all global configuration and keeps only local appearance',async({page,instance},info)=>{
 await installStandalone(instance);await page.goto(instance.url);
 if(info.project.name==='mobile')await page.getByRole('button',{name:'打开导航',exact:true}).click();
 for(const name of ['系统管理','用户管理','文件管理','账号菜单','基础设置'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'外观设置',exact:true}).click();await expect(page.getByRole('tab')).toHaveCount(0);
 for(const key of ['site.name','branding.logo','mail.host'])expect((await page.request.patch(`${instance.url}/api/v1/settings`,{data:{changes:[{key,value:'denied'}]}})).status()).toBe(400);
 for(const path of ['/admin','/admin.html','/api/v1/admin/bootstrap','/api/v1/branding'])expect((await page.request.get(`${instance.url}${path}`)).status()).toBe(404);
 expect((await(await page.request.get(`${instance.url}/site.webmanifest`)).json()).name).toBe('Unicore');
 await instance.restart();await page.reload();await expect(page.getByText('仅当前客户端',{exact:true})).toBeVisible();
});
