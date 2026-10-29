// Author: yunnuo <ymz@ebox.vip>
// Description: Preference compatibility, fallback, cross-tab synchronization and locale behavior.
import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { defaultPreferences, getPreferences, preferencesKey, resetAppearance, resetPreferences, setPreferences, usePreferences } from './preferences';
import { t } from './i18n';

beforeEach(() => { localStorage.clear(); resetPreferences(); });
it('migrates the old theme and ignores invalid or unexpected stored values', () => {
  localStorage.setItem('unicore.theme', 'dark');
  expect(getPreferences().theme).toBe('dark');
  localStorage.setItem(preferencesKey, '{broken');
  expect(getPreferences()).toEqual(defaultPreferences);
  localStorage.setItem(preferencesKey, JSON.stringify({ locale: 'en', accent: 'javascript:', density: {}, extra: 'ignored' }));
  expect(getPreferences()).toEqual({ ...defaultPreferences, locale: 'en' });
  setPreferences({ accent: 'ocean', radius: 'round' });
  expect(getPreferences()).toMatchObject({ locale: 'en', accent: 'ocean', radius: 'round' });
});
it('keeps changes usable when the browser denies storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  setPreferences({ theme: 'dark', locale: 'en' });
  expect(getPreferences()).toMatchObject({ theme: 'dark', locale: 'en' });
  resetAppearance();
  expect(getPreferences()).toEqual({ ...defaultPreferences, locale: 'en' });
});
it('responds to same-window changes and browser storage events', () => {
  function Consumer() { const p = usePreferences(); return <output>{p.locale}:{p.theme}</output>; }
  render(<Consumer />);
  act(() => setPreferences({ locale: 'en' }));
  expect(screen.getByRole('status')).toHaveTextContent('en:system');
  act(() => {
    localStorage.setItem(preferencesKey, JSON.stringify({ locale: 'zh-CN', theme: 'dark' }));
    window.dispatchEvent(new StorageEvent('storage', { key: preferencesKey }));
  });
  expect(screen.getByRole('status')).toHaveTextContent('zh-CN:dark');
});
it('interpolates user data without translating it and resets only presentation', () => {
  setPreferences({ locale: 'en', theme: 'dark', direction: 'rtl', accent: 'rose' });
  expect(t('下载 {{v0}}', { v0: '我的笔记.txt' })).toBe('Download 我的笔记.txt');
  expect(t('至少 12 个字符')).toBe('Use at least 12 characters');
  resetAppearance();
  expect(getPreferences()).toEqual({ ...defaultPreferences, locale: 'en' });
});

it('uses memory when storage remains readable but writes fail', () => {
  localStorage.setItem(preferencesKey, JSON.stringify({ theme: 'light' }));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
  setPreferences({ theme: 'dark', accent: 'ocean' });
  expect(getPreferences()).toMatchObject({ theme: 'dark', accent: 'ocean' });
});
