// Author: yunnuo <ymz@ebox.vip>
// Description: Exercise real Linux archives, Nginx, image and Compose in disposable named instances.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
const version = readFileSync('VERSION','utf8').trim();
const contract = JSON.parse(readFileSync('packages/contracts/openapi.json','utf8'));
const management = Object.entries(contract.paths).filter(([path])=>path.startsWith('/api/v1/admin/')).flatMap(([path,item])=>Object.entries(item).filter(([,operation])=>operation.operationId&&operation['x-unicore'].access!=='public').map(([method])=>({path,method:method.toUpperCase()})));
const image = process.env.UNICORE_IMAGE ?? `unicore:${version}`;
const daemonArch=docker(['info','--format','{{.Architecture}}']);
const arch=({aarch64:'arm64',arm64:'arm64',x86_64:'amd64',amd64:'amd64'})[daemonArch];
if(!arch)throw new Error(`Unsupported Docker architecture ${daemonArch}`);
const nonce = `unicore-smoke-${Date.now()}-${process.pid}`;
const temp = mkdtempSync(join(tmpdir(), `${nonce}-`));
const evidence = resolve('build/acceptance/deployment'); mkdirSync(evidence,{recursive:true});
rmSync(join(evidence,'results.json'),{force:true});
const containers = new Set(), volumes = new Set(), networks = new Set();
const results=[];
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const composeEnv={...process.env, UNICORE_VERSION:version, UNICORE_IMAGE:image, UNICORE_PORT:'0'};
const compose = (project,args) => execFileSync('docker',['compose','-p',project,'-f','deploy/docker/compose.yaml',...args],{env:composeEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const projects = new Set();
async function waitLive(url) {
  await expect.poll(async()=>{try{return (await fetch(`${url}/api/v1/health/live`)).status;}catch{return 0;}},{timeout:30000}).toBe(200);
}
function dataFile(container,path) {
  const dest=join(temp,`copy-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  docker(['cp',`${container}:/data/${path}`,dest]);return readFileSync(dest);
}
function digest(data) {return createHash('sha256').update(data).digest('hex');}
async function exercise(mode,profile) {
  console.log(`Checking ${mode} (${profile})`);
  const name=`${nonce}-${mode}`, volume=`${name}-data`, project=name;
  let container=name, url, recreate;
  if(mode === 'compose') {
    projects.add(project);compose(project,['up','-d','--no-build','--pull','never']);
    container=compose(project,['ps','-q','app']);
    url=`http://${compose(project,['port','app','8080'])}`;
    recreate=()=>{compose(project,['up','-d','--no-build','--pull','never','--force-recreate']);container=compose(project,['ps','-q','app']);url=`http://${compose(project,['port','app','8080'])}`;};
  } else {
    volumes.add(volume);docker(['volume','create',volume]);
    const run=['run','-d','--name',name,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','-v',`${volume}:/data`];
    if(mode.startsWith('tar')) {
      const artifact=`unicore-${profile}-linux-${arch}-v${version}.tar.gz`;
      const release=join(temp,mode);mkdirSync(release);
      const file=resolve('build/releases',artifact);
      const manifest=JSON.parse(readFileSync('build/releases/manifest.json','utf8')).artifacts.find(item=>item.artifact===artifact);
      expect(manifest?.sha256).toBe(digest(readFileSync(file)));
      execFileSync('tar',['-xzf',file,'-C',release,'--strip-components=1']);
      expect(readFileSync(join(release,'VERSION'),'utf8').trim()).toBe(version);
      expect(JSON.parse(readFileSync(join(release,'manifest.json'),'utf8')).migration_level).toBe(profile==='web-platform'?12:1);
      expect(JSON.parse(readFileSync(join(release,'manifest.json'),'utf8')).business_migration_level).toBe(2);
      expect(readFileSync(join(release,'LICENSE'),'utf8')).toContain('MIT License');
      expect(readFileSync(join(release,'bin/unicore-ops')).byteLength).toBeGreaterThan(1000);
      const network=`${name}-network`;networks.add(network);docker(['network','create',network]);
      run.push('--network',network,'--network-alias','backend','-v',`${release}:/release:ro`,'--entrypoint','/release/bin/server','-e','APP_DEPLOYMENT_KIND=tar');
      const config=readFileSync(join(release,'deploy/nginx.conf.example'),'utf8').replace('127.0.0.1:8088','0.0.0.0:80').replace('/opt/unicore/current/web','/release/web').replaceAll('127.0.0.1:8080','backend:8080').replace('add_header Cache-Control','add_header X-Unicore-Static nginx;\n        add_header Cache-Control');
      const conf=join(temp,`${mode}.conf`);writeFileSync(conf,config);
      const nginx=`${name}-nginx`;containers.add(nginx);
      docker([...run,image]);containers.add(name);
      docker(['run','-d','--name',nginx,'--network',network,'-p','127.0.0.1::80','-v',`${release}:/release:ro`,'-v',`${conf}:/etc/nginx/conf.d/default.conf:ro`,process.env.NGINX_IMAGE??'nginx:latest']);
      docker(['exec',nginx,'nginx','-t']);
      url=`http://${docker(['port',nginx,'80/tcp'])}`;
      const asset=readdirSync(join(release,'web/assets')).find(file=>file.endsWith('.js'));
      let response;await expect.poll(async()=>{try{response=await fetch(`${url}/assets/${asset}`);return response.status;}catch{return 0;}},{timeout:30000}).toBe(200);expect(response.headers.get('x-unicore-static')).toBe('nginx');
    } else {run.push('-p','127.0.0.1::8080');docker([...run,image]);containers.add(name);url=`http://${docker(['port',name,'8080/tcp'])}`;}
    recreate=()=>{docker(['stop','-t','15',name]);expect(docker(['inspect','--format','{{.State.ExitCode}}',name])).toBe('0');docker(['rm',name]);docker([...run,image]);if(mode==='docker')url=`http://${docker(['port',name,'8080/tcp'])}`;};
  }
  await waitLive(url);
  const context=await browser.newContext({baseURL:url,viewport:{width:1440,height:1000}});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const realm={};
  const bootstrapPath=profile==='web-platform'?'/api/v1/admin/bootstrap':'/api/v1/bootstrap';
  const get=path=>context.request.get(`${url}${path}`,{headers:realm});
  const json=async path=>(await(await get(path)).json()).data;
  try {
    expect((await get('/api/v1/health/ready')).status()).toBe(503);
    const initial=await context.request.get(`${url}/`,{maxRedirects:0});expect(initial.status()).toBe(303);expect(initial.headers().location).toBe('/install');
    const token=dataFile(container,'bootstrap.token').toString().trim();
    await page.goto(url);await expect(page).toHaveURL(/\/install$/);
    for(const width of [1440,375]) {await page.setViewportSize({width,height:1000});await page.screenshot({path:join(evidence,`${mode}-install-${width}.png`),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
    await page.setViewportSize({width:1440,height:1000});
    await page.getByLabel('一次性安装凭据').fill(token);

    await page.getByRole('button',{name:'下一步'}).click();
    await expect(page.getByRole('radio',{name:profile==='web-platform'?/多用户平台/:/单机模式/})).toBeChecked();
    await page.getByRole('radio',{name:profile==='web-platform'?/多用户平台/:/单机模式/}).check();
    await page.getByRole('button',{name:'下一步'}).click();
    await page.getByLabel('数据库类型').selectOption('sqlite');
    await page.getByRole('button',{name:'测试连接'}).click();await expect(page.getByText('连接测试成功')).toBeVisible();
    await page.getByRole('button',{name:'下一步'}).click();
    if(profile==='web-platform') {await page.getByLabel('站点名称',{exact:true}).fill(`部署验收 ${mode}`);await page.getByLabel('管理员账号').fill('admin');await page.getByLabel('管理员邮箱').fill('admin@example.test');await page.getByLabel('管理员密码').fill('Admin@123456');await page.getByRole('button',{name:'下一步'}).click();}
    await page.getByRole('button',{name:'完成安装'}).click();await expect(page.getByRole('heading',{name:'安装完成',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'进入工作空间'}).click();await expect(page.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
    const boot=await json(bootstrapPath);expect(boot.version).toBe(version);expect(boot.profile).toBe(profile);expect(boot.deployment_kind).toBe(mode.startsWith('tar')?'tar':'docker');
    const admin=profile==='web-platform';const headers={...realm,'Origin':url,...(admin?{'X-CSRF-Token':boot.csrf_token}:{})};
    const base=admin?'/api/v1/admin':'/api/v1';
    if(mode==='tar-platform') {
      const payload=Buffer.alloc(9*1024*1024,97);
      const initialized=await context.request.post(`${url}${base}/files/multipart`,{headers,data:{original_name:'nginx-multipart.bin',mime_type:'application/octet-stream',size:payload.length,fingerprint:digest(payload)}});
      expect(initialized.status()).toBe(200);const session=(await initialized.json()).data;
      for(let number=1;number<=session.part_count;number++){
        const signed=await context.request.post(`${url}${base}/files/multipart/${session.file.file_id}/parts`,{headers,data:{number}});expect(signed.status()).toBe(200);const grant=(await signed.json()).data;
        const part=payload.subarray((number-1)*session.part_size,number*session.part_size);
        expect((await context.request.put(`${url}${grant.url}`,{headers:{...headers,...grant.headers},data:part})).status()).toBe(200);
      }
      expect((await context.request.post(`${url}${base}/files/multipart/${session.file.file_id}/complete`,{headers,timeout:120000})).status()).toBe(200);
      const access=(await(await context.request.post(`${url}${base}/files/${session.file.file_id}/access`,{headers})).json()).data;
      const downloaded=await context.request.get(`${url}${access.url}`);expect(downloaded.status()).toBe(200);expect(digest(await downloaded.body())).toBe(digest(payload));
    }
    if(admin && boot.capabilities.updater) {
      const updates=await json(`${base}/updates`);
      expect(updates.current_version).toBe(version);expect(updates.history.length).toBeGreaterThan(0);
      if(!mode.startsWith('tar')) {
        expect(updates.can_apply).toBe(false);expect(updates.reason).toContain('容器');
        await page.goto(`${url}/admin#edition`);
        await expect(page.getByRole('heading',{name:'更新日志',exact:true})).toBeVisible();
        await expect(page.getByRole('button',{name:'更新并重启',exact:true})).toBeDisabled();
        await page.screenshot({path:join(evidence,`${mode}-updates.png`),fullPage:true});
      }
    }
    if(admin) {const noCSRF=await context.request.patch(`${url}${base}/settings`,{headers:realm,data:{changes:[{key:'site.name',value:'denied'}]}});expect(noCSRF.status()).toBe(403);}
    const changes=admin?[{key:'site.name',value:`持久部署 ${mode}`},{key:'admin.path',value:'/manage'}]:[{key:'appearance.theme',value:'dark'}];
    expect((await context.request.patch(`${url}${base}/settings`,{headers,data:{changes}})).status()).toBe(200);
    if(admin)expect((await context.request.put(`${url}${base}/branding`,{headers,data:{slot:'favicon',content:readFileSync('assets/brand/icon-192.png').toString('base64')}})).status()).toBe(200);
    else expect((await context.request.put(`${url}${base}/branding`,{headers,data:{slot:'favicon',content:''}})).status()).toBe(404);
    const manifest=await(await get('/site.webmanifest')).json();expect(manifest.name).toBe(admin?`持久部署 ${mode}`:'Unicore');
    if(admin)expect(manifest.icons[0].src).toMatch(/^\/brand-assets\//);
    expect((await get(manifest.icons[0].src)).status()).toBe(200);
    const unknown=await get('/api/v1/unknown');expect(unknown.status()).toBe(404);expect((await unknown.json()).code).toBe('NOT_FOUND');
    for(const path of ['/docs/api','/openapi.json','/assets/missing.js'])expect((await get(path)).status()).toBe(404);
    if(admin) {expect((await get('/admin')).status()).toBe(404);expect((await get('/manage')).status()).toBe(200);}
    expect((await get('/api/v1/health/ready')).status()).toBe(200);
    await page.goto(admin?`${url}/manage`:url);await expect(page).toHaveTitle(admin?`持久部署 ${mode} · 工作空间`:'Unicore · 工作空间');
    for(const width of [1440,375]) {await page.setViewportSize({width,height:1000});await page.screenshot({path:join(evidence,`${mode}-workspace-${width}.png`),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
    const fingerprints=Object.fromEntries(['secret.key','installation.json'].map(path=>[path,digest(dataFile(container,path))]));
    // A process restart followed by container replacement must retain the installation and key.
    docker(['restart','-t','15',container]);
    if(!mode.startsWith('tar'))url=`http://${docker(['port',container,'8080/tcp'])}`;
    await waitLive(url);
    recreate();await waitLive(url);
    expect((await json(bootstrapPath)).site_name).toBe(admin?`持久部署 ${mode}`:'Unicore');
    for(const [path,hash] of Object.entries(fingerprints))expect(digest(dataFile(container,path))).toBe(hash);
    expect((await context.request.get(`${url}/install`,{maxRedirects:0})).status()).toBe(303);
    const replay=await context.request.post(`${url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':token},data:{profile,database:{driver:'sqlite',dsn:''},site_name:'Replay',base_url:url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'Admin@123456'}});
    expect(replay.status()).toBe(409);
    expect((await(await get('/site.webmanifest')).json()).icons[0].src).toBe(manifest.icons[0].src);
    expect((await get(manifest.icons[0].src)).status()).toBe(200);
    if(admin) {
      await context.clearCookies();await page.goto(`${url}/manage`);await expect(page.getByRole('heading',{name:`管理员登录 · 持久部署 ${mode}`})).toBeVisible();
      for(const width of [1440,375]) {await page.setViewportSize({width,height:1000});await page.screenshot({path:join(evidence,`${mode}-login-${width}.png`),fullPage:true});}
      await page.getByLabel('账号或邮箱').fill('admin');await page.getByLabel('密码',{exact:true}).fill('Admin@123456');
      const src=await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');
      const answer=[...Buffer.from(src.split(',')[1],'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match=>match[1]).join('');
      await page.getByLabel('图形验证码',{exact:true}).fill(answer);await page.getByRole('button',{name:'登录工作空间'}).click();
      await expect(page.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
    } else {expect((await get('/api/v1/admin/users')).status()).toBe(404);await page.goto(url);}
    const session=await json(bootstrapPath);
    const executed=await context.request.post(`${url}/api/v1${admin?'/admin':''}/core/execute`,{headers:{...realm,Origin:url,...(admin?{'X-CSRF-Token':session.csrf_token}:{})},data:{text:'hello world'}});
    expect(executed.status()).toBe(200);expect((await executed.json()).data.sha256).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    if(admin) {
      expect((await context.request.post(`${url}/api/v1/admin/users`,{headers:{...realm,Origin:url,'X-CSRF-Token':session.csrf_token},data:{username:'member',email:'member@example.test',password:'test-password-strong',role:'user'}})).status()).toBe(200);
      const member=await browser.newContext({baseURL:url,viewport:{width:375,height:812}});
      try {
        for(const operation of management)expect((await member.request.fetch(operation.path.replace('{id}','missing'),{method:operation.method,...(operation.method==='GET'?{}:{data:{}})})).status(),`${operation.method} ${operation.path}`).toBe(401);
        const personal=await member.newPage();await personal.goto(`${url}/#site?tab=mail`);
        await personal.getByLabel('账号或邮箱').fill('member');await personal.getByLabel('密码',{exact:true}).fill('test-password-strong');
        const src=await personal.getByAltText('六位数字验证码，点击刷新').getAttribute('src');
        const answer=[...Buffer.from(src.split(',')[1],'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match=>match[1]).join('');
        await personal.getByLabel('图形验证码',{exact:true}).fill(answer);await personal.getByRole('button',{name:'登录工作空间'}).click();
        await expect(personal.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
        await personal.goto(`${url}/#site`);
        await expect(personal.getByText('仅当前客户端',{exact:true})).toBeVisible();
        const metadata=(await(await member.request.get('/api/v1/bootstrap')).json()).data;
        expect(metadata.current_user.roles).toEqual(['user']);expect(metadata.current_user.permissions).toEqual([]);
        for(const operation of management)expect((await member.request.fetch(operation.path.replace('{id}','missing'),{method:operation.method,headers:{Origin:url,'X-CSRF-Token':metadata.csrf_token},...(operation.method==='GET'?{}:{data:{}})})).status(),`${operation.method} ${operation.path}`).toBe(403);
        expect((await member.request.get('/manage')).status()).toBe(200);
        await expect(personal.getByLabel('站点名称',{exact:true})).toHaveCount(0);
        const writes=[];personal.on('request',request=>{if(request.method()!=='GET')writes.push(request.url());});
        await personal.getByRole('button',{name:/深色.*柔和低光/}).click();await personal.getByRole('button',{name:'保存设置',exact:true}).click();
        await expect(personal.locator('html')).toHaveAttribute('data-theme','dark');expect(writes).toEqual([]);
        await personal.screenshot({path:join(evidence,`${mode}-member-local-375.png`),fullPage:true});
      } finally {await member.close();}
    }
    expect(errors).toEqual([]);results.push({mode,profile,version,status:'passed',checks:['install wizard PC/375',...(admin?['demo account and six-digit captcha login','CSRF and custom admin path','all management APIs reject anonymous/member','member local appearance only']:['platform APIs absent']),...(mode.startsWith('tar')?['Nginx serves fingerprinted assets']:[]),'API/brand/manifest/docs routing','restart and container replacement','persisted settings/key/database/brand','Core']});
    console.log(`PASS ${mode}`);
  } finally {await context.close();}
}
try {
  expect(docker(['image','inspect','--format','{{index .Config.Labels "org.opencontainers.image.version"}}',image])).toBe(version);
  for(const [mode,profile] of [['tar-platform','web-platform'],['tar-standalone','web-standalone'],['docker','web-platform'],['compose','web-platform']]) await exercise(mode,profile);
  writeFileSync(join(evidence,'results.json'),JSON.stringify({date:new Date().toISOString(),arch,image,results},null,2)+'\n');
} finally {
  await browser.close();
  for(const project of projects)try{compose(project,['down','--volumes','--remove-orphans']);}catch{console.error(`Cleanup needed: ${project}`);}
  for(const name of containers)try{docker(['rm','-f',name]);}catch{/* Already removed. */}
  for(const name of volumes)try{docker(['volume','rm',name]);}catch{console.error(`Cleanup needed: ${name}`);}
  for(const name of networks)try{docker(['network','rm',name]);}catch{console.error(`Cleanup needed: ${name}`);}
  rmSync(temp,{recursive:true,force:true});
}
