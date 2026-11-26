// Author: yunnuo <ymz@ebox.vip>
// Description: Verify real site footer settings across short and long public pages.
import { mkdir } from 'node:fs/promises';
import { test, expect, installPlatform, sdkClient, loginClient, workspaceLogin } from './fixtures';

const longUnbrokenFooter = 'footercontentwithoutspaces'.repeat(32);
const longIcp = '京ICP备123456789012号-1234A';
const invalidIcp = '测试ICP备00000000号';
const overlongIcp = '1'.repeat(41);

test('site footer stays centered, in flow and within the viewport across locales and themes', async ({ page, instance }, info) => {
  test.setTimeout(90000);
  await installPlatform(instance);
  const admin = sdkClient(instance.url, 'administrator');
  await loginClient(admin, 'admin', 'administrator-password-strong');
  await admin.bootstrap();
  await expect(admin.patchSettings({ changes: [{ key: 'site.icp_number', value: invalidIcp }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(admin.patchSettings({ changes: [{ key: 'site.icp_number', value: overlongIcp }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await admin.patchSettings({ changes: [
    { key: 'site.copyright', value: 'Workspace polish footer' },
    { key: 'site.icp_number', value: longIcp },
    { key: 'site.icp_url', value: 'https://beian.miit.gov.cn/' },
    { key: 'site.police_number', value: '京公网安备110105000722' },
    { key: 'site.footer_html', value: '' },
  ] });

  const directory = `build/acceptance/workspace-polish/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  const viewportWidth = page.viewportSize()?.width ?? 1280;
  const viewportHeight = info.project.name === 'mobile' ? 812 : 720;
  await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
  for (const locale of ['zh-CN', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      await page.addInitScript(({ nextLocale, nextTheme }) => {
        localStorage.setItem('unicore.preferences.v1', JSON.stringify({ locale: nextLocale, theme: nextTheme }));
      }, { nextLocale: locale, nextTheme: theme });

      await admin.patchSettings({ changes: [
        { key: 'site.icp_number', value: '' },
        { key: 'site.icp_url', value: '' },
        { key: 'site.police_number', value: '' },
        { key: 'site.footer_html', value: '' },
      ] });
      await page.goto(`${instance.url}/login`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { name: locale === 'en' ? 'Sign in to Unicore' : '登录 Unicore', exact: true })).toBeVisible();
      await expect(page.locator('footer')).toContainText('Workspace polish footer');
      const shortLayout = await page.evaluate(() => {
        const copyright = document.querySelector('footer > div')!;
        const copyrightText = document.createRange();
        copyrightText.selectNodeContents(copyright);
        const text = copyrightText.getBoundingClientRect();
        return {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          copyrightCenter: text.left + text.width / 2,
          copyrightBottom: text.bottom,
        };
      });
      expect(shortLayout.documentWidth, `${locale}/${theme}: short page horizontal overflow`).toBeLessThanOrEqual(shortLayout.viewportWidth);
      expect(shortLayout.copyrightCenter, `${locale}/${theme}: copyright is not centered`).toBeCloseTo(shortLayout.viewportWidth / 2, 0);
      expect(shortLayout.viewportHeight - shortLayout.copyrightBottom, `${locale}/${theme}: copyright text should sit 8–20px above viewport bottom`).toBeGreaterThanOrEqual(8);
      expect(shortLayout.viewportHeight - shortLayout.copyrightBottom, `${locale}/${theme}: copyright text should sit 8–20px above viewport bottom`).toBeLessThanOrEqual(20);
      await page.screenshot({ path: `${directory}/short-copyright-${locale}-${theme}.png`, fullPage: true, animations: 'disabled' });

      await admin.patchSettings({ changes: [
        { key: 'site.icp_number', value: longIcp },
        { key: 'site.icp_url', value: 'https://beian.miit.gov.cn/' },
        { key: 'site.police_number', value: '京公网安备110105000722' },
      ] });
      await page.goto(`${instance.url}/login`);
      await expect(page.locator('footer')).toContainText(longIcp);
      await expect(page.locator('footer')).toContainText('京公网安备110105000722');
      const registrationBottom = await page.locator('footer').evaluate(footer => {
        const lastLine = footer.lastElementChild!;
        const range = document.createRange();
        range.selectNodeContents(lastLine);
        return { viewportHeight: innerHeight, textBottom: range.getBoundingClientRect().bottom };
      });
      expect(registrationBottom.viewportHeight - registrationBottom.textBottom, `${locale}/${theme}: last registration text should sit 8–20px above viewport bottom`).toBeGreaterThanOrEqual(8);
      expect(registrationBottom.viewportHeight - registrationBottom.textBottom, `${locale}/${theme}: last registration text should sit 8–20px above viewport bottom`).toBeLessThanOrEqual(20);
      await page.screenshot({ path: `${directory}/short-registration-${locale}-${theme}.png`, fullPage: true, animations: 'disabled' });

      await admin.patchSettings({ changes: [{ key: 'site.footer_html', value: `<p>${longUnbrokenFooter}</p>` }] });
      await page.goto(`${instance.url}/home`);
      await expect(page.getByRole('heading', { name: locale === 'en' ? 'One core, many ways to work' : '一份核心，多种工作方式', exact: true })).toBeVisible();
      await expect(page.locator('footer')).toContainText(longUnbrokenFooter);
      const longLayout = await page.evaluate(() => {
        const footer = document.querySelector('footer')!.getBoundingClientRect();
        const main = document.querySelector('main')!.getBoundingClientRect();
        return {
          viewportWidth: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          footerTop: footer.top + scrollY,
          mainBottom: main.bottom + scrollY,
          footerPosition: getComputedStyle(document.querySelector('footer')!).position,
        };
      });
      expect(longLayout.documentWidth, `${locale}/${theme}: long page horizontal overflow`).toBeLessThanOrEqual(longLayout.viewportWidth);
      expect(longLayout.footerTop, `${locale}/${theme}: footer overlaps long-page content`).toBeGreaterThanOrEqual(longLayout.mainBottom - 1);
      expect(longLayout.footerPosition, `${locale}/${theme}: footer must remain in document flow`).not.toBe('fixed');
      await page.screenshot({ path: `${directory}/long-${locale}-${theme}.png`, fullPage: true, animations: 'disabled' });
      await admin.patchSettings({ changes: [{ key: 'site.footer_html', value: '' }] });
    }
  }

  await admin.createUser({ username: 'footer-member', email: 'footer-member@example.test', password: 'footer-member-password-strong', role: 'user' });
  await admin.patchSettings({ changes: [
    { key: 'site.icp_number', value: '' },
    { key: 'site.icp_url', value: '' },
    { key: 'site.police_number', value: '' },
    { key: 'site.footer_html', value: '' },
  ] });
  for (const locale of ['zh-CN', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      await page.addInitScript(({ nextLocale, nextTheme }) => {
        localStorage.setItem('unicore.preferences.v1', JSON.stringify({ locale: nextLocale, theme: nextTheme }));
      }, { nextLocale: locale, nextTheme: theme });
      if (locale === 'zh-CN' && theme === 'light') {
        await workspaceLogin(page, instance.url, 'footer-member', 'footer-member-password-strong');
      }
      await page.goto(`${instance.url}/notes`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { name: locale === 'en' ? 'Personal notes' : '个人笔记', exact: true })).toBeVisible();
      await expect(page.getByText(locale === 'en' ? 'Start with your first idea' : '让第一条想法落在这里', { exact: true })).toBeVisible();
      const workspaceLayout = await page.evaluate(() => {
        const footer = document.querySelector('footer')!.getBoundingClientRect();
        const main = document.querySelector('.main-content')!.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(document.querySelector('footer > div')!);
        const copyright = text.getBoundingClientRect();
        return {
          viewportWidth: innerWidth,
          mainLeft: main.left,
          mainRight: main.right,
          mainBottom: main.bottom,
          footerBottom: footer.bottom,
          copyrightCenter: copyright.left + copyright.width / 2,
          viewportHeight: innerHeight,
          copyrightBottom: copyright.bottom,
          documentWidth: document.documentElement.scrollWidth,
        };
      });
      const contentCenter = (workspaceLayout.mainLeft + workspaceLayout.mainRight) / 2;
      expect(workspaceLayout.documentWidth, `${locale}/${theme}: workspace horizontal overflow`).toBeLessThanOrEqual(workspaceLayout.viewportWidth);
      expect(workspaceLayout.copyrightCenter, `${locale}/${theme}: workspace copyright is off-center`).toBeCloseTo(contentCenter, 0);
      expect(workspaceLayout.copyrightBottom, `${locale}/${theme}: workspace copyright should remain visible`).toBeLessThanOrEqual(workspaceLayout.viewportHeight);
      expect(workspaceLayout.viewportHeight - workspaceLayout.copyrightBottom, `${locale}/${theme}: workspace copyright should sit within 28px of viewport bottom`).toBeLessThanOrEqual(28);
      expect(workspaceLayout.footerBottom, `${locale}/${theme}: short workspace footer should stay at the content bottom`).toBeLessThanOrEqual(workspaceLayout.mainBottom + 1);
      expect(workspaceLayout.mainBottom - workspaceLayout.footerBottom, `${locale}/${theme}: footer should sit at the bottom of workspace content`).toBeLessThanOrEqual(48);
      await page.screenshot({ path: `${directory}/workspace-short-${locale}-${theme}.png`, fullPage: true, animations: 'disabled' });
    }
  }

  await admin.patchSettings({ changes: [
    { key: 'site.icp_number', value: longIcp },
    { key: 'site.icp_url', value: 'https://beian.miit.gov.cn/' },
    { key: 'site.police_number', value: '京公网安备110105000722' },
  ] });
  await page.addInitScript(() => localStorage.setItem('unicore.preferences.v1', JSON.stringify({ locale: 'zh-CN', theme: 'light' })));
  await page.goto(`${instance.url}/notes`);
  await expect(page.locator('[data-page-skeleton]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '个人笔记', exact: true })).toBeVisible();
  await expect(page.getByText('让第一条想法落在这里', { exact: true })).toBeVisible();
  await expect(page.locator('footer')).toContainText(longIcp);
  await expect(page.locator('footer')).toContainText('京公网安备110105000722');
  const workspaceRegistrationBottom = await page.locator('footer').evaluate(footer => {
    const lastLine = footer.lastElementChild!;
    const range = document.createRange();
    range.selectNodeContents(lastLine);
    return { viewportHeight: innerHeight, documentHeight: document.documentElement.scrollHeight, textBottom: range.getBoundingClientRect().bottom };
  });
  const workspaceRegistrationGap = workspaceRegistrationBottom.viewportHeight - workspaceRegistrationBottom.textBottom;
  expect(workspaceRegistrationBottom.documentHeight, 'workspace with registration details should fit within the short viewport').toBeLessThanOrEqual(workspaceRegistrationBottom.viewportHeight + 1);
  expect(workspaceRegistrationGap, 'workspace last registration row should sit at least 8px above the viewport bottom').toBeGreaterThanOrEqual(8);
  expect(workspaceRegistrationGap, 'workspace last registration row should sit within 28px of viewport bottom').toBeLessThanOrEqual(28);
  await page.screenshot({ path: `${directory}/workspace-registration-zh-CN-light.png`, fullPage: true, animations: 'disabled' });
});
