// Author: yunnuo <ymz@ebox.vip>
// Description: Shared note dialogs run against real Go/SQLite on desktop-sized and 375px browser pages.
import {mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chooseOption,test,expect,installPlatform,installStandalone,loginClient,adminLogin,openPersonalCenter,sdkClient} from './fixtures';

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

test('administrator manages their own note attachments from personal notes',async({page,instance},info)=>{
 const response=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});expect(response.status()).toBe(200);
 await page.goto(`${instance.url}/notes`);await page.getByRole('button',{name:'新建笔记',exact:true}).click();let dialog=page.getByRole('dialog',{name:'新建笔记',exact:true});await dialog.getByRole('textbox',{name:'标题',exact:true}).fill('带附件的管理员笔记');
 await dialog.getByRole('button',{name:'上传文件',exact:true}).click();const upload=page.getByRole('dialog',{name:'上传文件',exact:true});await upload.getByLabel('选择文件').setInputFiles({name:'note-attachment.txt',mimeType:'text/plain',buffer:Buffer.from('note private attachment')});await upload.getByRole('button',{name:'开始上传',exact:true}).click();await expect(upload).toHaveCount(0);
 await expect(dialog.getByRole('textbox',{name:'标题',exact:true})).toHaveValue('带附件的管理员笔记');await expect(dialog.getByText('note-attachment.txt',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:/附件 1/}).click();
 const directory=`build/acceptance/developer-kit/${info.project.name}`;await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/platform-notes.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const shared = await page.request.get(`${instance.url}/api/v1/notes`);expect(shared.status()).toBe(200);expect((await shared.json()).data.items.some((note:{title:string})=>note.title==='带附件的管理员笔记')).toBe(true);
 await instance.restart();await page.reload();await expect(page.getByRole('heading',{name:'带附件的管理员笔记',exact:true})).toBeVisible();
});

test('notes have distinct personal and management pages and menu assignments', async ({ page, instance }, info) => {
  await installPlatform(instance);
  const owner = sdkClient(instance.url);
  await loginClient(owner, 'admin', 'administrator-password-strong');
  const member = await owner.createUser({ username: 'notesmember', email: 'notesmember@example.test', password: 'member-password-strong', role: 'user' });
  const author = sdkClient(instance.url, 'user');
  await loginClient(author, member.username, 'member-password-strong');
  await author.saveAccountProfile({ display_name: '笔记作者' });
  await author.createNote({ title: 'Member private note', body: 'Member private content', status: 'done' });
  await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
  const actor = (await (await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
  expect((await page.request.post(`${instance.url}/api/v1/notes`, { headers: { 'X-CSRF-Token': actor.csrf_token }, data: { title: 'Owner personal note', body: '', status: 'open' } })).status()).toBe(200);
  await page.goto(`${instance.url}/notes`);
  await expect(page.getByRole('heading', { name: 'Owner personal note' })).toBeVisible();
  await expect(page.getByText('Member private note')).toHaveCount(0);
  await page.goto(`${instance.url}/admin/note-management`);
  await expect(page.getByRole('heading', { name: '笔记管理', exact: true })).toBeVisible();
  const actions = page.getByRole('button', { name: '笔记操作：Member private note', exact: true });
  const authorCell = info.project.name === 'mobile'
    ? page.getByRole('cell', { name: /Member private note 笔记作者/ })
    : page.getByRole('cell', { name: '笔记作者 notesmember', exact: true });
  await expect(authorCell).toBeVisible();
  await expect(actions).toBeInViewport();
  expect(await page.getByRole('table').evaluate(table => table.getBoundingClientRect().width <= table.parentElement!.clientWidth + 1)).toBe(true);
  await expect(page.getByText('Member private note', { exact: true })).toBeVisible();
  await expect(page.getByText(member.id, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Member private content')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新建笔记' })).toHaveCount(0);
  const evidence = `build/acceptance/admin-page-alignment/${info.project.name}`;
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/note-management.png`, animations: 'disabled' });
  const columnSettings = page.getByRole('button', { name: '列设置', exact: true });
  await expect(columnSettings).toBeVisible();
  await columnSettings.click();
  const authorColumn = page.getByRole('checkbox', { name: '作者', exact: true });
  await expect(authorColumn).toBeChecked();
  await authorColumn.click();
  await expect(authorColumn).not.toBeChecked();
  await expect(page.getByRole('table').getByText('笔记作者', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(actions).toBeVisible();
  await expect(page.getByRole('table').getByText('笔记作者', { exact: true })).toHaveCount(0);
  await columnSettings.click();
  await expect(authorColumn).not.toBeChecked();
  await authorColumn.click();
  await expect(authorColumn).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(authorCell).toBeVisible();
  await chooseOption(page, '笔记状态', '待处理');
  await expect(page.getByText('共 1 条', { exact: true })).toBeVisible();
  await expect(page.getByText('Owner personal note', { exact: true })).toBeVisible();
  await expect(authorCell).toHaveCount(0);
  await chooseOption(page, '笔记状态', '全部状态');
  await expect(authorCell).toBeVisible();
  const search = page.getByRole('searchbox', { name: '搜索标题或作者' });
  await expect(page.getByRole('button', { name: '筛选', exact: true })).toHaveCount(0);
  await search.pressSequentially('Owner personal');
  await expect(authorCell).toHaveCount(0);
  await expect(page.getByText('Owner personal note', { exact: true })).toBeVisible();
  await search.fill('  笔记作者  ');
  await expect(page.getByText('Owner personal note', { exact: true })).toHaveCount(0);
  await expect(authorCell).toBeVisible();
  await expect(page.getByText('筛选结果', { exact: true })).toBeVisible();
  await chooseOption(page, '笔记状态', '待处理');
  await expect(page.getByText('没有符合条件的笔记')).toBeVisible();
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByText('Owner personal note', { exact: true })).toBeVisible();
  await expect(authorCell).toHaveCount(0);
  await chooseOption(page, '笔记状态', '全部状态');
  await expect(authorCell).toBeVisible();
  await search.fill('笔记作者');
  await expect(page.getByText('Owner personal note', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Note management', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search by title or author' })).toHaveValue('笔记作者');
  await chooseOption(page, 'Note status', 'Completed');
  await expect(authorCell).toBeVisible();
  const columnsButton = page.getByRole('button', { name: 'Column settings', exact: true });
  const controls = await Promise.all([page.getByRole('searchbox', { name: 'Search by title or author' }).boundingBox(), page.getByRole('combobox', { name: 'Note status' }).boundingBox(), columnsButton.boundingBox()]);
  const [authorField, statusField, columns] = controls.map(box => { expect(box).not.toBeNull(); return box!; });
  if (info.project.name === 'chromium') expect(Math.abs(authorField.y - statusField.y)).toBeLessThan(2);
  for (const box of [authorField, statusField, columns]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await columnsButton.click();
  await expect(page.getByText('Visible columns', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidence}/note-management-en-dark.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Change language', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '中文', exact: true }).click();
  const title = page.getByRole('button', { name: 'Member private note', exact: true });
  await title.click();
  const preview = page.getByRole('dialog', { name: '预览笔记', exact: true });
  await expect(preview.getByText('Member private content', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidence}/note-management-preview.png`, animations: 'disabled' });
  await preview.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(title).toBeFocused();
  await expect(page.getByText('Member private content')).toHaveCount(0);
  await actions.click();
  await page.getByRole('menuitem', { name: '标记为待处理', exact: true }).click();
  const statusDialog = page.getByRole('alertdialog', { name: '修改笔记状态', exact: true });
  await statusDialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.getByText('没有符合条件的笔记')).toBeVisible();
  const myNotes = () => author.listNotes({ page: 1, status: '', search: '', sort: 'updated_at', direction: 'desc' }, 'mine');
  expect((await myNotes()).items[0]).toMatchObject({ status: 'open', body: 'Member private content' });
  await chooseOption(page, '笔记状态', '待处理');
  await actions.click();
  await page.getByRole('menuitem', { name: '编辑笔记', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑笔记', exact: true });
  const titleInput = edit.getByRole('textbox', { name: '标题' });
  const bodyInput = edit.getByRole('textbox', { name: '正文' });
  await expect(titleInput).toBeFocused();
  await expect(bodyInput).toHaveValue('Member private content');
  await titleInput.fill('Member note updated');
  await bodyInput.fill('Edited from management');
  await page.screenshot({ path: `${evidence}/note-management-edit.png`, animations: 'disabled' });
  await edit.getByRole('button', { name: '保存笔记', exact: true }).click();
  await expect(edit).toHaveCount(0);
  expect((await myNotes()).items[0]).toMatchObject({ status: 'open', title: 'Member note updated', body: 'Edited from management' });
  await page.getByRole('button', { name: '笔记操作：Member note updated', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除笔记', exact: true }).click();
  const deleteDialog = page.getByRole('alertdialog', { name: '删除笔记', exact: true });
  await deleteDialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('没有符合条件的笔记')).toBeVisible();
  expect((await myNotes()).items).toHaveLength(0);
  await page.goto(`${instance.url}/admin/menus`);
  await expect(page.getByRole('combobox', { name: '按工作台筛选' })).toHaveText('管理工作台');
  await expect(page.getByRole('button', { name: '分配角色：笔记管理' })).toBeVisible();
  await expect(page.getByRole('button', { name: '分配角色：我的笔记' })).toHaveCount(0);
  await expect(page.getByText('当前账号侧栏：已显示', { exact: true }).first()).toBeVisible();
  await chooseOption(page, '按工作台筛选', '用户工作台');
  await expect(page.getByRole('button', { name: '分配角色：我的笔记' })).toBeVisible();
  await expect(page.getByRole('button', { name: '分配角色：笔记管理' })).toHaveCount(0);
});

test('ordinary member uploads an avatar and note attachment without file management grants',async({page,instance},info)=>{
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 const admin=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;const headers={'X-CSRF-Token':admin.csrf_token};
 expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'member',email:'member@example.test',password:'member-password-strong',role:'user'}})).status()).toBe(200);
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'security.login_captcha',value:'false'}]}})).status()).toBe(200);
 expect((await page.request.post(`${instance.url}/api/v1/auth/login`,{data:{username:'member',password:'member-password-strong',captcha_id:'',captcha_answer:''}})).status()).toBe(200);
 const boot=(await(await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;expect(boot.current_user.permissions.some((point:string)=>point.startsWith('files:'))).toBe(false);
 await page.goto(`${instance.url}/`);
 const memberCenter=await openPersonalCenter(page);await memberCenter.getByRole('button',{name:'上传头像',exact:true}).click();let upload=page.getByRole('dialog',{name:'上传头像',exact:true});
 await upload.getByLabel('选择文件').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
 await upload.getByRole('button',{name:'开始上传',exact:true}).click();await expect(upload).toHaveCount(0);await expect(page.getByText('已保存',{exact:true})).toBeVisible();await page.reload();await openPersonalCenter(page);await expect(page.getByRole('img',{name:'当前头像'})).toBeVisible();
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
