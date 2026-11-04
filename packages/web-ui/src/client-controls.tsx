// Author: yunnuo <ymz@ebox.vip>
// Description: Shared language, theme and local appearance controls for every UI entry.
import { useEffect, useRef, useState } from 'react';
import { Check, Languages, Moon, Settings2, Sun } from 'lucide-react';
import { setLocale, t, useLocale } from './i18n';
import { setPreferences } from '@unicore/theme/preferences';
import { useResolvedTheme } from '@unicore/theme';
import { AppearanceDrawer } from './appearance-drawer';
import { Tooltip } from './ui';

const iconButton = 'inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-primary-soft hover:text-accent focus-visible:ring-2 focus-visible:ring-focus';

export function ClientControls() {
  const locale = useLocale();
  const [language, setLanguage] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dark = useResolvedTheme() === 'dark';
  useEffect(() => {
    if (!language) return;
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setLanguage(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [language]);
  function closeLanguage() { setLanguage(false); trigger.current?.focus(); }
  return <div className="flex items-center gap-2">
    <div className="relative" ref={ref} onKeyDown={event => {
      if (event.key === 'Escape' && language) { event.preventDefault(); closeLanguage(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (!language) { setLanguage(true); return; }
        const options = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
        options[next]?.focus();
      }
      if (event.key === 'Tab') setLanguage(false);
    }}>
      <Tooltip label={t('切换语言')}>
        <button ref={trigger} className={iconButton} aria-label={t('切换语言')} aria-haspopup="menu" aria-expanded={language} onClick={() => setLanguage(value => !value)}><Languages size={18} /></button>
      </Tooltip>
      {language && <div className="absolute end-0 top-full z-[45] mt-2 min-w-36 rounded-lg border border-line bg-surface p-1 shadow-modal" role="menu" aria-label={t('语言')}>
        {(['zh-CN', 'en'] as const).map(value => <button type="button" role="menuitemradio" tabIndex={-1} aria-checked={locale === value} key={value} lang={value}
          className="flex w-full items-center justify-between gap-4 rounded-sm px-2.5 py-2 text-start text-sm text-ink transition-colors outline-none hover:bg-primary-soft focus-visible:bg-primary-soft"
          onClick={() => { setLocale(value); closeLanguage(); }}>
          {value === 'zh-CN' ? t('中文') : 'English'}
          {locale === value && <Check size={15} aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
    <Tooltip label={t('切换主题')}>
      <button className={iconButton} aria-label={t('切换主题')} onClick={() => setPreferences({ theme: dark ? 'light' : 'dark' })}>{dark ? <Moon size={18} /> : <Sun size={18} />}</button>
    </Tooltip>
    <Tooltip label={t('主题设置')}>
      <button className={iconButton} aria-label={t('主题设置')} onClick={event => { event.currentTarget.focus(); setAppearance(true); }}><Settings2 size={18} /></button>
    </Tooltip>
    {appearance && <AppearanceDrawer onClose={() => setAppearance(false)} />}
  </div>;
}
