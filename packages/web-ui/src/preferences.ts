// Author: yunnuo <ymz@ebox.vip>
// Description: Validated, versioned device preferences shared by every UI entry and browser tab.
import { useMemo, useSyncExternalStore } from 'react';

export const preferenceOptions = {
  locale: ['zh-CN', 'en'], theme: ['system', 'light', 'dark'],
  accent: ['brand', 'rose', 'emerald', 'ocean', 'amber', 'slate'],
  radius: ['default', 'none', 'small', 'medium', 'large', 'round'],
  density: ['default', 'compact', 'comfortable', 'large'], sidebar: ['plain', 'inset', 'floating'],
  layout: ['default', 'compact', 'full'], content: ['full', 'centered'],
} as const;
export type Preferences = { [K in keyof typeof preferenceOptions]: (typeof preferenceOptions)[K][number] };
export const defaultPreferences: Preferences = {
  locale: 'zh-CN', theme: 'system', accent: 'brand', radius: 'default', density: 'default',
  sidebar: 'plain', layout: 'default', content: 'full',
};
export const preferencesKey = 'unicore.preferences.v1';
const changed = 'unicore:preferences';
let memory = '';
let storageBlocked = false;
function snapshot() {
  if (storageBlocked) return memory;
  try {
    return localStorage.getItem(preferencesKey) ?? JSON.stringify({ theme: localStorage.getItem('unicore.theme') ?? defaultPreferences.theme });
  } catch { return memory; }
}
function decode(raw: string): Preferences {
  let input: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed;
  } catch { /* Invalid storage falls back to build defaults. */ }
  const result = { ...defaultPreferences };
  for (const key of Object.keys(preferenceOptions) as (keyof Preferences)[]) {
    if ((preferenceOptions[key] as readonly unknown[]).includes(input[key])) Object.assign(result, { [key]: input[key] });
  }
  return result;
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === preferencesKey || event.key === 'unicore.theme' || event.key === null) listener(); };
  window.addEventListener(changed, listener); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(changed, listener); window.removeEventListener('storage', storage); };
}
export function getPreferences() { return decode(snapshot()); }
export function setPreferences(patch: Partial<Preferences>) {
  const value = decode(JSON.stringify({ ...getPreferences(), ...patch }));
  memory = JSON.stringify(value);
  try { localStorage.setItem(preferencesKey, memory); localStorage.setItem('unicore.theme', value.theme); }
  catch { storageBlocked = true; /* Includes readable storage with a full or zero write quota. */ }
  window.dispatchEvent(new Event(changed));
}
export function resetPreferences() {
  memory = ''; storageBlocked = false;
  try { localStorage.removeItem(preferencesKey); localStorage.removeItem('unicore.theme'); }
  catch { storageBlocked = true; }
  window.dispatchEvent(new Event(changed));
}
export function usePreferences() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '');
  return useMemo(() => decode(raw), [raw]);
}
// Reset presentation while keeping the user's chosen language.
export function resetAppearance() { setPreferences({ ...defaultPreferences, locale: getPreferences().locale }); }
