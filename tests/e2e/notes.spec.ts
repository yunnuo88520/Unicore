// Author: yunnuo <ymz@ebox.vip>
// Description: Shared note dialogs run against real Go/SQLite on desktop-sized and 375px browser pages.
import {mkdir} from 'node:fs/promises';
import {test,expect,installStandalone} from './fixtures';

test('persistent standalone notes, modal CRUD, filtering and concurrency',async({page,instance},info)=>{
 await installStandalone(instance);await page.goto(`${instance.url}/#notes`);
 await expect(page.getByRole('heading',{name:'个人笔记',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'新建笔记',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'新建笔记',exact:true});
 await expect(dialog.getByRole('textbox',{name:'标题',exact:true})).toBeFocused();
 await dialog.getByRole('textbox',{name:'标题',exact:true}).fill('跨形态业务样板');await dialog.getByRole('textbox',{name:'正文',exact:true}).fill('重启后仍然保留的数据。');
 const directory=`build/acceptance/developer-kit/${info.project.name}`;await mkdir(directory,{recursive:true});
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:`${directory}/note-dialog-${theme}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'跨形态业务样板',exact:true})).toBeVisible();
 await instance.restart();await page.reload();await expect(page.getByText('重启后仍然保留的数据。',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'编辑 跨形态业务样板',exact:true}).click();dialog=page.getByRole('dialog',{name:'编辑笔记',exact:true});
 const rows=(await(await instance.request.get('/api/v1/notes')).json()).data;
 const note=rows.items[0];expect((await instance.request.put(`/api/v1/notes/${note.id}`,{data:{title:note.title,body:'另一窗口的更新',status:'done',attachment_ids:[],version:note.version}})).status()).toBe(200);
 await dialog.getByRole('textbox',{name:'正文',exact:true}).fill('旧窗口不应覆盖');await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(dialog.locator('.note-form').getByText('笔记已被修改，请重新打开后再保存',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'取消',exact:true}).click();await page.reload();await expect(page.getByText('另一窗口的更新',{exact:true})).toBeVisible();
 await page.getByLabel('笔记状态',{exact:true}).selectOption('open');await expect(page.getByText('没有符合条件的笔记',{exact:true})).toBeVisible();await page.getByLabel('笔记状态',{exact:true}).selectOption('done');
 await page.getByRole('button',{name:'编辑 跨形态业务样板',exact:true}).click();dialog=page.getByRole('dialog',{name:'编辑笔记',exact:true});await dialog.getByRole('textbox',{name:'标题',exact:true}).fill('完整业务链路');await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'删除 完整业务链路',exact:true}).click();dialog=page.getByRole('dialog',{name:'删除笔记',exact:true});await dialog.getByRole('button',{name:'确认删除',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText('没有符合条件的笔记',{exact:true})).toBeVisible();
});

test('administrator note attachment stays private across client/admin realms',async({page,instance},info)=>{
 const response=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});expect(response.status()).toBe(200);
 await page.goto(`${instance.url}/admin#files`);await page.getByRole('button',{name:'上传文件',exact:true}).click();let dialog=page.getByRole('dialog',{name:'上传文件',exact:true});await dialog.getByLabel('选择文件').setInputFiles({name:'note-attachment.txt',mimeType:'text/plain',buffer:Buffer.from('note private attachment')});await dialog.getByRole('button',{name:'开始上传',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.goto(`${instance.url}/admin#notes`);await page.getByRole('button',{name:'新建笔记',exact:true}).click();dialog=page.getByRole('dialog',{name:'新建笔记',exact:true});await dialog.getByRole('textbox',{name:'标题',exact:true}).fill('带附件的管理员笔记');await expect(dialog.getByLabel('添加已有附件').locator('option').filter({hasText:'note-attachment.txt'})).toHaveCount(1);await dialog.getByLabel('添加已有附件').selectOption({label:'note-attachment.txt'});await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:/附件 1/}).click();
 const directory=`build/acceptance/developer-kit/${info.project.name}`;await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/platform-notes.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await page.request.get(`${instance.url}/api/v1/notes`)).status()).toBe(401);
 await instance.restart();await page.reload();await expect(page.getByRole('heading',{name:'带附件的管理员笔记',exact:true})).toBeVisible();
});
