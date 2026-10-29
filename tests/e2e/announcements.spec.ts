// Author: yunnuo <ymz@ebox.vip>
// Description: Real two-realm announcement management, user dashboard, bilingual business content and local exclusion.
import {mkdir} from 'node:fs/promises';
import {test,expect,installStandalone} from './fixtures';

test('user announcement ticker stays compact and rotates one item with accessible pause and paging',async({page,instance},info)=>{
 test.setTimeout(120000);
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 const meta=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data,headers={'X-CSRF-Token':meta.csrf_token};
 expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'member',email:'member@example.test',password:'test-password-strong',role:'user'}})).status()).toBe(200);
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'security.login_captcha',value:'false'}]}})).status()).toBe(200);
 const now=Math.floor(Date.now()/1000);
 const contents=['平台维护通知：本周六 02:00–03:00 进行服务升级，期间部分服务可能短暂不可用，请提前保存工作内容。','全新文件管理已上线，欢迎体验更轻松的协作方式。','账户安全提醒：请定期检查登录记录并及时更新密码。','开发者文档已更新，可通过左下角文档入口查看。','第五条平台通知','第六条平台通知','第七条平台通知'];
 for(let i=0;i<contents.length;i++)expect((await page.request.post(`${instance.url}/api/v1/admin/announcements`,{headers,data:{content:contents[i],format:'markdown',type:i===0?'warning':'info',status:'published',note:'',publish_at:now-i}})).status()).toBe(200);
 expect((await page.request.post(`${instance.url}/api/v1/auth/login`,{data:{username:'member',password:'test-password-strong',captcha_id:'',captcha_answer:''}})).status()).toBe(200);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.clock.install();await page.goto(instance.url);
 const ticker=page.locator('.announcement-card'),summary=ticker.locator('.announcement-ticker-summary');
 await expect(summary).toHaveText(contents[0]);await expect(ticker.locator('.announcement-feed-item')).toHaveCount(1);
 expect((await ticker.boundingBox())!.height).toBeLessThanOrEqual(64);
 expect(await ticker.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
 await mkdir(`build/acceptance/announcements/${info.project.name}`,{recursive:true});await page.screenshot({path:`build/acceptance/announcements/${info.project.name}/ticker-default.png`,animations:'disabled'});
 await page.clock.pauseAt(new Date());
 await page.mouse.move(0,0);await page.clock.runFor(5100);await expect(summary).toHaveText(contents[1]);
 await ticker.hover();await page.clock.runFor(10000);await expect(summary).toHaveText(contents[1]);
 await page.mouse.move(0,0);await page.clock.runFor(5100);await expect(summary).toHaveText(contents[2]);
 await ticker.getByRole('button',{name:'暂停公告轮播',exact:true}).click();await page.locator('h1').click();await page.clock.runFor(10000);await expect(summary).toHaveText(contents[2]);
 await ticker.getByRole('button',{name:'继续公告轮播',exact:true}).click();await page.locator('h1').click();await page.clock.runFor(5100);await expect(summary).toHaveText(contents[3]);
 for(const content of [contents[4],contents[5],contents[6],contents[0]]){await ticker.getByRole('button',{name:'下一条公告',exact:true}).click();await expect.poll(async()=>{await page.clock.runFor(50);return summary.textContent();}).toBe(content);}
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('h1').click();await page.clock.runFor(10000);await expect(summary).toHaveText(contents[0]);await expect(ticker.getByRole('button',{name:'暂停公告轮播',exact:true})).toHaveCount(0);await expect(ticker.locator('.announcement-ticker-slide')).toHaveCSS('animation-name','none');
 await ticker.getByRole('button',{name:'下一条公告',exact:true}).click();await expect(summary).toHaveText(contents[1]);
 await page.emulateMedia({reducedMotion:'no-preference'});await ticker.getByRole('button',{name:'暂停公告轮播',exact:true}).click();await page.locator('h1').click();
 const directory=`build/acceptance/announcements/${info.project.name}`;await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/ticker-many.png`,animations:'disabled'});
 await page.getByRole('button',{name:'切换语言',exact:true}).click();await page.getByRole('menuitemradio',{name:'English',exact:true}).click();
 await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.getByRole('dialog',{name:'Appearance',exact:true}).locator('.preference-theme').getByRole('button',{name:'Dark',exact:true}).click();await page.keyboard.press('Escape');
 await expect(summary).toHaveText(contents[1]);await expect(ticker.getByRole('button',{name:'Resume announcements',exact:true})).toBeVisible();expect((await ticker.boundingBox())!.height).toBeLessThanOrEqual(64);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('h1').click();await page.mouse.move(0,0);await page.screenshot({path:`${directory}/ticker-dark-en.png`,animations:'disabled'});
 await page.clock.resume();await page.route('**/api/v1/announcements?*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'INTERNAL_ERROR',message:'temporary test failure'}})}));await page.reload();
 await expect(ticker.getByRole('alert')).toHaveText('Announcements are temporarily unavailable');expect((await ticker.boundingBox())!.height).toBeLessThanOrEqual(64);
 await page.unroute('**/api/v1/announcements?*');await ticker.getByRole('button',{name:'Retry',exact:true}).click();await expect(summary).toHaveText(contents[0]);
});

test('announcements: modal CRUD, scheduling, member feed, switch, dark English and restart',async({page,browser,instance},info)=>{
 test.setTimeout(120000);
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 const meta=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data,headers={'X-CSRF-Token':meta.csrf_token};
 expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'member',email:'member@example.test',password:'test-password-strong',role:'user'}})).status()).toBe(200);
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'security.login_captcha',value:'false'}]}})).status()).toBe(200);
 await page.goto(`${instance.url}/admin#announcements`);await expect(page.getByRole('switch',{name:'公告展示',exact:true})).toBeChecked();await expect(page.getByText('暂无公告',{exact:true})).toBeVisible();
 const screenshot=async(name:string,target=page)=>{await mkdir(`build/acceptance/announcements/${info.project.name}`,{recursive:true});await target.evaluate(()=>window.scrollTo(0,0));await target.screenshot({path:`build/acceptance/announcements/${info.project.name}/${name}.png`,animations:'disabled'});expect(await target.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);};
 const userContext=await browser.newContext({viewport:page.viewportSize()!});
 try{
 expect((await userContext.request.post(`${instance.url}/api/v1/auth/login`,{data:{username:'member',password:'test-password-strong',captcha_id:'',captcha_answer:''}})).status()).toBe(200);
 const user=await userContext.newPage();await Promise.all([user.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/announcements'&&r.status()===200),user.goto(instance.url)]);await expect(user.getByRole('article',{name:'平台公告',exact:true})).toHaveCount(0);await expect(user.locator('.dashboard-widget')).toBeHidden();await screenshot('user-empty',user);
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
 await expect(card.locator('.announcement-ticker-controls')).toHaveCount(0);await expect(card.locator('.announcement-ticker-slide')).toHaveCSS('animation-name','none');expect((await card.boundingBox())!.height).toBeLessThanOrEqual(64);
 await card.locator('.announcement-feed-item').click();const detail=user.getByRole('dialog',{name:'公告详情',exact:true});await expect(detail.getByRole('heading',{name:'平台维护通知',exact:true})).toBeVisible();await expect(detail.getByRole('link',{name:'帮助文档',exact:true})).toHaveAttribute('href','https://example.test/help');await expect(detail).not.toContainText('仅后台可见的内部记录');await screenshot('user-detail',user);await user.keyboard.press('Escape');await user.locator('h1').click();await screenshot('user-dashboard',user);
 for(const endpoint of ['announcements','announcements/settings'])expect((await userContext.request.get(`${instance.url}/api/v1/admin/${endpoint}`)).status()).toBe(403);
 for(const id of [draft.id,future.id])expect((await userContext.request.get(`${instance.url}/api/v1/announcements/${id}`)).status()).toBe(404);
 await page.getByRole('switch',{name:'公告展示',exact:true}).uncheck();await expect(page.getByText('公告展示设置已保存',{exact:true})).toBeVisible();await user.reload();await expect(user.getByRole('article',{name:'平台公告',exact:true})).toHaveCount(0);
 await instance.restart();await page.reload();await expect(page.getByRole('switch',{name:'公告展示',exact:true})).not.toBeChecked();await page.getByRole('switch',{name:'公告展示',exact:true}).check();await expect(page.getByText('公告展示设置已保存',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'公告状态',exact:true}).selectOption('draft');await expect(page.locator('.announcement-table tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'编辑公告',exact:true}).click();const edit=page.getByRole('dialog',{name:'编辑公告',exact:true});await edit.getByRole('textbox',{name:'公告内容',exact:true}).fill('中文自定义内容保持原样');await edit.getByRole('combobox',{name:'内容格式',exact:true}).selectOption('html');await edit.getByRole('button',{name:'源代码',exact:true}).click();await edit.getByRole('textbox',{name:'公告内容源代码',exact:true}).fill('<p><strong>中文自定义内容保持原样</strong> <a href="https://example.test/help">查看</a></p>');await edit.getByRole('button',{name:'预览',exact:true}).click();await expect(edit.locator('.announcement-preview strong')).toHaveText('中文自定义内容保持原样');
 await edit.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByText('公告已保存',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'切换语言',exact:true}).click();await page.getByRole('menuitemradio',{name:'English',exact:true}).click();await expect(page.getByRole('heading',{name:'Announcement list',exact:true})).toBeVisible();await expect(page.locator('.announcement-table-content')).toContainText('中文自定义内容保持原样');
 await page.getByRole('button',{name:'Appearance',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Appearance',exact:true});await drawer.locator('.preference-theme').getByRole('button',{name:'Dark',exact:true}).click();await page.keyboard.press('Escape');await screenshot('admin-en-dark');
 await page.getByRole('combobox',{name:'Announcement status',exact:true}).selectOption('');await expect(page.locator('.announcement-table tbody tr')).toHaveCount(3);await page.getByRole('checkbox',{name:'Select this page',exact:true}).check();await page.getByRole('button',{name:/Delete selected/}).click();await page.getByRole('button',{name:'Confirm deletion',exact:true}).click();await expect(page.getByText('No announcements yet',{exact:true})).toBeVisible();
 await Promise.all([user.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/announcements'&&r.status()===200),user.reload()]);await expect(user.getByRole('article',{name:'平台公告',exact:true})).toHaveCount(0);await expect(user.locator('.dashboard-widget')).toBeHidden();
 }finally{await userContext.close();}
});

test('local workspace never loads platform announcements',async({page,instance})=>{
 await installStandalone(instance);const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/announcements'))requests.push(r.url());});await page.goto(instance.url);await expect(page.getByRole('heading',{name:/一份核心，无限可能/})).toBeVisible();await expect(page.getByRole('button',{name:'平台公告',exact:true})).toHaveCount(0);await expect(page.getByRole('article',{name:'平台公告',exact:true})).toHaveCount(0);expect(requests).toEqual([]);
});
