// Author: yunnuo <ymz@ebox.vip>
// Description: Real two-realm announcement management, user dashboard, bilingual business content and local exclusion.
import {mkdir} from 'node:fs/promises';
import {test,expect,installStandalone} from './fixtures';

test('announcements: modal CRUD, scheduling, member feed, switch, dark English and restart',async({page,browser,instance},info)=>{
 test.setTimeout(120000);
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 const meta=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data,headers={'X-CSRF-Token':meta.csrf_token};
 expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'member',email:'member@example.test',password:'test-password-strong',role:'user'}})).status()).toBe(200);
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'security.login_captcha',value:'false'}]}})).status()).toBe(200);
 await page.goto(`${instance.url}/admin#announcements`);await expect(page.getByRole('switch',{name:'公告展示',exact:true})).toBeChecked();await expect(page.getByText('暂无公告',{exact:true})).toBeVisible();
 const screenshot=async(name:string,target=page)=>{await mkdir(`build/acceptance/announcements/${info.project.name}`,{recursive:true});await target.evaluate(()=>window.scrollTo(0,0));await target.screenshot({path:`build/acceptance/announcements/${info.project.name}/${name}.png`});expect(await target.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);};
 const userContext=await browser.newContext({viewport:page.viewportSize()!});
 try{
 expect((await userContext.request.post(`${instance.url}/api/v1/auth/login`,{data:{username:'member',password:'test-password-strong',captcha_id:'',captcha_answer:''}})).status()).toBe(200);
 const user=await userContext.newPage();await user.goto(instance.url);await expect(user.getByText('暂无公告',{exact:true})).toBeVisible();await screenshot('user-empty',user);
 await page.getByRole('button',{name:'新增公告',exact:true}).click();const editor=page.getByRole('dialog',{name:'新增公告',exact:true});
 await editor.getByRole('textbox',{name:'公告内容',exact:true}).fill('## 平台维护通知\n\n欢迎使用 **Unicore**，请查看 [帮助文档](https://example.test/help)。');
 await editor.getByLabel('内部备注',{exact:true}).fill('仅后台可见的内部记录');await editor.getByRole('combobox',{name:'公告类型',exact:true}).selectOption('warning');
 await editor.getByRole('button',{name:'预览',exact:true}).click();await expect(editor.locator('.announcement-preview h2')).toHaveText('平台维护通知');await screenshot('create-modal');
 await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByText('公告已保存',{exact:true})).toBeVisible();await expect(page.locator('.announcement-table tbody tr')).toHaveCount(1);
 const input={content:'草稿不应公开',format:'markdown',type:'info',note:'private',status:'draft',publish_at:Math.floor(Date.now()/1000)};
 const draft=(await(await page.request.post(`${instance.url}/api/v1/admin/announcements`,{headers,data:input})).json()).data;
 const future=(await(await page.request.post(`${instance.url}/api/v1/admin/announcements`,{headers,data:{...input,content:'未来公告不应公开',status:'published',publish_at:Math.floor(Date.now()/1000)+3600}})).json()).data;
 await page.reload();await expect(page.locator('.announcement-table tbody tr')).toHaveCount(3);await screenshot('admin-list');
 await user.reload();const card=user.getByRole('article',{name:'平台公告',exact:true});await expect(card.getByText(/平台维护通知/)).toBeVisible();await expect(card.getByText('草稿不应公开')).toHaveCount(0);await expect(card.getByText('未来公告不应公开')).toHaveCount(0);await expect(user.getByRole('button',{name:'平台公告',exact:true})).toHaveCount(0);
 await card.locator('.announcement-feed-item').click();const detail=user.getByRole('dialog',{name:'公告详情',exact:true});await expect(detail.getByRole('heading',{name:'平台维护通知',exact:true})).toBeVisible();await expect(detail.getByRole('link',{name:'帮助文档',exact:true})).toHaveAttribute('href','https://example.test/help');await expect(detail).not.toContainText('仅后台可见的内部记录');await screenshot('user-detail',user);await user.keyboard.press('Escape');await screenshot('user-dashboard',user);
 for(const endpoint of ['announcements','announcements/settings'])expect((await userContext.request.get(`${instance.url}/api/v1/admin/${endpoint}`)).status()).toBe(403);
 for(const id of [draft.id,future.id])expect((await userContext.request.get(`${instance.url}/api/v1/announcements/${id}`)).status()).toBe(404);
 await page.getByRole('switch',{name:'公告展示',exact:true}).uncheck();await expect(page.getByText('公告展示设置已保存',{exact:true})).toBeVisible();await user.reload();await expect(user.getByRole('article',{name:'平台公告',exact:true})).toHaveCount(0);
 await instance.restart();await page.reload();await expect(page.getByRole('switch',{name:'公告展示',exact:true})).not.toBeChecked();await page.getByRole('switch',{name:'公告展示',exact:true}).check();await expect(page.getByText('公告展示设置已保存',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'公告状态',exact:true}).selectOption('draft');await expect(page.locator('.announcement-table tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'编辑公告',exact:true}).click();const edit=page.getByRole('dialog',{name:'编辑公告',exact:true});await edit.getByRole('textbox',{name:'公告内容',exact:true}).fill('中文自定义内容保持原样');await edit.getByRole('combobox',{name:'内容格式',exact:true}).selectOption('html');await edit.getByRole('button',{name:'源代码',exact:true}).click();await edit.getByRole('textbox',{name:'公告内容源代码',exact:true}).fill('<p><strong>中文自定义内容保持原样</strong> <a href="https://example.test/help">查看</a></p>');await edit.getByRole('button',{name:'预览',exact:true}).click();await expect(edit.locator('.announcement-preview strong')).toHaveText('中文自定义内容保持原样');
 await edit.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByText('公告已保存',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'切换语言',exact:true}).click();await page.getByRole('menuitemradio',{name:'English',exact:true}).click();await expect(page.getByRole('heading',{name:'Announcement list',exact:true})).toBeVisible();await expect(page.locator('.announcement-table-content')).toContainText('中文自定义内容保持原样');
 await page.getByRole('button',{name:'Appearance',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Appearance',exact:true});await drawer.locator('.preference-theme').getByRole('button',{name:'Dark',exact:true}).click();await page.keyboard.press('Escape');await screenshot('admin-en-dark');
 await page.getByRole('combobox',{name:'Announcement status',exact:true}).selectOption('');await expect(page.locator('.announcement-table tbody tr')).toHaveCount(3);await page.getByRole('checkbox',{name:'Select this page',exact:true}).check();await page.getByRole('button',{name:/Delete selected/}).click();await page.getByRole('button',{name:'Confirm deletion',exact:true}).click();await expect(page.getByText('No announcements yet',{exact:true})).toBeVisible();
 await user.reload();await expect(user.getByText('暂无公告',{exact:true})).toBeVisible();
 }finally{await userContext.close();}
});

test('local workspace never loads platform announcements',async({page,instance})=>{
 await installStandalone(instance);const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/announcements'))requests.push(r.url());});await page.goto(instance.url);await expect(page.getByRole('heading',{name:/一份核心，无限可能/})).toBeVisible();await expect(page.getByRole('button',{name:'平台公告',exact:true})).toHaveCount(0);await expect(page.getByRole('article',{name:'平台公告',exact:true})).toHaveCount(0);expect(requests).toEqual([]);
});
