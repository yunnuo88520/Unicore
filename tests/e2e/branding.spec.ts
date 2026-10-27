// Author: yunnuo <ymz@ebox.vip>
// Description: Real brand preview/save/theme/favicon/login/template/reset across PC and 375px.
import { test, expect, installStandalone } from './fixtures';
import { capture } from './visual';
import { mkdir } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
const variant = (dark: boolean) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="32" fill="${dark ? '#e4d3ff' : '#623ad6'}"/><path d="M35 32v40a29 29 0 0058 0V32H76v40a12 12 0 01-24 0V32z" fill="${dark ? '#2b1853' : 'white'}"/></svg>`).render().asPng();

test('instance brand preview, save, system theme and restore defaults', async ({ page, instance }, info) => {
  await installStandalone(instance);
  await page.goto(`${instance.url}/#site`);
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  const light = page.getByRole('form', { name: '浅色 Logo', exact: true });
  await light.getByLabel('选择浅色 Logo').setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(light.getByRole('alert')).toContainText('PNG 或 JPEG');
  await light.getByLabel('选择浅色 Logo').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: variant(false) });
  await expect(light.getByText('待保存预览，点击保存后生效。')).toBeVisible();
  await expect(page.locator('.brand .brand-image')).toHaveCount(0);
  await page.getByRole('tab', { name: '基础信息', exact: true }).click();
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  await expect(light.getByText('待保存预览，点击保存后生效。')).toBeVisible();
  await capture(page, info, 'brand-preview');
  await light.getByRole('button',{name:'取消预览'}).click();
  await expect(light.getByRole('button',{name:'保存浅色 Logo'})).toBeDisabled();
  await expect(page.locator('.brand .brand-image')).toHaveCount(0);
  await light.getByLabel('选择浅色 Logo').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: variant(false) });
  await light.getByRole('button', { name: '保存浅色 Logo' }).click();
  await expect(light.getByText('图片已保存', { exact: true })).toBeVisible();
  await expect(page.locator('.brand .instance-brand-light img')).toBeVisible();
  const dark = page.getByRole('form', { name: '深色 Logo', exact: true });
  await dark.getByLabel('选择深色 Logo').setInputFiles({ name: 'dark.png', mimeType: 'image/png', buffer: variant(true) });
  await dark.getByRole('button', { name: '保存深色 Logo' }).click();
  await expect(dark.getByText('图片已保存', { exact: true })).toBeVisible();
  const icon = page.getByRole('form', { name: '站点图标', exact: true });
  await icon.getByLabel('选择站点图标').setInputFiles({ name: 'favicon.png', mimeType: 'image/png', buffer: variant(false) });
  await icon.getByRole('button', { name: '保存站点图标' }).click();
  await expect(icon.getByText('图片已保存', { exact: true })).toBeVisible();
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', /^\/brand-assets\//);
  await page.getByRole('tab', { name: '基础信息', exact: true }).click();
  await page.getByLabel('站点名称', { exact: true }).fill('品牌工作空间');
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page).toHaveTitle('品牌工作空间 · 工作空间');
  const manifest = await (await page.request.get(`${instance.url}/site.webmanifest`)).json();
  expect(manifest.name).toBe('品牌工作空间');expect(manifest.icons[0].src).toMatch(/^\/brand-assets\//);
  await capture(page, info, 'brand-site-saved');
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  await capture(page, info, 'brand-saved');
  await page.reload();
  await expect(light.getByAltText('浅色 Logo当前预览')).toBeVisible();
  await page.evaluate(() => { localStorage.setItem('unicore.theme', 'system'); });
  await page.reload();
  for (const colorScheme of ['dark','light'] as const) {
    await page.emulateMedia({colorScheme});
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    await expect(page.locator(`.brand .instance-brand-${colorScheme} img`)).toBeVisible();
  }
  await icon.getByRole('button', { name: '恢复默认', exact: true }).click();
  await icon.getByRole('button', { name: '确认恢复' }).click();
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', '/favicon.svg');
  for (const [slot, name] of [[light, '浅色 Logo'], [dark, '深色 Logo']] as const) {await slot.getByRole('button', { name: '恢复默认', exact: true }).click();await slot.getByRole('button', { name: '确认恢复' }).click();}
  await expect(page.locator('.brand .brand-image')).toHaveCount(0);
  await capture(page, info, 'brand-restored');
});

test('platform login and all mail previews use public instance branding', async ({ page, instance }, info) => {
  const installed = await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: '品牌平台', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong' } });
  expect(installed.status()).toBe(200);
  await page.goto(`${instance.url}/#site`);
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();
  const form=page.getByRole('form',{name:'浅色 Logo',exact:true});
  await form.getByLabel('选择浅色 Logo').setInputFiles({name:'custom.png',mimeType:'image/png',buffer:variant(false)});
  await form.getByRole('button',{name:'保存浅色 Logo'}).click();
  await expect(form.getByText('图片已保存',{exact:true})).toBeVisible();
  const previewLogo=await form.locator('img').getAttribute('src');
  expect(previewLogo).toMatch(/^\/brand-assets\//);
  let mailLogo='';
  await page.getByRole('tab', { name: '邮件服务', exact: true }).click();
  await page.getByRole('tab', { name: '邮件模板', exact: true }).click();
  for(const name of ['SMTP 测试','注册验证','验证码登录','找回密码']){
    await page.getByLabel('模板类型', {exact:true}).selectOption({label:name});
    const image=page.frameLocator('iframe').locator('img');await expect(image).toHaveAttribute('src',/^data:image\/png;base64,/);
    const source=(await image.getAttribute('src'))!;if(!mailLogo)mailLogo=source;expect(source).toBe(mailLogo);
    const png=Buffer.from(source.split(',')[1],'base64');expect(png.readUInt32BE(16)).toBe(64);expect(png.readUInt32BE(20)).toBe(64);
    await page.locator('iframe').scrollIntoViewIfNeeded();await expect(page.frameLocator('iframe').getByRole('heading')).toBeVisible();
    const directory=`build/acceptance/m3b/${info.project.name}`;await mkdir(directory,{recursive:true});
    await page.locator('iframe').screenshot({path:`${directory}/mail-${name}.png`});
    await capture(page,info,`brand-mail-${name}`);
  }
  // A real read-only role sees previews and cannot choose/save/reset files.
  const bootstrap=(await(await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
  const headers={'X-CSRF-Token':bootstrap.csrf_token};
  const role=await page.request.post(`${instance.url}/api/v1/admin/roles`,{headers,data:{name:'品牌只读',permissions:['settings:read']}});expect(role.status()).toBe(200);
  const roleID=(await role.json()).data.id;
  expect((await page.request.post(`${instance.url}/api/v1/admin/users`,{headers,data:{username:'reader',email:'reader@example.test',password:'test-password-strong',role:roleID}})).status()).toBe(200);
  if(info.project.name==='mobile')await page.getByRole('button',{name:'打开导航'}).click();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'登录 品牌平台',exact:true})).toBeVisible();
  await expect(page.locator('.flow-brand .instance-brand-light img')).toBeVisible();
  await capture(page,info,'brand-login');
  await page.getByLabel('账号或邮箱').fill('reader');await page.getByLabel('密码',{exact:true}).fill('test-password-strong');
  const src=await page.getByAltText('六位数字验证码，点击刷新').getAttribute('src');const answer=[...Buffer.from(src!.split(',')[1],'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(m=>m[1]).join('');await page.getByLabel('图形验证码',{exact:true}).fill(answer);await page.getByRole('button',{name:'登录工作空间'}).click();
  await expect(page.getByRole('button',{name:'运行用例'})).toBeVisible();
  await page.goto(`${instance.url}/#site`);
  await page.getByRole('tab', { name: '品牌图片', exact: true }).click();await expect(form.getByLabel('选择浅色 Logo')).toBeDisabled();await expect(form.getByRole('button',{name:'恢复默认',exact:true})).toBeDisabled();
  await capture(page,info,'brand-read-only');
});
