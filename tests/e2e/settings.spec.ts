// Author: yunnuo <ymz@ebox.vip>
// Description: Real settings tabs, isolated drafts, persistence, branding and optional edition UI.
import { readFile, mkdir } from 'node:fs/promises';
import { test, expect, installStandalone } from './fixtures';
import { capture } from './visual';

test('settings audit: site identity, ICP, ICO and compile-time update capabilities', async ({ page, instance }, info) => {
  const installed=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});expect(installed.status()).toBe(200);
  await page.goto(`${instance.url}/admin/site`);
  await expect(page.getByLabel('页脚版权',{exact:true})).toHaveValue('Crafted by Yunnuo');
  await expect(page.locator('footer')).toContainText('Crafted by Yunnuo');
  await expect(page.locator('footer')).not.toContainText('Go + React');
  await expect(page.locator('footer')).not.toContainText(/v\d+\.\d+\.\d+/);
  // Existing installations keep their stored value; only the known legacy default is presented with the corrected case.
  const initialBootstrap=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;
  expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers:{'X-CSRF-Token':initialBootstrap.csrf_token},data:{changes:[{key:'site.copyright',value:'Crafted by yunnuo'}]}})).status()).toBe(200);
  await page.reload();await expect(page.locator('footer')).toContainText('Crafted by Yunnuo');
  const mainTabs = page.getByRole('tablist', { name: '设置分组', exact: true });
  await expect(page.getByRole('tablist')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '外观设置', exact: true })).toHaveCount(0);

  await expect(mainTabs.getByRole('tab', { name: '邮件服务', exact: true })).toHaveCount(0);
  // Arrow/Home keyboard navigation changes the visible panel without scrolling to an anchor.
  await mainTabs.getByRole('tab', { name: '基础信息', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(mainTabs.getByRole('tab', { name: '品牌图片', exact: true })).toBeFocused();
  await expect(page.getByLabel('站点名称', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Home');
  await expect(mainTabs.getByRole('tab', { name: '基础信息', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('站点名称', { exact: true }).fill('配套设置工作空间');
  // A draft on another tab must survive switching and must not be included in this save.
  await mainTabs.getByRole('tab', { name: '外观设置', exact: true }).click();
  await page.getByRole('button', { name: /深色.*柔和低光/ }).click();
  await mainTabs.getByRole('tab', { name: '基础信息', exact: true }).click();
  await expect(page.getByLabel('站点名称', { exact: true })).toHaveValue('配套设置工作空间');
  await page.getByLabel('页脚版权', { exact: true }).fill('Unicore 设置验收');
  await page.getByLabel('备案号（ICP）', { exact: true }).fill('测试ICP备00000000号');
  await page.getByLabel('备案查询链接', { exact: true }).fill('https://beian.miit.gov.cn/');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeDisabled();
  const persisted = (await (await page.request.get(`${instance.url}/api/v1/admin/settings`)).json()).data;
  expect(persisted.items.some((item:{key:string})=>item.key==='appearance.theme')).toBe(false);
  await mainTabs.getByRole('tab', { name: '外观设置', exact: true }).click();
  await expect(page.getByRole('button', { name: /深色.*柔和低光/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeDisabled();
  await capture(page, info, 'settings-appearance-cards');
  await mainTabs.getByRole('tab', { name: '基础信息', exact: true }).click();
  await expect(page.getByRole('link', { name: '测试ICP备00000000号', exact: true })).toHaveAttribute('href', 'https://beian.miit.gov.cn/');
  await expect(page.locator('footer')).toContainText('Unicore 设置验收');
  await expect(page).toHaveTitle('配套设置工作空间 · 工作空间');
  if (info.project.name === 'chromium') {
    // The version badge now lives under the sidebar brand lockup; keep the
    // geometric guarantee that it sits below the site name.
    const name = (await page.locator('.sidebar a[aria-label="配套设置工作空间"]').boundingBox())!;
    const tag = (await page.locator('.sidebar .version-badge').boundingBox())!;
    expect(tag.y).toBeGreaterThanOrEqual(name.y + name.height);
    await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeInViewport();
  }
  await capture(page, info, 'settings-site-tabs');
  await mainTabs.getByRole('tab', { name: '品牌图片', exact: true }).click();
  const icon = page.getByRole('form', { name: '站点图标', exact: true });
  await icon.locator('input[type="file"]').setInputFiles({ name: 'favicon.ico', mimeType: 'image/x-icon', buffer: await readFile('apps/web/static/favicon.ico') });
  await expect(icon.getByText('待保存预览，点击保存后生效。')).toBeVisible();
  await icon.getByRole('button', { name: '保存站点图标' }).click();
  await expect(page.getByText('图片已保存', { exact: true })).toBeVisible();
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', /^\/brand-assets\/[a-f0-9]+\.png$/);
  await expect(page.getByRole('tablist')).toHaveCount(1);
  await capture(page, info, 'settings-brand-tabs');
  await page.reload();
  await expect(mainTabs.getByRole('tab', { name: '品牌图片', exact: true })).toHaveAttribute('aria-selected', 'true');
  await mainTabs.getByRole('tab', { name: '基础信息', exact: true }).click();
  await expect(page.getByLabel('备案号（ICP）', { exact: true })).toHaveValue('测试ICP备00000000号');
  const bootstrap = (await (await page.request.get(`${instance.url}/api/v1/admin/bootstrap`)).json()).data;
  const license = process.env.FEATURE_LICENSE === 'true', updater = process.env.FEATURE_UPDATER !== 'false';
  expect(bootstrap.capabilities.license).toBe(license); expect(bootstrap.capabilities.updater).toBe(updater);
  await page.goto(`${instance.url}/admin/edition`);
  if (license) await expect(page.getByText('待对接',{exact:true})).toBeVisible();
  if (license || updater) {
    await expect(page.getByRole('heading', { name: '授权检测', exact: true })).toHaveCount(license ? 1 : 0);
    await expect(page.getByRole('heading', { name: '在线更新', exact: true })).toHaveCount(updater ? 1 : 0);
    if (license) await expect(page.getByRole('button', { name: '检测授权', exact: true })).toBeDisabled();
    if (updater) { await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeEnabled(); await expect(page.getByRole('heading',{name:'更新日志',exact:true})).toBeVisible(); await expect(page.getByRole('button',{name:'更新并重启',exact:true})).toBeDisabled(); }
  }
  expect((await page.request.get(`${instance.url}/api/v1/admin/license`)).status()).toBe(404);
  expect((await page.request.get(`${instance.url}/api/v1/admin/updates`)).status()).toBe(updater?200:404);
  await capture(page, info, `settings-edition-${license}-${updater}`);
  const invalid = await page.request.patch(`${instance.url}/api/v1/admin/settings`, { headers:{'X-CSRF-Token':bootstrap.csrf_token}, data: { changes: [{ key: 'site.icp_url', value: 'javascript:alert(1)' }] } });
  expect(invalid.status()).toBe(400);
  await page.goto(`${instance.url}/admin/site`);
  await page.getByLabel('备案号（ICP）', { exact: true }).fill('');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('link', { name: '测试ICP备00000000号', exact: true })).toHaveCount(0);
});

test('settings audit: platform security defaults, alias, admin path and public footer', async ({ page, instance }, info) => {
  const installed = await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: '设置平台', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong' } });
  expect(installed.status()).toBe(200);
  await page.goto(`${instance.url}/admin/site`);
  await page.getByLabel('页脚版权', { exact: true }).fill('平台版权示例');
  await page.getByLabel('备案号（ICP）', { exact: true }).fill('测试ICP备00000001号');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeDisabled();
  await page.goto(`${instance.url}/admin/account-policy`);
  await expect(page.getByLabel('登录图形验证码', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('邮箱验证码登录', { exact: true })).not.toBeChecked();
  await page.goto(`${instance.url}/admin/site?tab=registration`);
  await expect(page.getByLabel('注册图形验证码', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('注册绑定手机号', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('注册频率窗口（分钟）', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('窗口内注册上限', { exact: true })).toHaveValue('5');
  await page.getByRole('tab', { name: '安全与控制', exact: true }).click();
  await expect(page.getByLabel('登录图形验证码', { exact: true })).toBeChecked();
  await expect(page.getByLabel('注册图形验证码', { exact: true })).toBeChecked();
  await expect(page.getByLabel('邮件找回密码', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('管理后台路径', { exact: true })).toHaveValue('/admin');
  await capture(page, info, 'settings-security-tabs');
  await page.getByLabel('管理后台路径', { exact: true }).fill('/control');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeDisabled();
  // Saving the admin entrance remounts the console; the browser is redirected automatically.
  await page.waitForURL(/\/control($|\?|\/)/);
  await page.goto(`${instance.url}/control/mail`);
  await page.getByLabel('发件人别名', { exact: true }).fill('Unicore Notices');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('发件人别名', { exact: true })).toHaveValue('Unicore Notices');
  expect((await page.request.get(`${instance.url}/admin`)).status()).toBe(404);
  expect((await page.request.get(`${instance.url}/control`)).status()).toBe(200);
  await capture(page, info, 'settings-smtp-tabs');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'发送测试',exact:true})).toBeVisible();
  await page.goto(`${instance.url}/control/logs`);
  await page.getByRole('tab',{name:'通知投递',exact:true}).click();
  await expect(page.getByText('暂无投递任务',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'账号菜单',exact:true}).click();
  await page.getByRole('menuitem',{name:'退出登录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'管理员登录 · 设置平台',exact:true})).toBeVisible();
  await expect(page.locator('footer')).toContainText('平台版权示例');
  await expect(page.getByRole('link', { name: '测试ICP备00000001号', exact: true })).toBeVisible();
  await capture(page, info, 'settings-public-footer');
});

test('site links, safe footer, registration controls and maintenance recovery', async ({page,instance}, info) => {
  const response=await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}});
  expect(response.status()).toBe(200);
  await page.goto(`${instance.url}/admin/site`);
  await expect(page.getByLabel('站点地址',{exact:true})).toHaveValue(instance.url);
  await expect(page.getByLabel('管理员邮箱',{exact:true})).toHaveValue('admin@example.test');
  await page.getByLabel('站点地址',{exact:true}).fill('https://mail.example.test');
  await page.getByLabel('管理员邮箱',{exact:true}).fill('alerts@example.test');
  await page.getByLabel('公安备案号',{exact:true}).fill('示例公安备案123号');
  await page.getByLabel('自定义页脚 HTML',{exact:true}).fill('<p><a href="https://example.test/support">Support</a></p>');
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();
  await expect(page.locator('footer')).toContainText('示例公安备案123号');
  await expect(page.locator('footer').getByRole('link',{name:'Support',exact:true})).toHaveAttribute('href','https://example.test/support');
  await page.getByRole('tab',{name:'注册设置',exact:true}).click();
  await expect(page.getByLabel('开放注册',{exact:true})).not.toBeChecked();
  await page.getByLabel('开放注册',{exact:true}).click();
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();
  await page.getByLabel('注册邮箱验证',{exact:true}).click();
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.getByText('请先保存 SMTP 配置并成功发送测试邮件，再启用邮件账号流程',{exact:true})).toBeVisible();
  const persisted=await (await page.request.get(`${instance.url}/api/v1/admin/settings`)).json();
  expect(persisted.data.items.find((item:{key:string})=>item.key==='account.registration_enabled').value).toBe('true');
  await page.getByRole('tab',{name:'维护模式',exact:true}).click();
  await expect(page.getByLabel('开启维护模式',{exact:true})).not.toBeChecked();
  await page.getByLabel('维护提示信息',{exact:true}).fill('Planned work: back soon');
  await page.getByLabel('开启维护模式',{exact:true}).click();
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();
  await capture(page,info,'maintenance-admin');
  const publicPage=await page.context().newPage();
  await publicPage.goto(instance.url);
  await expect(publicPage.getByRole('heading',{name:'站点维护中',exact:true})).toBeVisible();
  await expect(publicPage.getByText('Planned work: back soon',{exact:true})).toBeVisible();
  expect((await page.request.get(`${instance.url}/api/v1/files`)).status()).toBe(503);
  expect((await page.request.get(`${instance.url}/api/v1/admin/storage/locations`)).status()).toBe(200);
  await instance.restart();await publicPage.reload();
  await expect(publicPage.getByRole('heading',{name:'站点维护中',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByLabel('开启维护模式',{exact:true})).toBeChecked();
  await page.getByLabel('开启维护模式',{exact:true}).click();
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();
  await publicPage.getByRole('button',{name:'重新检查',exact:true}).click();
  await expect(publicPage.getByRole('heading',{name:'站点维护中',exact:true})).toHaveCount(0);
  await publicPage.close();
});
