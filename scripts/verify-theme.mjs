// Author: yunnuo <ymz@ebox.vip>
// Description: End-to-end proof that one design source changes UI, logo, mail and dimensions.
import {chromium,request,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
const path='assets/theme/tokens.json', original=readFileSync(path,'utf8');
let processHandle,browser,api;
mkdirSync('build/acceptance/theme-proof',{recursive:true});
const directory=mkdtempSync(`${tmpdir()}/unicore-theme-proof-`);
try{
 const candidate=JSON.parse(original);candidate.brand.accent='#087c69';candidate.typography.scale=1.08;candidate.shape.scale=1.2;writeFileSync(path,JSON.stringify(candidate,null,2)+'\n');
 execFileSync('make',['build-web'],{stdio:'inherit',env:process.env});
 const allocator=createServer();await new Promise(resolve=>allocator.listen(0,'127.0.0.1',resolve));const port=allocator.address().port;await new Promise(resolve=>allocator.close(resolve));const url=`http://127.0.0.1:${port}`;
 processHandle=spawn('build/bin/server',['--listen',`127.0.0.1:${port}`,'--data-dir',directory],{stdio:'ignore',env:{...process.env,APP_PROFILE:'',APP_SECRET_KEY:'',APP_BOOTSTRAP_TOKEN:'',APP_ADMIN_PATH:''}});
 api=await request.newContext({baseURL:url});await expect.poll(async()=>{try{return (await api.get('/api/v1/health/live')).status()}catch{return 0}},{timeout:15000}).toBe(200);
 const token=readFileSync(`${directory}/bootstrap.token`,'utf8').trim();const installed=await api.post('/api/v1/install/complete',{headers:{'X-Bootstrap-Token':token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'synthetic-theme-proof-password'}});expect(installed.status()).toBe(200);
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},storageState:await api.storageState()});const page=await context.newPage();await page.goto(url);await expect(page.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
 expect(await page.getByRole('button',{name:'运行用例'}).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(8, 124, 105)');
 expect(await page.locator('.brand-vector rect').first().evaluate(el=>getComputedStyle(el).fill)).toBe('rgb(8, 124, 105)');
 expect(await page.locator('.panel').first().evaluate(el=>getComputedStyle(el).borderTopLeftRadius)).toBe('13.2px');
 expect(await page.getByRole('button',{name:'运行用例'}).evaluate(el=>getComputedStyle(el).fontSize)).toBe('10.8px');
 const favicon=await api.get('/favicon.svg');expect(await favicon.text()).toContain('#087c69');
 const icon=await page.evaluate(async()=>{const img=await createImageBitmap(await(await fetch('/icon-192.png')).blob());const canvas=new OffscreenCanvas(192,192);const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return [...ctx.getImageData(12,96,1,1).data]});expect(icon.slice(0,3)).toEqual([8,124,105]);
 for(const mode of ['light','dark']){await page.evaluate(value=>document.documentElement.dataset.theme=value,mode);for(const hash of ['overview','lab','settings','admin','users','roles','site']){await page.goto(`${url}/#${hash}`);await page.waitForTimeout(100);if(hash==='roles'){await page.getByRole('button',{name:'新增角色',exact:true}).click();await expect(page.getByRole('heading',{name:'创建业务角色',exact:true})).toBeVisible();expect(await page.getByRole('checkbox',{name:/^查看用户/}).evaluate(el=>getComputedStyle(el).accentColor)).toBe(mode==='light'?'rgb(8, 124, 105)':'rgb(114, 180, 170)');}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`build/acceptance/theme-proof/${mode}-${hash}.png`,fullPage:true});}}
 const templates=await(await api.get('/api/v1/admin/settings/mail/templates')).json();expect(templates.data.items[1].html).toContain('#087c69');
 await page.setViewportSize({width:375,height:812});await page.goto(`${url}/#overview`);await expect(page.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'build/acceptance/theme-proof/mobile-green.png',fullPage:true});
 await page.goto(`${url}/#roles`);await page.getByRole('button',{name:'新增角色',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'build/acceptance/theme-proof/mobile-green-roles.png',fullPage:true});
 writeFileSync('build/acceptance/theme-proof/result.json',JSON.stringify({accent:'#087c69',font_scale:1.08,radius_scale:1.2,checks:['button','inline-logo','favicon-svg','raster-icon','font-size','radius','email-template','all-workspace-pages','role-editor-checkbox','375px'],result:'passed'},null,2));console.log('PASS one-source theme replacement across UI, favicon, raster icons, email, fonts and radii');
}finally{
 if(browser)await browser.close();if(api)await api.dispose();if(processHandle){processHandle.kill('SIGTERM');await new Promise(resolve=>processHandle.exitCode!==null?resolve():processHandle.once('exit',resolve));}rmSync(directory,{recursive:true,force:true});writeFileSync(path,original);execFileSync('make',['build-web'],{stdio:'inherit',env:process.env});
}
