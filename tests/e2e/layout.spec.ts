// Author: yunnuo <ymz@ebox.vip>
// Description: Exercise real preference combinations and assert content never sits underneath fixed navigation.
import {mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {test,expect,installStandalone,installPlatform,sdkClient,loginClient,workspaceLogin,adminLogin,memberPassword,nodeDisplayLabel,pageNode} from './fixtures';

const appVersion=readFileSync('VERSION','utf8').trim();

for (const viewportWidth of [375, 767, 768, 850, 900, 1280]) {
test(`layout matrix preserves shell geometry and stable appearance controls at ${viewportWidth}px`,async({page,instance},info)=>{
  test.skip(info.project.name === 'mobile' ? viewportWidth > 767 : viewportWidth <= 767, 'Each viewport runs in its matching device project');
  test.setTimeout(60000);
  await page.addInitScript(()=>localStorage.setItem('unicore.preferences.v1',JSON.stringify({direction:'rtl',locale:'zh-CN'})));
  await page.emulateMedia({reducedMotion:'reduce'});await installStandalone(instance);await page.goto(instance.url);
  await page.getByRole('button',{name:'主题设置',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'主题设置',exact:true});
  const choose=async(group:string,value:string)=>{await drawer.locator(`.preference-${group}`).getByRole('button',{name:value,exact:true}).click();};
  await choose('density','大字号');
  for(const width of [viewportWidth]){
    await page.setViewportSize({width,height:900});
    for(const layout of ['默认','紧凑','全宽布局'])for(const sidebar of ['标准','内嵌','悬浮'])for(const content of ['全宽','居中']){
      await choose('layout',layout);await choose('sidebar',sidebar);await choose('content',content);
      // Preference switches re-render the shell; wait two frames so the
      // measured geometry reflects the applied classes.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const state=await page.evaluate(()=>{
        const rect=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom};};
        const header=document.querySelector('.topbar')!,sheet=document.querySelector('.main-shell')!;
        return {viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,main:rect('.main-shell'),content:rect('.main-content'),navigation:rect('.sidebar'),header:rect('.topbar'),headerRadius:parseFloat(getComputedStyle(header).borderTopLeftRadius),sheetRadius:parseFloat(getComputedStyle(sheet).borderTopLeftRadius),headerBackground:getComputedStyle(header).backgroundColor,sheetBackground:getComputedStyle(sheet).backgroundColor,canvasBackground:getComputedStyle(document.querySelector('.app-shell')!).backgroundColor,headerDivider:parseFloat(getComputedStyle(header).borderBottomWidth),dir:document.documentElement.dir,
          controls:[...document.querySelectorAll('.preference-content .preference-choice')].map(node=>node.getBoundingClientRect().left),
          navigationHidden:getComputedStyle(document.querySelector('.sidebar')!).transform!=='none'};
      });
      const context=JSON.stringify({width,layout,sidebar,content,state});
      expect(state.overflow,context).toBe(false);expect(state.dir,context).toBe('ltr');
      expect(state.headerDivider,context).toBe(0);
      expect(state.headerBackground,context).toBe(state.sheetBackground);
      expect(state.headerBackground,context).toBe(state.canvasBackground);
      expect(state.main.left,context).toBeGreaterThanOrEqual(-1);expect(state.main.right,context).toBeLessThanOrEqual(width+1);
      expect(state.content.left,context).toBeGreaterThanOrEqual(state.main.left-1);expect(state.content.right,context).toBeLessThanOrEqual(state.main.right+1);
      expect(state.controls[0],context).toBeLessThan(state.controls[1]);
      if(width>767&&layout!=='全宽布局'){
        expect(state.main.left,context).toBeGreaterThanOrEqual(state.navigation.right-1);
        expect(state.navigationHidden,context).toBe(false);
        expect(state.navigation.top,context).toBeGreaterThanOrEqual(0);expect(state.navigation.bottom,context).toBeLessThanOrEqual(901);
        if(sidebar!=='标准'){
          expect(state.main.top,context).toBeGreaterThanOrEqual(8);
          expect(state.main.right,context).toBeLessThanOrEqual(width-8);
          expect(state.headerRadius,context).toBeGreaterThan(0);
          expect(state.headerRadius,context).toBe(state.sheetRadius);
          expect(state.headerBackground,context).toBe(state.sheetBackground);
          expect(state.header.right,context).toBeLessThanOrEqual(state.main.right);
        }
      }else{
        expect(state.main.width,context).toBeCloseTo(width,0);
      }
    }
  }
  await page.setViewportSize({width:viewportWidth,height:900});
  await drawer.getByRole('button',{name:'重置外观',exact:true}).click();
  await expect(drawer.locator('.preference-direction')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('dir','ltr');
  await page.keyboard.press('Escape');
  await mkdir('build/acceptance/layout',{recursive:true});
  await page.screenshot({path:`build/acceptance/layout/${info.project.name}-${viewportWidth}-workspace.png`});
  await page.getByRole('button',{name:'主题设置',exact:true}).click();await choose('layout','全宽布局');await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>innerWidth)).toBe(page.viewportSize()!.width);
  await page.getByRole('button',{name:'打开导航',exact:true}).click();
  await expect(page.locator('.sidebar')).toHaveClass(/is-open/);
  await expect(page.getByRole('button',{name:'我的笔记',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'我的笔记',exact:true}).click();
  await expect(page.getByRole('heading',{name:'我的笔记'})).toBeVisible();
  await expect(page.locator('.nav-scrim')).toHaveCount(0);
});
}

test('navigation renders the persisted section tree with collapsed directories and the rail keeps children in keyboard-accessible menus',async({page,instance},info)=>{
  // Installing through the browser request context signs the administrator in.
  const installed=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});
  expect(installed.status()).toBe(200);
  // Resolve the persisted tree once so every label stays operator-owned.
  const admin=sdkClient(instance.url,'administrator');
  await loginClient(admin,'admin','test-password-strong');
  const config=await admin.web!.menuConfig();
  const labelOf=(routeId:string)=>nodeDisplayLabel(pageNode(config,routeId)??{label:'',id:routeId,route_id:routeId});
  const usersNode=pageNode(config,'users')!;
  const parentNode=usersNode.parent_id?config.nodes.find(node=>node.id===usersNode.parent_id):undefined;
  const parentLabel=parentNode?nodeDisplayLabel(parentNode):null;
  await page.goto(`${instance.url}/admin`);
  await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
  await expect(page.getByText('文本分析不保存输入，外观偏好仅在当前客户端生效。',{exact:true})).toHaveCount(0);
  if(info.project.name==='mobile')await page.getByRole('button',{name:'打开导航',exact:true}).click();
  const sidebar=page.locator('.sidebar');
  expect((await sidebar.boundingBox())!.width).toBeGreaterThan(200);
  const search=sidebar.getByRole('searchbox',{name:'搜索菜单或按钮'});
  await search.fill(labelOf('users'));
  await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toBeVisible();
  await search.fill('no-such-navigation-entry');
  await expect(sidebar.getByRole('status')).toHaveText('没有匹配的菜单');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  // Sections render their entries; directories start collapsed and the
  // operator's toggle stays authoritative in both directions.
  if(parentLabel){
    const group=sidebar.getByRole('button',{name:parentLabel,exact:true});
    await expect(group).toHaveAttribute('aria-expanded','false');
    await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toHaveCount(0);
    await group.click();
    await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toBeVisible();
    await group.click();
    await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toHaveCount(0);
    await group.click();
    await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toBeVisible();
  } else {
    await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toBeVisible();
  }
  if(info.project.name==='mobile'){
    await page.keyboard.press('Escape');
    await expect(sidebar).not.toHaveClass(/is-open/);
    return;
  }
  await page.getByRole('button',{name:'收起导航',exact:true}).click();
  expect((await sidebar.boundingBox())!.width).toBe(60);
  await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toHaveCount(0);
  // 基础设置 nests inside the collapsed 系统设置 directory: neither the rail nor
  // a collapsed directory exposes child entries.
  await expect(sidebar.getByRole('button',{name:labelOf('site'),exact:true})).toHaveCount(0);
  const menuName=parentLabel??labelOf('users');
  const group=sidebar.getByRole('button',{name:menuName,exact:true});
  await group.focus();await page.keyboard.press('Enter');
  const menu=page.getByRole('menu',{name:menuName,exact:true});
  await expect(menu.getByRole('menuitem',{name:labelOf('users'),exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(group).toBeFocused();
  await group.click();await menu.getByRole('menuitem',{name:labelOf('users'),exact:true}).click();
  await expect(page).toHaveURL(`${instance.url}/admin/users`);
  await expect(menu).toHaveCount(0);
  await page.getByRole('button',{name:'展开导航',exact:true}).click();
  if(parentLabel){
    await expect(sidebar.getByRole('button',{name:parentLabel,exact:true})).toHaveAttribute('aria-expanded','true');
    await expect(sidebar.getByRole('button',{name:parentLabel,exact:true})).not.toHaveClass(/bg-button/);
  }
  await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toHaveClass(/bg-button/);
  // Expanding the 系统设置 directory reveals 基础设置 again in the wide tree.
  const settingsGroup=sidebar.getByRole('button',{name:'系统设置',exact:true});
  await expect(settingsGroup).toHaveAttribute('aria-expanded','false');
  await settingsGroup.click();
  await expect(sidebar.getByRole('button',{name:labelOf('site'),exact:true})).toBeVisible();
});

test('workspace headers share an uninterrupted canvas in both themes',async({page,instance},info)=>{
  await installStandalone(instance);await page.goto(instance.url);
  await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
  await mkdir('build/acceptance/layout',{recursive:true});
  for(const theme of ['light','dark'])for(const sidebar of ['plain','inset','floating']){
    await page.evaluate(value=>{localStorage.setItem('unicore.preferences.v1',JSON.stringify({...value,navCollapsed:false}));window.dispatchEvent(new StorageEvent('storage',{key:'unicore.preferences.v1'}));},{theme,sidebar});
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    await expect(page.locator('html')).toHaveAttribute('data-sidebar',sidebar);
    const canvas=await page.locator('.app-shell').evaluate(node=>getComputedStyle(node).backgroundColor);
    await expect(page.locator('.topbar')).toHaveCSS('background-color',canvas);
    await expect(page.locator('.main-shell')).toHaveCSS('background-color',canvas);
    await expect(page.locator('.topbar')).toHaveCSS('border-bottom-width','0px');
    await expect(page.locator('.topbar')).toHaveCSS('backdrop-filter','none');
    await page.screenshot({path:`build/acceptance/layout/${info.project.name}-${sidebar}-${theme}.png`,fullPage:true});
    if(info.project.name==='chromium'){
      await page.getByRole('button',{name:'收起导航',exact:true}).click();
      await page.screenshot({path:`build/acceptance/layout/${info.project.name}-${sidebar}-${theme}-rail.png`,fullPage:true});
    }
  }
});

test('platform account menus share the workspace style and keep homepage links out',async({page,instance},info)=>{
  await installPlatform(instance);
  await adminLogin(page,instance.url,'admin','administrator-password-strong');
  await mkdir('build/acceptance/layout',{recursive:true});
  for(const realm of ['administrator','user']){
    await page.goto(`${instance.url}${realm==='administrator'?'/admin':'/'}`);
    await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
    for(const name of ['切换语言','切换主题','主题设置'])await expect(page.locator('.topbar').getByRole('button',{name,exact:true})).toBeVisible();
    await expect(page.locator('.sidebar').getByRole('link',{name:'文档与帮助'})).toHaveCount(0);
    for(const theme of ['light','dark']){
      await page.evaluate(theme=>{localStorage.setItem('unicore.preferences.v1',JSON.stringify({theme}));window.dispatchEvent(new StorageEvent('storage',{key:'unicore.preferences.v1'}));},theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      if(info.project.name==='mobile')await page.getByRole('button',{name:'打开导航',exact:true}).click();
      await page.getByRole('button',{name:'侧栏账号菜单',exact:true}).click();
      const sidebarMenu=page.getByRole('menu',{name:'侧栏账号菜单',exact:true});
      await expect(sidebarMenu.getByRole('menuitem',{name:'个人中心',exact:true})).toBeVisible();
      await expect(sidebarMenu.getByRole('menuitem',{name:'产品首页',exact:true})).toHaveCount(0);
      const box=await sidebarMenu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width+1);
      expect(box!.y+box!.height).toBeLessThanOrEqual(page.viewportSize()!.height+1);
      expect(await sidebarMenu.evaluate(node=>parseFloat(getComputedStyle(node).borderRadius))).toBeGreaterThan(0);
      expect((await sidebarMenu.getByRole('menuitem',{name:'个人中心',exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(36);
      await page.screenshot({path:`build/acceptance/layout/${info.project.name}-${realm}-account-${theme}.png`});
      await page.keyboard.press('Escape');
      if(info.project.name==='mobile')await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'账号菜单',exact:true}).click();
      const topMenu=page.getByRole('menu',{name:'账号菜单',exact:true});
      await expect(topMenu.getByRole('menuitem',{name:'产品首页',exact:true})).toHaveCount(0);
      await expect(topMenu.getByRole('menuitem',{name:'个人中心',exact:true})).toBeVisible();
      await page.screenshot({path:`build/acceptance/layout/${info.project.name}-${realm}-avatar-${theme}.png`});
      await page.keyboard.press('Escape');
    }
  }
});

test('the version badge renders on every workspace sidebar and the popover follows capability tiers',async({page,instance},info)=>{
 test.skip(info.project.name==='mobile','The badge assertions run on the desktop viewport; the mobile drawer keeps the same component.');
 test.setTimeout(90000);
 if(process.env.FEATURE_UPDATER==='false')test.fixme(true,'Updater was compiled out of this build');
 await installPlatform(instance);
 const admin=sdkClient(instance.url,'administrator');
 await loginClient(admin,'admin','administrator-password-strong');
 // A restricted administrator role: management grants without updates:read.
 const restricted=await admin.createRole({name:'受限运维',realm:'administrator',permissions:['users:read'],menu_ids:['overview'],action_ids:[],operation_ids:['listUsers']});
 await admin.createUser({username:'versionadmin',email:'versionadmin@example.test',password:memberPassword,role_ids:[restricted.id]});
 await admin.createUser({username:'versionmember',email:'versionmember@example.test',password:memberPassword,role_ids:['user']});

 // Member workspace: the shared badge renders and opens a read-only popover.
 await workspaceLogin(page,instance.url,'versionmember');
 const sidebar=page.locator('.sidebar');
 await expect(sidebar.locator('.version-badge')).toHaveText(/v/);
 await expect(sidebar.locator('.version-badge')).toContainText(appVersion);
 await sidebar.locator('.version-badge').click();
 const memberPopover=page.getByRole('dialog',{name:'版本信息'});
 await expect(memberPopover).toBeVisible();
 await expect(memberPopover).toContainText(`v${appVersion}`);
 await expect(memberPopover.getByRole('button',{name:'检查更新'})).toHaveCount(0);
 await expect(memberPopover.getByRole('button',{name:'立即更新'})).toHaveCount(0);
 await page.keyboard.press('Escape');
 await expect(memberPopover).toHaveCount(0);

 // The member session keeps /admin on the member workspace, so start clean
 // before the administrator logins.
 await page.context().clearCookies();
 // Super administrator: the popover carries the update actions; a mocked
 // available update surfaces 立即更新 which jumps to the edition console.
 let updateRequests=0;
 await page.route('**/api/v1/admin/updates**',async route=>{
   updateRequests++;
   const overview={current_version:appVersion,latest_version:'99.0.0',available:true,checked_at:'2026-11-10T00:00:00Z',can_apply:true,verified:true,reason:'',source:'E2E · 本地',channel:'',history:[{version:'99.0.0',notes:'- e2e',source:'E2E',prerelease:false,published_at:'2026-11-10T00:00:00Z',url:`${instance.url}/release/99.0.0`}],job:{status:''},last_error:''};
   await route.fulfill({json:{code:'OK',request_id:'version-badge',data:overview}});
 });
 await adminLogin(page,instance.url,'admin','administrator-password-strong');
 const adminSidebar=page.locator('.sidebar');
 await expect(adminSidebar.locator('.version-badge')).toContainText(appVersion);
 await adminSidebar.locator('.version-badge').click();
 const superPopover=page.getByRole('dialog',{name:'版本信息'});
 await expect(superPopover).toBeVisible();
 await expect(superPopover).toContainText(/有新版本可用 v99\.0\.0/);
 await expect(superPopover.getByRole('button',{name:'检查更新'})).toBeVisible();
 await expect(superPopover.getByRole('button',{name:'立即更新'})).toBeVisible();
 expect(updateRequests).toBeGreaterThan(0);
 await superPopover.getByRole('button',{name:'立即更新'}).click();
 await expect(page).toHaveURL(`${instance.url}/admin/edition`);

 // Restricted administrator: read-only popover and no update requests at all.
 await page.context().clearCookies();
 await adminLogin(page,instance.url,'versionadmin',memberPassword);
 const restrictedSidebar=page.locator('.sidebar');
 await expect(restrictedSidebar.locator('.version-badge')).toContainText(appVersion);
 const before=updateRequests;
 await restrictedSidebar.locator('.version-badge').click();
 const restrictedPopover=page.getByRole('dialog',{name:'版本信息'});
 await expect(restrictedPopover).toBeVisible();
 await expect(restrictedPopover).toContainText(`v${appVersion}`);
 await expect(restrictedPopover.getByRole('button',{name:'检查更新'})).toHaveCount(0);
 await expect(restrictedPopover.getByRole('button',{name:'立即更新'})).toHaveCount(0);
 await expect(restrictedPopover.getByRole('button',{name:'版本回退'})).toHaveCount(0);
 expect(updateRequests).toBe(before);
});

test('the version popover portals above the sidebar and stays fully visible',async({page,instance},info)=>{
 test.skip(info.project.name==='mobile','Desktop viewport assertions; the mobile drawer hosts the same badge.');
 test.setTimeout(90000);
 await installPlatform(instance);
 await adminLogin(page,instance.url,'admin','administrator-password-strong');
 const sidebar=page.locator('.sidebar');
 await sidebar.locator('.version-badge').click();
 const popover=page.getByRole('dialog',{name:'版本信息'});
 await expect(popover).toBeVisible();
 // Portal root: the sidebar clips absolutely positioned children, so the
 // card must live outside .sidebar to escape overflow-hidden.
 expect(await popover.evaluate(node=>node.parentElement===document.body&&!node.closest('.sidebar'))).toBe(true);
 const box=await popover.boundingBox();
 const viewport=page.viewportSize()!;
 expect(box,contextInfo('popover box')).toBeTruthy();
 expect(box!.x,contextInfo('left edge')).toBeGreaterThanOrEqual(0);
 expect(box!.y,contextInfo('top edge')).toBeGreaterThanOrEqual(0);
 expect(box!.x+box!.width,contextInfo('right edge')).toBeLessThanOrEqual(viewport.width+1);
 expect(box!.y+box!.height,contextInfo('bottom edge')).toBeLessThanOrEqual(viewport.height+1);
 // Full min width: a clipped half-card renders far narrower than min-w-64.
 expect(box!.width,contextInfo('unclipped width')).toBeGreaterThanOrEqual(256);
 // Anchored to the badge: above it, or flipped below when the badge rides
 // near the viewport top (the sidebar badge sits under the brand header).
 const badge=await sidebar.locator('.version-badge').boundingBox();
 expect(badge,contextInfo('badge box')).toBeTruthy();
 const above=box!.y+box!.height<=badge!.y+2;
 const below=box!.y>=badge!.y+badge!.height-2;
 expect(above||below,contextInfo('anchored to the badge without overlapping it')).toBe(true);
 await mkdir('build/acceptance/layout',{recursive:true});
 await page.screenshot({path:`build/acceptance/layout/${info.project.name}-version-popover.png`});
});

function contextInfo(label:string){return label;}
