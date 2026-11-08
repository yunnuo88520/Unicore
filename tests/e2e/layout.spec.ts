// Author: yunnuo <ymz@ebox.vip>
// Description: Exercise real preference combinations and assert content never sits underneath fixed navigation.
import {mkdir} from 'node:fs/promises';
import {test,expect,installStandalone,sdkClient,loginClient,nodeDisplayLabel,pageNode} from './fixtures';

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
        return {viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,main:rect('.main-shell'),content:rect('.main-content'),navigation:rect('.sidebar'),header:rect('.topbar'),headerRadius:parseFloat(getComputedStyle(header).borderTopLeftRadius),sheetRadius:parseFloat(getComputedStyle(sheet).borderTopLeftRadius),headerBackground:getComputedStyle(header).backgroundColor,sheetBackground:getComputedStyle(sheet).backgroundColor,pageBackground:getComputedStyle(document.body).backgroundColor,dir:document.documentElement.dir,
          controls:[...document.querySelectorAll('.preference-content .preference-choice')].map(node=>node.getBoundingClientRect().left),
          navigationHidden:getComputedStyle(document.querySelector('.sidebar')!).transform!=='none'};
      });
      const context=JSON.stringify({width,layout,sidebar,content,state});
      expect(state.overflow,context).toBe(false);expect(state.dir,context).toBe('ltr');
      expect(state.main.left,context).toBeGreaterThanOrEqual(-1);expect(state.main.right,context).toBeLessThanOrEqual(width+1);
      expect(state.content.left,context).toBeGreaterThanOrEqual(state.main.left-1);expect(state.content.right,context).toBeLessThanOrEqual(state.main.right+1);
      expect(state.controls[0],context).toBeLessThan(state.controls[1]);
      if(width>767&&layout!=='全宽布局'){
        expect(state.main.left,context).toBeGreaterThanOrEqual(state.navigation.right-1);
        expect(state.navigationHidden,context).toBe(false);
        expect(state.navigation.top,context).toBeGreaterThanOrEqual(0);expect(state.navigation.bottom,context).toBeLessThanOrEqual(901);
        if(sidebar!=='标准'){
          expect(state.main.top,context).toBeGreaterThanOrEqual(12);
          expect(state.main.right,context).toBeLessThanOrEqual(width-12);
          expect(state.headerRadius,context).toBeGreaterThan(0);
          expect(state.headerRadius,context).toBe(state.sheetRadius);
          expect(state.headerBackground,context).toBe(state.sheetBackground);
          expect(state.header.right,context).toBeLessThanOrEqual(state.main.right);
        }
      }else{
        expect(state.main.width,context).toBeCloseTo(width,0);
        if(sidebar!=='标准')expect(state.headerBackground,context).toBe(state.pageBackground);
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
  expect((await sidebar.boundingBox())!.width).toBe(68);
  await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toHaveCount(0);
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
    await expect(sidebar.getByRole('button',{name:parentLabel,exact:true})).not.toHaveClass(/bg-primary-soft/);
  }
  await expect(sidebar.getByRole('button',{name:labelOf('users'),exact:true})).toHaveClass(/bg-primary-soft/);
});

test('inset and floating headers match their content sheet in both themes',async({page,instance},info)=>{
  await installStandalone(instance);await page.goto(instance.url);
  await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
  await mkdir('build/acceptance/layout',{recursive:true});
  for(const theme of ['light','dark'])for(const sidebar of ['inset','floating']){
    await page.evaluate(value=>{localStorage.setItem('unicore.preferences.v1',JSON.stringify({...value,navCollapsed:false}));window.dispatchEvent(new StorageEvent('storage',{key:'unicore.preferences.v1'}));},{theme,sidebar});
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    await expect(page.locator('html')).toHaveAttribute('data-sidebar',sidebar);
    await page.screenshot({path:`build/acceptance/layout/${info.project.name}-${sidebar}-${theme}.png`,fullPage:true});
    if(info.project.name==='chromium'){
      await page.getByRole('button',{name:'收起导航',exact:true}).click();
      await page.screenshot({path:`build/acceptance/layout/${info.project.name}-${sidebar}-${theme}-rail.png`,fullPage:true});
    }
  }
});
