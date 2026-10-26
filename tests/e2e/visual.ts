// Author: yunnuo <ymz@ebox.vip>
// Description: Actual rendered page evidence at both theme palettes and viewport projects.
import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
export async function capture(page: Page, info: TestInfo, slug: string) {
  const original = await page.locator('html').getAttribute('data-theme');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${slug} overflow (${theme})`).toBe(true);
    const directory = `build/acceptance/m2c/${info.project.name}/${theme}`;
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: `${directory}/${slug}.png`, fullPage: true });
  }
  await page.evaluate(value => { if (value) document.documentElement.dataset.theme = value; else delete document.documentElement.dataset.theme; }, original);
  await page.emulateMedia({ colorScheme: 'light' });
}
