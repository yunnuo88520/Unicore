// Author: yunnuo <ymz@ebox.vip>
// Description: Real settings tabs, isolated drafts, persistence, branding and optional edition UI.
import { readFile, mkdir } from 'node:fs/promises';
import { test, expect, installStandalone } from './fixtures';
import { capture } from './visual';

test('settings audit: site identity, ICP, ICO and compile-time placeholders', async ({ page, instance }, info) => {
  await installStandalone(instance);
  await page.goto(`${instance.url}/#site`);
  const mainTabs = page.getByRole('tablist', { name: '设置分组', exact: true });
  await expect(page.getByRole('tablist')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '外观设置', exact: true })).toHaveCount(0);
  await expect(mainTabs.getByRole('tab', { name: '安全与控制', exact: true })).toHaveCount(0);
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
  const persisted = (await (await page.request.get(`${instance.url}/api/v1/settings`)).json()).data;
  expect(persisted.items.find((item: { key: string }) => item.key === 'appearance.theme').value).toBe('system');
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
    const name = (await page.locator('.brand .brand-name').boundingBox())!;
    const tag = (await page.locator('.brand-tag').boundingBox())!;
    expect(tag.y).toBeGreaterThanOrEqual(name.y + name.height);
    await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeInViewport();
  }
  await capture(page, info, 'settings-site-tabs');
  await mainTabs.getByRole('tab', { name: '品牌图片', exact: true }).click();
  const icon = page.getByRole('form', { name: '站点图标', exact: true });
  await icon.getByLabel('选择站点图标').setInputFiles({ name: 'favicon.ico', mimeType: 'image/x-icon', buffer: await readFile('apps/web/static/favicon.ico') });
  await expect(icon.getByText('待保存预览，点击保存后生效。')).toBeVisible();
  await icon.getByRole('button', { name: '保存站点图标' }).click();
  await expect(icon.getByText('图片已保存', { exact: true })).toBeVisible();
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', /^\/brand-assets\/[a-f0-9]+\.png$/);
  await expect(page.getByRole('tablist')).toHaveCount(1);
  await capture(page, info, 'settings-brand-tabs');
  await page.reload();
  await expect(mainTabs.getByRole('tab', { name: '品牌图片', exact: true })).toHaveAttribute('aria-selected', 'true');
  await mainTabs.getByRole('tab', { name: '基础信息', exact: true }).click();
  await expect(page.getByLabel('备案号（ICP）', { exact: true })).toHaveValue('测试ICP备00000000号');
  const bootstrap = (await (await page.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
  const license = process.env.FEATURE_LICENSE === 'true', updater = process.env.FEATURE_UPDATER === 'true';
  expect(bootstrap.capabilities.license).toBe(license); expect(bootstrap.capabilities.updater).toBe(updater);
  const editionTab = mainTabs.getByRole('tab', { name: '授权与升级', exact: true });
  await expect(editionTab).toHaveCount(license || updater ? 1 : 0);
  if (license || updater) {
    await editionTab.click();
    await expect(page.getByRole('heading', { name: '授权检测', exact: true })).toHaveCount(license ? 1 : 0);
    await expect(page.getByRole('heading', { name: '在线升级', exact: true })).toHaveCount(updater ? 1 : 0);
    if (license) await expect(page.getByRole('button', { name: '检测授权', exact: true })).toBeDisabled();
    if (updater) { await expect(page.getByRole('button', { name: '检查新版本', exact: true })).toBeDisabled(); await expect(page.getByText('暂无版本服务返回的更新日志。')).toBeVisible(); }
  }
  for (const path of ['/api/v1/admin/license', '/api/v1/admin/updates']) expect((await page.request.get(`${instance.url}${path}`)).status()).toBe(404);
  await capture(page, info, `settings-edition-${license}-${updater}`);
  const invalid = await page.request.patch(`${instance.url}/api/v1/settings`, { data: { changes: [{ key: 'site.icp_url', value: 'javascript:alert(1)' }] } });
  expect(invalid.status()).toBe(400);
  await mainTabs.getByRole('tab', { name: '基础信息', exact: true }).click();
  await page.getByLabel('备案号（ICP）', { exact: true }).fill('');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('link', { name: '测试ICP备00000000号', exact: true })).toHaveCount(0);
});

test('settings audit: platform security defaults, alias, admin path and public footer', async ({ page, instance }, info) => {
  const installed = await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: '设置平台', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong' } });
  expect(installed.status()).toBe(200);
  await page.goto(`${instance.url}/#site`);
  await page.getByLabel('页脚版权', { exact: true }).fill('平台版权示例');
  await page.getByLabel('备案号（ICP）', { exact: true }).fill('测试ICP备00000001号');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: '安全与控制', exact: true }).click();
  await expect(page.getByLabel('登录图形验证码', { exact: true })).toHaveValue('true');
  await expect(page.getByLabel('注册图形验证码', { exact: true })).toHaveValue('true');
  await expect(page.getByLabel('管理后台路径', { exact: true })).toHaveValue('/admin');
  await page.getByLabel('管理后台路径', { exact: true }).fill('/control');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeDisabled();
  await capture(page, info, 'settings-security-tabs');
  await page.getByRole('tab', { name: '邮件服务', exact: true }).click();
  await page.getByLabel('发件人别名', { exact: true }).fill('Unicore Notices');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存设置', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('发件人别名', { exact: true })).toHaveValue('Unicore Notices');
  expect((await page.request.get(`${instance.url}/admin`)).status()).toBe(404);
  expect((await page.request.get(`${instance.url}/control`)).status()).toBe(200);
  await capture(page, info, 'settings-smtp-tabs');
  await page.getByRole('tab', { name: '邮件模板', exact: true }).click();
  await page.getByLabel('模板类型', { exact: true }).selectOption('notification');
  await expect(page.getByRole('tablist')).toHaveCount(1);
  await expect(page.frameLocator('iframe').getByRole('heading', { name: '系统设置已更新', exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe').locator('body')).not.toContainText('验证码');
  const directory = `build/acceptance/settings/${info.project.name}`; await mkdir(directory, { recursive: true });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme }); await page.locator('iframe').scrollIntoViewIfNeeded();
    await page.locator('iframe').screenshot({ path: `${directory}/notification-${colorScheme}.png` });
  }
  await capture(page, info, 'settings-platform-notification');
  await page.getByRole('tab', { name: '投递记录', exact: true }).click();
  await expect(page.getByText('暂无邮件任务', { exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登录 设置平台', exact: true })).toBeVisible();
  await expect(page.locator('footer')).toContainText('平台版权示例');
  await expect(page.getByRole('link', { name: '测试ICP备00000001号', exact: true })).toBeVisible();
  await capture(page, info, 'settings-public-footer');
});
