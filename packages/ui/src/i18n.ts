// Author: yunnuo <ymz@ebox.vip>
// Description: Locale-neutral translation surface: components render keys verbatim until the host wires a catalog.
import { getPreferences, setPreferences, usePreferences, type Preferences } from '@unicore/theme/preferences';

type Translator = (value: string, parameters?: Record<string, unknown>) => string;
let translate: Translator = value => value;
/** Host applications inject their catalog here; unwired consumers render source keys verbatim. */
export function setTranslator(next: Translator) { translate = next; }
export function defineMessages<T extends Record<string, string>>(messages: T): T { return messages; }
export function t<T>(value: T, parameters?: Record<string, unknown>): T {
  if (typeof value !== 'string') return value;
  return translate(value, parameters).replace(/\{\{(\w+)\}\}/g, (_, name) => String(parameters?.[name] ?? `{{${name}}}`)) as T;
}
export function useLocale() { return usePreferences().locale; }
export function currentLocale() { return getPreferences().locale; }
export function setLocale(locale: Preferences['locale']) { setPreferences({ locale }); }
export function useI18n() {
  const locale = useLocale();
  return { locale, t, setLocale };
}
