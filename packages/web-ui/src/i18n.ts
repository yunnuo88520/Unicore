// Author: yunnuo <ymz@ebox.vip>
// Description: Shared UI catalog, interpolation and locale formatting; business data stays untouched.
import english from './locales/en.json';
import licenseEnglish from './locales/license.en.json';
import updateEnglish from './locales/updates.en.json';
import { getPreferences, setPreferences, usePreferences, type Preferences } from './preferences';

// Static metadata retains message keys until the rendering component calls t().
export function defineMessages<const T>(messages:T):T { return messages; }

export type Locale = Preferences['locale'];
const catalog: Record<string, string> = {
  ...english, ...(__FEATURE_LICENSE__ ? licenseEnglish : {}), ...(__FEATURE_UPDATER__ ? updateEnglish : {}),
};
const validationPatterns = defineMessages([
  [/^至少 (\d+) 个字符$/, '至少 {{count}} 个字符'],
  [/^最多 (\d+) 个字符$/, '最多 {{count}} 个字符'],
  [/^最多 (\d+) 字节$/, '最多 {{count}} 字节'],
] as const);
export function t<T>(value: T, parameters?: Record<string, unknown>): T {
  if (typeof value !== 'string') return value;
  let key: string = value;
  let variables = parameters;
  if (!catalog[key]) for (const [pattern, template] of validationPatterns) {
    const match = key.match(pattern);
    if (match) { key = template; variables = { count: match[1] }; break; }
  }
  const text = getPreferences().locale === 'en' ? (catalog[key] ?? key) : key;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(variables?.[name] ?? `{{${name}}}`)) as T;
}
export function useLocale() { return usePreferences().locale; }
export function currentLocale() { return getPreferences().locale; }
export function setLocale(locale: Locale) { setPreferences({ locale }); }
export function useI18n() { const locale = useLocale(); return { locale, t, setLocale }; }
export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) { return new Date(value).toLocaleString(currentLocale(), options); }
