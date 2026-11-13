// Author: yunnuo <ymz@ebox.vip>
// Description: Real DEV catalog flows at desktop/375px; screenshots are evidence, not visual baselines.
import type { Page, TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { baseIds, chartIds, compositeIds } from '../../packages/web-ui/src/pages/ui-preview/catalog';
import { test, expect } from './ui-system-fixtures';

type Locale = 'en' | 'zh-CN';
const categories = ['foundations', 'base', 'chart', 'composite', 'data-grid'] as const;
async function category(page: Page, id: typeof categories[number]) {
  const button = page.getByTestId(`catalog-category-${id}`);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
}
async function noPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth), { message: 'Horizontal overflow must stay inside local component scrollers' }).toBeLessThanOrEqual(1);
}
async function evidence(page: Page, info: TestInfo, locale: Locale, theme: string, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  const directory = join('build/ui-system', info.project.name, locale, theme);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${name}.png`);
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  await info.attach(`${locale}-${theme}-${name}`, { path, contentType: 'image/png' });
}

for (const locale of ['en', 'zh-CN'] as const) {
  test(`catalog navigation and accessible local flows (${locale})`, async ({ page, uiSystem }, info) => {
    await page.addInitScript(({ locale }) => {
      localStorage.setItem('unicore.preferences.v1', JSON.stringify({ locale, theme: 'system' }));
    }, { locale });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto(`${uiSystem.devURL}/ui-preview`);
    await expect(page.getByRole('heading', { level: 1, name: locale === 'en' ? 'Component preview' : '组件预览', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect(page.viewportSize()?.width).toBe(info.project.name === 'mobile' ? 375 : 1280);

    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const id of categories) {
        await category(page, id);
        const expectedIds = id === 'base' ? [...baseIds] : id === 'chart' ? [...chartIds] : id === 'composite' ? compositeIds.filter(value => value !== 'data-grid') : id === 'data-grid' ? ['data-grid'] : ['color', 'typography'];
        await expect(page.locator('[data-catalog-id]')).toHaveCount(expectedIds.length);
        expect(await page.locator('[data-catalog-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-catalog-id')))).toEqual(expectedIds);
        for (const family of expectedIds) await expect(page.locator(`[data-catalog-id="${family}"]`).getByRole('heading', { level: 2, name: family, exact: true }).first()).toBeAttached();
        await noPageOverflow(page);
        if (id === 'composite') {
          const profile = page.locator('[data-catalog-id="agent-creator"] form');
          const width = await profile.evaluate(element => element.getBoundingClientRect().width);
          expect(width).toBeLessThanOrEqual(577);
          expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
        }
        if (id === 'base') await expect(page.getByText(/one · false · 42/)).toHaveCount(0);
        await evidence(page, info, locale, theme, id);
        const featured = id === 'composite' ? ['composer-panel', 'calendar', 'agent-creator'] : id === 'chart' ? ['area', 'radial'] : id === 'data-grid' ? ['data-grid'] : [];
        for (const family of featured) {
          const section = page.locator(`[data-catalog-id="${family}"]`);
          await section.scrollIntoViewIfNeeded();
          const directory = join('build/ui-system', info.project.name, locale, theme);
          const path = join(directory, `component-${family}.png`);
          // Sticky workspace chrome must not paint over tall component captures.
          await page.addStyleTag({ content: '.topbar { visibility: hidden !important; }' });
          try { await section.screenshot({ path, animations: 'disabled' }); }
          finally { await page.locator('style').filter({ hasText: '.topbar { visibility: hidden !important; }' }).evaluateAll(nodes => nodes.forEach(node => node.remove())); }
          await info.attach(`${locale}-${theme}-component-${family}`, { path, contentType: 'image/png' });
        }
      }
    }

    await category(page, 'base');
    const input = page.locator('[data-catalog-id="input"]').getByRole('textbox', { name: locale === 'en' ? 'Account' : '账号', exact: true });
    await input.fill('sample-local-input');
    await expect(input).toHaveValue('sample-local-input');
    const dropdown = page.locator('[data-catalog-id="dropdown"]');
    await dropdown.getByRole('button', { name: locale === 'en' ? 'Open menu' : '打开菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: locale === 'en' ? 'New note' : '新建笔记', exact: true }).click();
    await expect(dropdown.getByRole('status')).toContainText(locale === 'en' ? 'New note' : '新建笔记');
    const calendar = page.locator('[data-catalog-id="date-calendar"]');
    const day = calendar.getByRole('grid').first().getByRole('button', { name: /14/ }).first();
    await day.click();
    await expect(day.locator('..')).toHaveAttribute('aria-selected', 'true');
    await expect(calendar.getByRole('status').first()).toContainText('2026-11-14');
    await day.press('ArrowRight');
    await expect(calendar.locator('button[data-date="2026-11-15"]').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(calendar.getByRole('status').first()).toContainText('2026-11-15');
    await noPageOverflow(page);

    await category(page, 'data-grid');
    const sample = page.locator('[data-catalog-id="data-grid"]');
    const grid = sample.getByRole('grid');
    await expect(grid).toHaveAttribute('aria-rowcount', '121');
    await grid.getByRole('gridcell', { name: 'Sample 1', exact: true }).click();
    await grid.press('Enter');
    const editor = grid.getByRole('textbox', { name: locale === 'en' ? 'Edit Name' : '编辑 名称', exact: true });
    await editor.fill('Edited sample');
    await editor.press('Enter');
    await expect(grid.getByRole('gridcell', { name: 'Edited sample', exact: true })).toBeVisible();
    await sample.getByRole('button', { name: locale === 'en' ? 'Undo' : '撤销', exact: true }).click();
    await expect(grid.getByRole('gridcell', { name: 'Sample 1', exact: true })).toBeVisible();
    await sample.getByRole('button', { name: locale === 'en' ? 'Redo' : '重做', exact: true }).click();
    await expect(grid.getByRole('gridcell', { name: 'Edited sample', exact: true })).toBeVisible();
    const search = sample.getByRole('textbox', { name: locale === 'en' ? 'Search rows' : '搜索行', exact: true });
    await search.fill('Edited sample');
    await expect(grid).toHaveAttribute('aria-rowcount', '2');
    await sample.getByRole('button', { name: locale === 'en' ? 'Export CSV' : '导出 CSV', exact: true }).click();
    await expect(sample.getByRole('status')).toContainText('Edited sample');
    await noPageOverflow(page);
    await evidence(page, info, locale, 'dark', 'grid-edited');
  });
}

test('shared form controls support slot editing, ranges, tags and cascading choices', async ({ page, uiSystem }, info) => {
  await page.addInitScript(() => localStorage.setItem('unicore.preferences.v1', JSON.stringify({ locale: 'en', theme: 'dark' })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${uiSystem.devURL}/ui-preview`);
  await category(page, 'base');
  const otp = page.locator('[data-catalog-id="input-otp"]');
  const code = otp.getByRole('textbox', { name: 'Code', exact: true });
  await code.pressSequentially('123');
  await code.press('Backspace');
  await expect(code).toHaveValue('12');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('123456'));
  await code.press('ControlOrMeta+A');
  await code.press('ControlOrMeta+V');
  await expect(code).toHaveValue('123456');
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  const bounds = (await code.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width * 2.5 / 6, bounds.y + bounds.height / 2);
  await page.keyboard.type('9');
  await expect(code).toHaveValue('129456');
  const slider = page.locator('[data-catalog-id="slider"]');
  const lower = slider.getByRole('spinbutton', { name: 'Minimum', exact: true });
  await lower.fill('25');
  await expect(slider.getByRole('slider', { name: /Minimum/ })).toHaveValue('25');
  await slider.getByRole('slider', { name: /Minimum/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(lower).toHaveValue('26');
  const tags = page.locator('[data-catalog-id="tag-group"]');
  const tag = tags.getByRole('textbox', { name: 'Tags', exact: true });
  await tag.fill('TypeScript'); await tag.press('Enter');
  await expect(tags.getByRole('button', { name: 'Remove TypeScript', exact: true })).toBeVisible();
  await tags.getByRole('button', { name: 'Remove TypeScript', exact: true }).click();
  await expect(tags.getByRole('button', { name: 'Remove TypeScript', exact: true })).toHaveCount(0);
  const dates = page.locator('[data-catalog-id="date-picker"]');
  const birthday = dates.getByRole('group', { name: 'Date of birth', exact: true });
  await birthday.getByRole('listbox', { name: 'Year', exact: true }).selectOption('2000');
  await birthday.getByRole('listbox', { name: 'Month', exact: true }).selectOption('2');
  await birthday.getByRole('listbox', { name: 'Day', exact: true }).selectOption('29');
  await expect(dates.getByRole('status').last()).toContainText('2000-02-29');
  await birthday.getByRole('listbox', { name: 'Year', exact: true }).selectOption('2001');
  await expect(birthday.getByRole('listbox', { name: 'Day', exact: true })).toHaveValue('28');
  const directory = join('build/ui-system', info.project.name, 'en', 'dark');
  await mkdir(directory, { recursive: true });
  await birthday.screenshot({ path: join(directory, 'form-birth-date.png'), animations: 'disabled' });
  await page.locator('[data-catalog-id="tree-view"]').getByRole('button', { name: 'Cascading selection', exact: true }).click();
  const cascade = page.getByRole('dialog', { name: 'Cascading selection', exact: true });
  await cascade.getByRole('option', { name: 'Option one', exact: true }).click();
  await cascade.getByRole('option', { name: 'Option two', exact: true }).click();
  await expect(cascade.getByRole('listbox')).toHaveCount(3);
  await page.screenshot({ path: join(directory, 'form-cascader.png'), animations: 'disabled' });
  await cascade.getByRole('option', { name: 'Option three', exact: true }).click();
  await expect(cascade).toHaveCount(0);
  await noPageOverflow(page);
});
