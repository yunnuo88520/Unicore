// Author: yunnuo <ymz@ebox.vip>
// Description: Exercise real preference combinations and assert content never sits underneath fixed navigation.
import {mkdir} from 'node:fs/promises';
import {test,expect,installStandalone} from './fixtures';

test('layout matrix preserves shell geometry and stable appearance controls',async({page,instance},info)=>{
  test.setTimeout(60000);
  await page.addInitScript(()=>localStorage.setItem('unicore.preferences.v1',JSON.stringify({direction:'rtl',locale:'zh-CN'})));
  await page.emulateMedia({reducedMotion:'reduce'});await installStandalone(instance);await page.goto(instance.url);
  await page.getByRole('button',{name:'主题设置',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'主题设置',exact:true});
  const choose=async(group:string,value:string)=>{await drawer.locator(`.preference-${group}`).getByRole('button',{name:value,exact:true}).click();};
  await choose('density','大字号');
  for(const width of info.project.name==='mobile'?[375,767]:[1280,900,850,768]){
    await page.setViewportSize({width,height:900});
    for(const layout of ['默认','紧凑','全宽布局'])for(const sidebar of ['标准','内嵌','悬浮'])for(const content of ['全宽','居中']){
      await choose('layout',layout);await choose('sidebar',sidebar);await choose('content',content);
      const state=await page.evaluate(()=>{
        const rect=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom};};
        return {viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,main:rect('.main-shell'),content:rect('.main-content'),navigation:rect('.sidebar'),heading:rect('.page-heading'),dir:document.documentElement.dir,
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
      }else expect(state.main.width,context).toBeCloseTo(width,0);
    }
  }
  await page.setViewportSize({width:info.project.name==='mobile'?375:1280,height:900});
  await drawer.getByRole('button',{name:'重置外观',exact:true}).click();
  await expect(drawer.locator('.preference-direction')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('dir','ltr');
  await page.keyboard.press('Escape');
  await mkdir('build/acceptance/layout',{recursive:true});
  await page.screenshot({path:`build/acceptance/layout/${info.project.name}-workspace.png`});
  await page.getByRole('button',{name:'主题设置',exact:true}).click();await choose('layout','全宽布局');await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>innerWidth)).toBe(page.viewportSize()!.width);
  await page.getByRole('button',{name:'打开导航',exact:true}).click();
  await expect(page.locator('.sidebar')).toHaveClass(/is-open/);
  await expect(page.getByRole('button',{name:'我的笔记',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'我的笔记',exact:true}).click();
  await expect(page.getByRole('heading',{name:'我的笔记.'})).toBeVisible();
  await expect(page.locator('.nav-scrim')).toHaveCount(0);
});
