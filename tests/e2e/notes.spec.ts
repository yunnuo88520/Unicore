// Author: yunnuo <ymz@ebox.vip>
// Description: Shared note dialogs run against real Go/SQLite on desktop-sized and 375px browser pages.
import {mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chooseOption,test,expect,installStandalone,sdkClient} from './fixtures';

test('persistent standalone notes, modal CRUD, filtering and concurrency',async({page,instance},info)=>{
 await installStandalone(instance);await page.goto(`${instance.url}/notes`);
 await expect(page.getByRole('heading',{name:'个人笔记',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'新建笔记',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'新建笔记',exact:true});
 await expect(dialog.getByRole('textbox',{name:'标题',exact:true})).toBeFocused();
 await dialog.getByRole('textbox',{name:'标题',exact:true}).fill('跨形态业务样板');await dialog.getByRole('textbox',{name:'正文',exact:true}).fill('重启后仍然保留的数据。');
 const directory=`build/acceptance/developer-kit/${info.project.name}`;await mkdir(directory,{recursive:true});
 for(const theme of ['light','dark']){
  if(await page.locator('html').getAttribute('data-theme')!==theme){
   await dialog.getByRole('button',{name:'取消',exact:true}).click();
   await page.getByRole('button',{name:'切换主题',exact:true}).click();
   await page.getByRole('button',{name:'新建笔记',exact:true}).click();
   dialog=page.getByRole('dialog',{name:'新建笔记',exact:true});
   await dialog.getByRole('textbox',{name:'标题',exact:true}).fill('跨形态业务样板');await dialog.getByRole('textbox',{name:'正文',exact:true}).fill('重启后仍然保留的数据。');
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await page.screenshot({path:`${directory}/note-dialog-${theme}.png`,fullPage:true,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'跨形态业务样板',exact:true})).toBeVisible();
 await instance.restart();await page.reload();await expect(page.getByText('重启后仍然保留的数据。',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'编辑 跨形态业务样板',exact:true}).click();dialog=page.getByRole('dialog',{name:'编辑笔记',exact:true});
 const rows=(await(await instance.request.get('/api/v1/notes')).json()).data;
 const note=rows.items[0];expect((await instance.request.put(`/api/v1/notes/${note.id}`,{data:{title:note.title,body:'另一窗口的更新',status:'done',attachment_ids:[],version:note.version}})).status()).toBe(200);
 await dialog.getByRole('textbox',{name:'正文',exact:true}).fill('旧窗口不应覆盖');await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(dialog.locator('.note-form').getByText('笔记已被修改，请重新打开后再保存',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'取消',exact:true}).click();await page.reload();await expect(page.getByText('另一窗口的更新',{exact:true})).toBeVisible();
 await chooseOption(page,'笔记状态','进行中');await expect(page.getByText('没有符合条件的笔记',{exact:true})).toBeVisible();await chooseOption(page,'笔记状态','已完成');
 await page.getByRole('button',{name:'编辑 跨形态业务样板',exact:true}).click();dialog=page.getByRole('dialog',{name:'编辑笔记',exact:true});await dialog.getByRole('textbox',{name:'标题',exact:true}).fill('完整业务链路');await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'删除 完整业务链路',exact:true}).click();dialog=page.getByRole('dialog',{name:'删除笔记',exact:true});await dialog.getByRole('button',{name:'确认删除',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText('没有符合条件的笔记',{exact:true})).toBeVisible();
});

test('administrator note attachment stays private across client/admin realms',async({page,instance},info)=>{
 const response=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});expect(response.status()).toBe(200);
 await page.goto(`${instance.url}/admin/notes`);await page.getByRole('button',{name:'新建笔记',exact:true}).click();let dialog=page.getByRole('dialog',{name:'新建笔记',exact:true});await dialog.getByRole('textbox',{name:'标题',exact:true}).fill('带附件的管理员笔记');
 await dialog.getByRole('button',{name:'上传文件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传文件',exact:true});await upload.getByLabel('选择文件').setInputFiles({name:'note-attachment.txt',mimeType:'text/plain',buffer:Buffer.from('note private attachment')});await upload.getByRole('button',{name:'开始上传',exact:true}).click();await expect(upload).toHaveCount(0);
 await expect(dialog.getByRole('textbox',{name:'标题',exact:true})).toHaveValue('带附件的管理员笔记');await expect(dialog.getByText('note-attachment.txt',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:/附件 1/}).click();
 const directory=`build/acceptance/developer-kit/${info.project.name}`;await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/platform-notes.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const shared = await page.request.get(`${instance.url}/api/v1/notes`);expect(shared.status()).toBe(200);expect((await shared.json()).data.items.some((note:{title:string})=>note.title==='带附件的管理员笔记')).toBe(true);
 await instance.restart();await page.reload();await expect(page.getByRole('heading',{name:'带附件的管理员笔记',exact:true})).toBeVisible();
});

test('ordinary member uploads an avatar and note attachment without file management grants',async({page,instance},info)=>{
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 const admin=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;const headers={'X-CSRF-Token':admin.csrf_token};
 expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'member',email:'member@example.test',password:'member-password-strong',role:'user'}})).status()).toBe(200);
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'security.login_captcha',value:'false'}]}})).status()).toBe(200);
 expect((await page.request.post(`${instance.url}/api/v1/auth/login`,{data:{username:'member',password:'member-password-strong',captcha_id:'',captcha_answer:''}})).status()).toBe(200);
 const boot=(await(await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;expect(boot.current_user.permissions.some((point:string)=>point.startsWith('files:'))).toBe(false);
 await page.goto(`${instance.url}/account`);await page.getByRole('button',{name:'上传头像',exact:true}).click();let upload=page.getByRole('dialog',{name:'上传头像',exact:true});
 await upload.getByLabel('选择文件').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
 await upload.getByRole('button',{name:'开始上传',exact:true}).click();await expect(upload).toHaveCount(0);await page.getByRole('button',{name:'保存个人资料',exact:true}).click();await expect(page.getByText('个人资料已保存',{exact:true})).toBeVisible();await page.reload();await expect(page.getByAltText('当前头像')).toBeVisible();
 await page.goto(`${instance.url}/notes`);await page.getByRole('button',{name:'新建笔记',exact:true}).click();const note=page.getByRole('dialog',{name:'新建笔记',exact:true});await note.getByRole('textbox',{name:'标题',exact:true}).fill('普通用户附件');
 await note.getByRole('button',{name:'上传文件',exact:true}).click();upload=page.getByRole('dialog',{name:'上传文件',exact:true});await upload.getByLabel('选择文件').setInputFiles({name:'member-note.txt',mimeType:'text/plain',buffer:Buffer.from('member-owned attachment')});await upload.getByRole('button',{name:'开始上传',exact:true}).click();await expect(upload).toHaveCount(0);await note.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(note).toHaveCount(0);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:/附件 1/}).click();expect((await download).suggestedFilename()).toBe('member-note.txt');
 expect((await page.request.get(`${instance.url}/api/v1/files`)).status()).toBe(403);expect((await page.request.get(`${instance.url}/api/v1/admin/storage/locations`)).status()).toBe(403);
 await instance.restart();await page.reload();await expect(page.getByRole('heading',{name:'普通用户附件',exact:true})).toBeVisible();
 const directory=`build/acceptance/business-files/${info.project.name}`;await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/member.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('standalone note attachment uploads, downloads and survives restart',async({page,instance},info)=>{
 await installStandalone(instance);await page.goto(`${instance.url}/notes`);await page.getByRole('button',{name:'新建笔记',exact:true}).click();const note=page.getByRole('dialog',{name:'新建笔记',exact:true});await note.getByRole('textbox',{name:'标题',exact:true}).fill('本地附件');
 await note.getByRole('button',{name:'上传文件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传文件',exact:true});await upload.getByLabel('选择文件').setInputFiles({name:'local-note.txt',mimeType:'text/plain',buffer:Buffer.from('local attachment')});await upload.getByRole('button',{name:'开始上传',exact:true}).click();await expect(upload).toHaveCount(0);await note.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(note).toHaveCount(0);
 await instance.restart();await page.reload();await expect(page.getByRole('heading',{name:'本地附件',exact:true})).toBeVisible();const download=page.waitForEvent('download');await page.getByRole('button',{name:/附件 1/}).click();expect((await download).suggestedFilename()).toBe('local-note.txt');
 const directory=`build/acceptance/business-files/${info.project.name}`;await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/standalone.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('standalone resumes a persisted partial attachment from the note editor',async({page,instance})=>{
 await installStandalone(instance);
 const client=sdkClient(instance.url,'user');
 const payload=Buffer.alloc(8*1024*1024+4,97),fingerprint=createHash('sha256').update(payload).digest('hex');
 const session=await client.call('notesCreateMultipartUpload',{original_name:'paused-note.txt',mime_type:'text/plain',size:payload.length,fingerprint});
 const grant=await client.call('notesSignUploadPart',{number:1},{params:{id:session.file.file_id}});
 expect((await instance.request.put(grant.url,{headers:grant.headers,data:payload.subarray(0,session.part_size)})).status()).toBe(200);
 await instance.restart();await page.goto(`${instance.url}/notes`);await page.getByRole('button',{name:'新建笔记',exact:true}).click();const note=page.getByRole('dialog',{name:'新建笔记',exact:true});
 await note.getByRole('textbox',{name:'标题',exact:true}).fill('重启后继续附件');await note.getByRole('button',{name:'继续上传 paused-note.txt',exact:true}).click();
 const upload=page.getByRole('dialog',{name:'继续上传',exact:true});await upload.getByLabel('选择文件').setInputFiles({name:'paused-note.txt',mimeType:'text/plain',buffer:payload});await upload.getByRole('button',{name:'继续上传',exact:true}).click();await expect(upload).toHaveCount(0);
 await note.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(note).toHaveCount(0);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:/附件 1/}).click();const downloaded=await pending;
 expect(createHash('sha256').update(await readFile((await downloaded.path())!)).digest('hex')).toBe(fingerprint);
});
