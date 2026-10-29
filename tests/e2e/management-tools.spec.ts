// Author: yunnuo <ymz@ebox.vip>
// Description: Real administrator pages for audit browsing, draft editing, safe previews and test SMTP delivery.
import {createServer} from 'node:net';
import {mkdir,readFile} from 'node:fs/promises';
import {test,expect} from './fixtures';

test('administrator audit filters, sort, pagination, export and member denial',async({page,browser,instance},info)=>{
 test.setTimeout(90000);
 const installed=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});expect(installed.status()).toBe(200);
 const metadata=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;
 for(let i=0;i<23;i++){expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers:{'X-CSRF-Token':metadata.csrf_token},data:{username:`member${i}`,email:`member${i}@example.test`,password:'test-password-strong',role:'user'}})).status()).toBe(200);}
 await page.goto(`${instance.url}/admin#logs`);await expect(page.getByRole('tab',{name:'操作日志',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'操作类型',exact:true}).selectOption('users.created');
 await expect(page.locator('.audit-table tbody tr')).toHaveCount(20);await expect(page.locator('.audit-table tbody tr').first()).toContainText('admin');await expect(page.locator('.audit-table tbody tr').first()).toContainText('127.0.0.1');await expect(page.locator('.audit-table tbody tr').first().locator('td').nth(4)).toContainText('role=user; status=active');
 await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.locator('.audit-table tbody tr')).toHaveCount(3);
 await page.getByRole('button',{name:'上一页',exact:true}).click();await expect(page.locator('.audit-table tbody tr')).toHaveCount(20);
 await page.getByRole('button',{name:'时间',exact:true}).click();await expect(page.locator('th[aria-sort=ascending]')).toBeVisible();
 await page.getByLabel('搜索操作日志',{exact:true}).fill('nonexistent-target');await page.getByLabel('搜索操作日志',{exact:true}).press('Enter');await expect(page.getByText('没有匹配的操作记录',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'清除筛选',exact:true}).click();await page.getByRole('combobox',{name:'操作类型',exact:true}).selectOption('users.created');await expect(page.locator('.audit-pagination')).toContainText('23');
 await page.getByLabel('结束日期',{exact:true}).fill('2000-01-01');await expect(page.getByText('没有匹配的操作记录',{exact:true})).toBeVisible();await page.getByLabel('结束日期',{exact:true}).fill('');await expect(page.locator('.audit-pagination')).toContainText('23');
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出',exact:true}).click();const download=await downloadEvent;const csv=await readFile((await download.path())!,'utf8');expect(csv).toContain('users.created');expect(csv).toContain('admin');expect(csv.split('\n').filter(v=>v.trim()).length).toBe(24);
 await mkdir(`build/acceptance/management/${info.project.name}`,{recursive:true});await page.evaluate(()=>{window.scrollTo(0,0);const table=document.querySelector('.audit-table-wrap');if(table)table.scrollLeft=0;});await page.screenshot({path:`build/acceptance/management/${info.project.name}/audit.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers:{'X-CSRF-Token':metadata.csrf_token},data:{changes:[{key:'security.login_captcha',value:'false'}]}})).status()).toBe(200);
 const context=await browser.newContext();try{
 const user=context.request;
 const input={username:'member0',password:'test-password-strong',captcha_id:'',captcha_answer:''};
 expect((await user.post(`${instance.url}/api/v1/admin/auth/login`,{data:input})).status()).toBe(401);
 expect((await user.get(`${instance.url}/api/v1/admin/logs`)).status()).toBe(401);
 expect((await user.post(`${instance.url}/api/v1/auth/login`,{data:input})).status()).toBe(200);
 for(const path of ['logs','logs/export','settings/mail/templates'])expect((await user.get(`${instance.url}/api/v1/admin/${path}`)).status()).toBe(403);
 const member=await context.newPage();await member.goto(`${instance.url}/#mail-templates`);await expect(member.getByRole('button',{name:'邮件模板',exact:true})).toHaveCount(0);await expect(member.getByRole('tab',{name:'注册验证',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});

test('editable email templates preserve drafts and send through real SMTP',async({page,instance},info)=>{
 test.setTimeout(90000);
 let count=0;const server=createServer(socket=>{socket.write('220 localhost test\r\n');let buffer='',data=false;socket.on('data',chunk=>{buffer+=chunk.toString();let at;while((at=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+2);if(data){if(line==='.'){data=false;count++;socket.write('250 accepted\r\n');}continue;}if(/^EHLO|^HELO/i.test(line))socket.write('250 localhost\r\n');else if(/^DATA/i.test(line)){data=true;socket.write('354 continue\r\n');}else if(/^QUIT/i.test(line)){socket.end('221 bye\r\n');}else socket.write('250 ok\r\n');}});});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const port=(server.address() as {port:number}).port;
 expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
 const meta=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;const headers={'X-CSRF-Token':meta.csrf_token};
 expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers,data:{changes:[{key:'mail.host',value:'127.0.0.1'},{key:'mail.port',value:String(port)},{key:'mail.tls',value:'plain'},{key:'mail.from',value:'sender@example.test'}]}})).status()).toBe(200);
 expect((await page.request.post(`${instance.url}/api/v1/admin/settings/mail/test`,{headers,data:{recipient:'recipient@example.test'}})).status()).toBe(200);
 await page.goto(`${instance.url}/admin#mail-templates`);await expect(page.getByRole('tab',{name:'注册验证',exact:true})).toBeVisible();
 if(info.project.name==='chromium'){const actions=await page.locator('.template-actions').boundingBox();expect(actions!.y+actions!.height).toBeLessThanOrEqual(page.viewportSize()!.height);}
 const defaults=(await(await page.request.get(`${instance.url}/api/v1/admin/settings/mail/templates`)).json()).data.items.find((item:{purpose:string})=>item.purpose==='verify');
 await page.getByRole('button',{name:'切换语言',exact:true}).click();await page.getByRole('menuitemradio',{name:'English',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Email subject',exact:true})).toHaveValue(defaults.subject);await expect(page.getByRole('textbox',{name:'Email content',exact:true})).toHaveText(/验证码/);
 await page.getByRole('textbox',{name:'Email subject',exact:true}).fill('自定义中文主题 {{site_name}}');
 await page.getByRole('button',{name:'Change language',exact:true}).click();await page.getByRole('menuitemradio',{name:'中文',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'邮件主题',exact:true})).toHaveValue('自定义中文主题 {{site_name}}');
 const editor=page.getByRole('textbox',{name:'邮件内容',exact:true});
 await editor.fill('Link {{code}}');await editor.press('ControlOrMeta+A');
 await page.getByRole('button',{name:'插入链接',exact:true}).click();await page.getByRole('textbox',{name:'链接地址',exact:true}).fill('https://example.test/help');await page.getByRole('button',{name:'插入',exact:true}).click();await expect(editor.locator('a')).toHaveAttribute('href','https://example.test/help');await expect(page.getByText('邮件模板已保存',{exact:true})).toHaveCount(0);
 await editor.fill('Draft {{code}} ');await editor.press('End');
 await page.locator('.template-variables button').filter({hasText:'站点名称'}).click();await expect(editor).toContainText('{{site_name}}');
 await page.getByRole('button',{name:'源代码',exact:true}).click();
 await page.getByRole('textbox',{name:'邮件内容源代码',exact:true}).fill('<p>Safe {{code}}</p><img src="x" onerror="window.unicoreUnsafe=true"><script>window.unicoreUnsafe=true</script>');
 await page.getByRole('button',{name:'可视化',exact:true}).click();await expect(editor.locator('img,script')).toHaveCount(0);expect(await page.evaluate(()=>Reflect.get(window,'unicoreUnsafe'))).toBeUndefined();
 await page.getByRole('button',{name:'源代码',exact:true}).click();await expect(page.getByRole('textbox',{name:'邮件内容源代码',exact:true})).toHaveValue('<p>Safe {{code}}</p>');await page.getByRole('button',{name:'可视化',exact:true}).click();
 await page.getByRole('textbox',{name:'邮件主题',exact:true}).fill('{{site_name}} · Custom verification');
 await page.getByRole('button',{name:'源代码',exact:true}).click();await page.getByRole('textbox',{name:'邮件内容源代码',exact:true}).fill('<p>Custom verification: <strong>{{code}}</strong></p><p>Valid for {{expires_minutes}} minutes.</p>');
 await page.getByRole('tab',{name:'密码重置',exact:true}).click();await page.getByRole('tab',{name:'注册验证',exact:true}).click();await expect(page.getByRole('textbox',{name:'邮件主题',exact:true})).toHaveValue('{{site_name}} · Custom verification');
 await page.getByRole('button',{name:'预览',exact:true}).click();await expect(page.getByRole('dialog',{name:'邮件预览',exact:true})).toBeVisible();await expect(page.frameLocator('iframe').getByText('Custom verification: 654321',{exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByText('邮件模板已保存',{exact:true})).toBeVisible();await instance.restart();await page.reload();await expect(page.getByRole('textbox',{name:'邮件主题',exact:true})).toHaveValue('{{site_name}} · Custom verification');
 await page.getByRole('button',{name:'测试发送',exact:true}).click();await page.getByRole('textbox',{name:'测试收件邮箱',exact:true}).fill('recipient@example.test');await page.getByRole('button',{name:'发送测试邮件',exact:true}).click();await expect(page.getByText('测试邮件已发送',{exact:true})).toBeVisible();expect(count).toBe(2);
 await mkdir(`build/acceptance/management/${info.project.name}`,{recursive:true});await page.evaluate(()=>{window.scrollTo(0,0);const table=document.querySelector('.audit-table-wrap');if(table)table.scrollLeft=0;});await page.screenshot({path:`build/acceptance/management/${info.project.name}/templates.png`});
 await page.getByRole('button',{name:'切换语言',exact:true}).click();await page.getByRole('menuitemradio',{name:'English',exact:true}).click();await expect(page.getByRole('tab',{name:'Registration',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Test delivery',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>{window.scrollTo(0,0);const table=document.querySelector('.audit-table-wrap');if(table)table.scrollLeft=0;});await page.screenshot({path:`build/acceptance/management/${info.project.name}/templates-en.png`});
 await page.getByRole('button',{name:'Restore defaults',exact:true}).click();await page.getByRole('button',{name:'Confirm restore',exact:true}).click();await expect(page.getByText('Default email template restored',{exact:true})).toBeVisible();
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
