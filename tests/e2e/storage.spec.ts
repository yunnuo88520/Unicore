// Author: yunnuo <ymz@ebox.vip>
// Description: Real platform pages exercise local/private uploads and opt-in MinIO browser direct uploads.
import {test,expect,navigate} from './fixtures';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import type {Page} from '@playwright/test';
test.use({trace:'off'}); // Configured secrets and signed bearer URLs must not enter persisted traces.
async function install(instance:{url:string;token:string;request:import('@playwright/test').APIRequestContext}){
 const res=await instance.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});expect(res.status()).toBe(200);
}
async function nav(page:Page,name:string,_mobile:boolean){await navigate(page,name);}
 async function upload(page:Page,name:string,content:string|Buffer){await page.getByRole('button',{name:'上传文件',exact:true}).click();const dialog=page.getByRole('dialog',{name:'上传文件',exact:true});await dialog.getByLabel('选择文件').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(content)});await dialog.getByRole('button',{name:'开始上传',exact:true}).click();await expect(dialog).toHaveCount(0,{timeout:60000});await expect(page.getByRole('cell').filter({hasText:name}).first()).toBeVisible();}

test('local file pages, policies, private download, permissions and restart',async({page,instance,browser},info)=>{
 await install({...instance,request:page.request});await page.goto(`${instance.url}/admin/storage`);const mobile=info.project.name==='mobile';
 const choices=page.getByRole('group',{name:'存储方式',exact:true});await expect(choices.getByRole('button')).toHaveCount(5);
 await expect(page.getByLabel('全局默认',{exact:true})).toContainText('本地存储');
 await choices.getByRole('button',{name:'MinIO',exact:true}).click();await expect(page.getByRole('form',{name:'存储配置',exact:true}).getByLabel('Endpoint',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'测试连接',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'新增存储位置',exact:true})).toHaveCount(0);await expect(page.getByLabel('位置名称',{exact:true})).toHaveCount(0);
 await choices.getByRole('button',{name:'本地存储',exact:true}).click();await expect(page.getByRole('button',{name:'设为全局默认',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'上传规则',exact:true}).click();await page.getByLabel('单文件上限（MiB）').fill('20');
 await page.getByLabel('自定义上传路径',{exact:true}).fill('../invalid');await page.getByRole('button',{name:'添加',exact:true}).click();await expect(page.getByRole('alert')).toContainText('请输入相对路径');
 for(const path of ['documents','archives/2026']){await page.getByLabel('自定义上传路径',{exact:true}).fill(path);await page.getByRole('button',{name:'添加',exact:true}).click();}
 await page.getByRole('button',{name:'移除路径 archives/2026',exact:true}).click();await expect(page.getByRole('button',{name:'移除路径 archives/2026',exact:true})).toHaveCount(0);await page.getByLabel('自定义上传路径',{exact:true}).fill('archives/2026');await page.getByRole('button',{name:'添加',exact:true}).click();await page.getByLabel('允许的文件扩展名',{exact:true}).fill('txt\ntar.gz');await page.getByRole('tab',{name:'存储配置',exact:true}).click();await page.getByRole('tab',{name:'上传规则',exact:true}).click();await expect(page.getByLabel('允许的文件扩展名',{exact:true})).toHaveValue('txt\ntar.gz');await page.getByRole('button',{name:'保存上传规则',exact:true}).click();await expect(page.getByText('文件策略已保存',{exact:true})).toBeVisible();
 const dir=`build/acceptance/storage/${info.project.name}`;await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/upload-rules.png`,fullPage:true,animations:'disabled'});
 for(const theme of ['light','dark']){await page.evaluate(t=>localStorage.setItem('unicore.preferences.v1',JSON.stringify({...JSON.parse(localStorage.getItem('unicore.preferences.v1')??'{}'),theme:t})),theme);await page.reload();await page.getByRole('tab',{name:'存储配置',exact:true}).click();await expect(choices.getByRole('button',{name:'本地存储',exact:true})).toHaveAttribute('aria-pressed','true');await page.screenshot({path:`${dir}/storage-${theme}.png`,fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await nav(page,'文件管理',mobile);
 await page.getByRole('button',{name:'上传文件',exact:true}).click();let restricted=page.getByRole('dialog',{name:'上传文件',exact:true});await expect(restricted.getByLabel('上传路径',{exact:true})).toHaveValue('documents');await restricted.getByLabel('上传路径',{exact:true}).selectOption('archives/2026');await restricted.getByLabel('选择文件').setInputFiles({name:'blocked.exe',mimeType:'application/octet-stream',buffer:Buffer.from('blocked')});await expect(restricted.getByRole('button',{name:'开始上传',exact:true})).toBeDisabled();await expect(restricted.getByText('文件扩展名不在允许列表中')).toBeVisible();await page.keyboard.press('Escape');
 await upload(page,'local-private.txt','private local bytes');
 await page.getByRole('checkbox',{name:'选择 local-private.txt',exact:true}).check();await page.getByRole('button',{name:'批量迁移',exact:true}).click();const batch=page.getByRole('dialog',{name:'批量迁移文件',exact:true});await batch.getByLabel('目标存储位置').selectOption('local');await batch.getByRole('button',{name:'开始迁移',exact:true}).click();await expect(batch.getByText('已处理 1 / 1，成功或跳过 1，失败 0',{exact:true})).toBeVisible();await batch.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByText('已选择 0 个文件',{exact:true})).toBeVisible();
 await page.screenshot({path:`${dir}/files.png`,fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载 local-private.txt',exact:true}).click();expect((await download).suggestedFilename()).toBe('local-private.txt');
 await instance.restart();await page.reload();await expect(page.getByRole('button',{name:'下载 local-private.txt',exact:true})).toBeVisible();
 const adminHeaders={};const bootstrap=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`,{headers:adminHeaders})).json()).data;const headers={...adminHeaders,'X-CSRF-Token':bootstrap.csrf_token};
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'security.login_captcha',value:'false'}]}})).status()).toBe(200);
 expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'filereader',email:'filereader@example.test',password:'test-password-strong',role:'user'}})).status()).toBe(200);
 const other=await browser.newContext();const login=await other.request.post(`${instance.url}/api/v1/auth/login`,{data:{username:'filereader',password:'test-password-strong',captcha_id:'',captcha_answer:''}});expect(login.status()).toBe(200);const session=(await login.json()).data;
 const list=(await(await page.request.get(`${instance.url}/api/v1/admin/files`,{headers:adminHeaders})).json()).data;const id=list.items[0].file_id;
 expect((await other.request.get(`${instance.url}/api/v1/admin/storage/locations`)).status()).toBe(403);
 expect((await other.request.post(`${instance.url}/api/v1/files/${id}/access`,{headers:{'X-CSRF-Token':session.csrf_token}})).status()).toBe(404);
 expect((await other.request.delete(`${instance.url}/api/v1/files/${id}`,{headers:{'X-CSRF-Token':session.csrf_token}})).status()).toBe(404);
 const member=await other.newPage();await member.goto(`${instance.url}/storage`);await expect(member.getByText('没有访问权限',{exact:true})).toBeVisible();await other.close();
 await page.getByRole('button',{name:'删除 local-private.txt',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByText('还没有文件',{exact:true})).toBeVisible();
});

test('one saved configuration per provider, validation and activation guard',async({page,instance},info)=>{
 await install({...instance,request:page.request});await page.goto(`${instance.url}/admin/storage?provider=minio`);
 const form=page.getByRole('form',{name:'存储配置',exact:true});await form.getByRole('button',{name:'保存配置',exact:true}).click();await expect(form.getByText('此项为必填').first()).toBeVisible();await page.reload();
 for(const [label,value] of [['Endpoint','http://127.0.0.1:1'],['Bucket','unicore-test'],['Access Key','fixture-access'],['Secret Key','fixture-secret']])await form.getByLabel(label,{exact:true}).fill(value);
 await form.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.getByText('存储配置已保存',{exact:true})).toBeVisible();
 await expect(form.getByLabel('Secret Key',{exact:true})).toHaveValue('');await expect(form.getByLabel('Access Key',{exact:true})).toHaveValue('');await expect(form.getByLabel('Endpoint',{exact:true})).toHaveAttribute('readonly','');
 await expect(page.getByRole('button',{name:'设为全局默认',exact:true})).toBeDisabled();
 await form.getByLabel('Secret Key',{exact:true}).fill('fixture-rotated');const updated=page.waitForResponse(response=>response.request().method()==='PUT'&&response.url().includes('/storage/locations/'));await form.getByRole('button',{name:'保存配置',exact:true}).click();expect((await updated).status()).toBe(200);
 await page.reload();await expect(form.getByLabel('Bucket',{exact:true})).toHaveValue('unicore-test');
 const result=await page.request.get(`${instance.url}/api/v1/admin/storage/locations`);const data=(await result.json()).data;expect(data.items.filter((item:{provider:string})=>item.provider==='minio')).toHaveLength(1);expect(data.active_id).toBe('local');
 await page.getByRole('button',{name:'测试连接',exact:true}).click();await expect(page.getByRole('button',{name:'测试连接',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'设为全局默认',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'切换语言',exact:true}).click();await page.getByRole('menuitemradio',{name:'English',exact:true}).click();await page.evaluate(()=>localStorage.setItem('unicore.preferences.v1',JSON.stringify({...JSON.parse(localStorage.getItem('unicore.preferences.v1')??'{}'),theme:'dark'})));await page.reload();await expect(page.getByRole('heading',{name:'MinIO',exact:true})).toBeVisible();
 const dir=`build/acceptance/storage/${info.project.name}`;await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/minio-single-en-dark.png`,fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('MinIO configuration, CORS, browser direct upload and migration',async({page,instance},info)=>{
 test.skip(!process.env.UNICORE_TEST_MINIO_ENDPOINT,'MinIO environment not provided');test.setTimeout(90000);
 const prefix=`unicore-browser-${info.project.name}-${Date.now()}`;execFileSync('build/bin/storagefixture',['prepare']);
 try {
 await install({...instance,request:page.request});await page.goto(`${instance.url}/admin/storage?provider=minio`);const mobile=info.project.name==='mobile';const modal=page.getByRole('form',{name:'存储配置',exact:true});
 await modal.getByLabel('Endpoint',{exact:true}).fill(process.env.UNICORE_TEST_MINIO_ENDPOINT!);await modal.getByLabel('Bucket',{exact:true}).fill(process.env.UNICORE_TEST_MINIO_BUCKET!);await modal.getByLabel('对象前缀').fill(prefix);await modal.getByLabel('Access Key',{exact:true}).fill(process.env.UNICORE_TEST_MINIO_ACCESS_KEY!);await modal.getByLabel('Secret Key',{exact:true}).fill(process.env.UNICORE_TEST_MINIO_SECRET_KEY!);await modal.getByRole('button',{name:'保存配置',exact:true}).click();await expect(modal.getByLabel('Secret Key',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'测试连接',exact:true}).first().click();await expect(page.getByText('读写、复制与删除测试通过',{exact:true})).toBeVisible({timeout:35000});await page.getByRole('button',{name:'配置本站跨域',exact:true}).first().click();await expect(page.getByText('本站跨域已就绪',{exact:true})).toBeVisible({timeout:35000});
 await page.getByRole('button',{name:'设为全局默认',exact:true}).first().click();await expect(page.getByLabel('全局默认',{exact:true})).toContainText('MinIO');await page.goto(`${instance.url}/admin/storage`);await expect(page.getByRole('group',{name:'存储方式',exact:true}).getByRole('button',{name:'MinIO',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByLabel('Bucket',{exact:true})).toHaveValue(process.env.UNICORE_TEST_MINIO_BUCKET!);
 const dir=`build/acceptance/storage/${info.project.name}`;await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/minio-config.png`,fullPage:true,animations:'disabled'});
 await nav(page,'基础设置',mobile);await page.getByRole('tab',{name:'品牌图片',exact:true}).click();const brand=page.getByRole('form',{name:'浅色 Logo',exact:true});await brand.locator('input[type="file"]').setInputFiles({name:'brand.png',mimeType:'image/png',buffer:await readFile('assets/brand/icon-64.png')});await brand.getByRole('button',{name:'保存浅色 Logo',exact:true}).click();await expect(page.getByText('图片已保存',{exact:true})).toBeVisible();const brandURL=await brand.locator('img').getAttribute('src');expect(brandURL).toMatch(/^\/brand-assets\//);expect((await page.request.get(instance.url+brandURL)).status()).toBe(200);
 let direct=false;let proxied=false;page.on('request',request=>{if(request.method()==='PUT'&&request.url().startsWith(process.env.UNICORE_TEST_MINIO_ENDPOINT!))direct=true;if(request.method()==='PUT'&&/\/api\/v1\/(admin\/)?files\/multipart\//.test(request.url()))proxied=true;});
 await nav(page,'文件管理',mobile);await upload(page,'cloud-private.txt',Buffer.alloc(8*1024*1024,97));await expect(page.getByRole('cell').filter({hasText:'8.0 MiB'})).toBeVisible();expect(direct).toBe(true);expect(proxied).toBe(false);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载 cloud-private.txt',exact:true}).click();expect((await download).suggestedFilename()).toBe('cloud-private.txt');
 await page.getByRole('button',{name:'迁移 cloud-private.txt',exact:true}).click();await page.getByRole('dialog').getByLabel('目标存储位置').selectOption('local');await page.getByRole('dialog').getByRole('button',{name:'开始迁移',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:60000});await expect(page.getByRole('cell',{name:/local/})).toBeVisible();
 await page.screenshot({path:`${dir}/minio-migrated.png`,fullPage:true,animations:'disabled'});
 } finally {execFileSync('build/bin/storagefixture',['cleanup',prefix]);}
});

for(const provider of ['local','minio','oss','cos'] as const)test(`resumable ${provider}: pause, refresh, restart, mismatch and missing parts only`,async({page,instance},info)=>{
 const cloud=provider!=='local';const env=(key:string)=>process.env[`UNICORE_TEST_${provider.toUpperCase()}_${key}`];const fixtureEnv={...process.env,UNICORE_TEST_STORAGE_PROVIDER:provider};
 test.skip(cloud&&!env('ENDPOINT'),'Storage environment not provided');test.setTimeout(180000);
 const prefix=`unicore-browser-resume-${info.project.name}-${Date.now()}`;
 try{
 await install({...instance,request:page.request});const mobile=info.project.name==='mobile';
 await page.goto(`${instance.url}/admin/storage?provider=${provider}`);
 if(cloud){
  execFileSync('build/bin/storagefixture',['prepare'],{env:fixtureEnv});const modal=page.getByRole('form',{name:'存储配置',exact:true});
  for(const [label,value] of [['Endpoint',env('ENDPOINT')!],['Bucket',env('BUCKET')!],['Region',env('REGION')??''],['对象前缀',prefix],['Access Key',env('ACCESS_KEY')!],['Secret Key',env('SECRET_KEY')!]])await modal.getByLabel(label,{exact:true}).fill(value);
  await modal.getByRole('button',{name:'保存配置',exact:true}).click();await expect(modal.getByLabel('Secret Key',{exact:true})).toHaveValue('');await page.getByRole('button',{name:'测试连接',exact:true}).first().click();await expect(page.getByText('读写、复制与删除测试通过',{exact:true})).toBeVisible({timeout:35000});await page.getByRole('button',{name:'配置本站跨域',exact:true}).first().click();await expect(page.getByText('本站跨域已就绪',{exact:true})).toBeVisible({timeout:35000});await page.getByRole('button',{name:'设为全局默认',exact:true}).first().click();await expect(page.getByLabel('全局默认',{exact:true})).toContainText(provider==='minio'?'MinIO':provider==='oss'?'阿里云 OSS':'腾讯云 COS');
 }
 await page.getByRole('tab',{name:'上传规则',exact:true}).click();await page.getByText('分片上传与自动清理',{exact:true}).click();await page.getByLabel('单文件上限（MiB）').fill('20');await page.getByLabel('分片大小（MiB）').fill('5');await page.getByLabel('同时上传分片数').fill('1');await page.getByRole('button',{name:'保存上传规则',exact:true}).click();await expect(page.getByText('文件策略已保存',{exact:true})).toBeVisible();
 await nav(page,'文件管理',mobile);await page.getByRole('button',{name:'上传文件',exact:true}).click();const dialog=page.getByRole('dialog');
 const name='resumable.bin',data=Buffer.alloc(13*1024*1024,97);
 await dialog.getByLabel('选择文件').setInputFiles({name,mimeType:'application/octet-stream',buffer:data});
 let blocked=false;let release:()=>void=()=>{};const waiting=new Promise<void>(resolve=>release=resolve);
 // Pause before a second part is sent, after the first part was durably accepted.
 await page.route('**/files/multipart/*/parts',async route=>{const body=route.request().postDataJSON();if(body.number===2&&!blocked){blocked=true;await waiting;await route.abort().catch(()=>{});}else await route.continue();});
 await dialog.getByRole('button',{name:'开始上传',exact:true}).click();await expect.poll(()=>blocked,{timeout:60000}).toBe(true);
 await dialog.getByRole('button',{name:'暂停上传',exact:true}).click();release();await expect(dialog.getByText('上传已暂停',{exact:true})).toBeVisible();
 await expect(dialog.getByText('已上传 5.0 MiB / 13.0 MiB · 1 / 3 个分片')).toBeVisible();
 const dir=`build/acceptance/multipart/${info.project.name}`;await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/${provider}-paused.png`,fullPage:true,animations:'disabled'});
 await dialog.getByRole('button',{name:'稍后继续',exact:true}).click();await instance.restart();await page.reload();
 await page.getByRole('button',{name:`继续上传 ${name}`,exact:true}).click();const resume=page.getByRole('dialog',{name:'继续上传',exact:true});await expect(resume.getByText('已上传 5.0 MiB / 13.0 MiB · 1 / 3 个分片')).toBeVisible();
 await resume.getByLabel('选择文件').setInputFiles({name,mimeType:'application/octet-stream',buffer:Buffer.alloc(data.length,98)});await resume.getByRole('button',{name:'继续上传',exact:true}).click();await expect(resume.getByRole('alert')).toContainText('请选择原来上传的同一个文件，文件内容不一致');
 const parts:number[]=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/parts'))parts.push(request.postDataJSON().number);});
 await resume.getByLabel('选择文件').setInputFiles({name,mimeType:'application/octet-stream',buffer:data});await resume.getByRole('button',{name:'继续上传',exact:true}).click();await expect(resume).toHaveCount(0,{timeout:60000});expect(parts).toEqual([2,3]);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:`下载 ${name}`,exact:true}).click();const saved=await download;const stream=await saved.createReadStream();const buffers:Buffer[]=[];for await(const chunk of stream!)buffers.push(Buffer.from(chunk));expect(Buffer.concat(buffers)).toEqual(data);
 // English and dark mode use the same modal and policies, with no horizontal overflow.
 await page.evaluate(()=>{const prefs=JSON.parse(localStorage.getItem('unicore.preferences.v1')??'{}');localStorage.setItem('unicore.preferences.v1',JSON.stringify({...prefs,theme:'dark',locale:'en'}));});
 await page.reload();await page.getByRole('button',{name:'Upload file',exact:true}).click();await page.screenshot({path:`${dir}/${provider}-upload-dark.png`,fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.keyboard.press('Escape');await page.goto(`${instance.url}/admin/storage?tab=rules`);await page.getByText('Multipart uploads and cleanup',{exact:true}).click();await expect(page.getByLabel('Part size (MiB)')).toHaveValue('5');await page.screenshot({path:`${dir}/${provider}-policy-en-dark.png`,fullPage:true,animations:'disabled'});
 }finally{if(cloud)execFileSync('build/bin/storagefixture',['cleanup',prefix,instance.url],{env:fixtureEnv});}
});
