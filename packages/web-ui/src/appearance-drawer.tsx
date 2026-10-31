// Author: yunnuo <ymz@ebox.vip>
// Description: Device preference schema, direction-stable previews and an accessible side drawer.
import { Check, Languages, RotateCcw, X } from 'lucide-react';
import { preferenceOptions, resetAppearance, setPreferences, usePreferences, type Preferences } from './preferences';
import { defineMessages, t, useI18n } from './i18n';
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui';
import { cn } from './lib/cn';

type PreferenceLabels = { [K in keyof Preferences]: Record<Preferences[K], string> };
const labels = defineMessages({
  theme: { system: '跟随系统', light: '浅色', dark: '深色' },
  accent: { brand: '默认', rose: '玫瑰', emerald: '翡翠', ocean: '海洋', amber: '琥珀', slate: '石墨' },
  radius: { default: '自动', none: '直角', small: '小', medium: '中', large: '大', round: '圆润' },
  density: { default: '自动', compact: '紧凑', comfortable: '舒适', large: '大字号' },
  sidebar: { plain: '标准', inset: '内嵌', floating: '悬浮' },
  layout: { default: '默认', compact: '紧凑', full: '全宽布局' },
  content: { full: '全宽', centered: '居中' },
  locale: { 'zh-CN': '中文', en: 'English' },
}) satisfies PreferenceLabels;
const groups = defineMessages([
  { name: 'theme', title: '主题' }, { name: 'accent', title: '配色预设' },
  { name: 'radius', title: '圆角' }, { name: 'density', title: '密度' },
  { name: 'sidebar', title: '侧边栏' }, { name: 'layout', title: '布局' },
  { name: 'content', title: '内容布局' }, { name: 'locale', title: '语言' },
]) satisfies readonly { name: keyof Preferences; title: string }[];

const columns: Record<keyof Preferences, string> = {
  theme: 'grid-cols-3', accent: 'grid-cols-3', radius: 'grid-cols-6', density: 'grid-cols-4',
  sidebar: 'grid-cols-3', layout: 'grid-cols-3', content: 'grid-cols-2', locale: 'grid-cols-2',
};

function PreferencePreview({ name, value }: { name: keyof Preferences; value: string }) {
  if (name === 'locale') return <Languages size={19} aria-hidden="true" />;
  if (name === 'density') return <b className="text-md font-medium">{({ default: 'Aa', compact: 'A', comfortable: 'A+', large: 'A++' } as Record<string, string>)[value]}</b>;
  if (name === 'radius') return <i aria-hidden="true" className="size-6 border-2 border-ink bg-line" style={{ borderRadius: ({ none: 0, small: 3, medium: 6, large: 9, round: 999 } as Record<string, number>)[value] ?? 6 }} />;
  if (name === 'accent') return <i aria-hidden="true" className="h-full w-full rounded-sm" style={{ background: `var(--preset-${value})` }} />;
  if (name === 'theme') {
    const background = value === 'light'
      ? 'var(--light-surface)'
      : value === 'dark'
        ? 'var(--dark-surface)'
        : 'linear-gradient(105deg, var(--light-surface) 50%, var(--dark-surface) 50%)';
    const track = value === 'dark' ? 'var(--dark-border)' : 'var(--light-border)';
    const line = value === 'dark' ? 'var(--dark-muted)' : 'var(--light-muted)';
    return <span aria-hidden="true" className="flex h-full w-full gap-1 rounded-sm p-1" style={{ background }}>
      <i className="flex w-1/4 flex-col gap-0.5 rounded-xs p-0.5" style={{ background: track }}>
        <b className="h-0.5 w-full rounded-full" style={{ background: line }} />
        <b className="h-0.5 w-2/3 rounded-full" style={{ background: line }} />
      </i>
      <i className="flex flex-1 flex-col gap-1 pt-0.5">
        <b className="h-1 w-1/2 rounded-full" style={{ background: line }} />
        <b className="h-0.5 w-full rounded-full" style={{ background: track }} />
        <b className="h-2.5 w-full rounded-xs" style={{ background: track }} />
      </i>
    </span>;
  }
  // Sidebar, layout and content previews share the miniature shell mock.
  return <span aria-hidden="true" className="flex h-full w-full items-stretch gap-1">
    <i className={cn('flex flex-col justify-start gap-0.5 rounded-xs bg-line p-1',
      name === 'layout' && value === 'full' && 'hidden',
      name === 'layout' && value === 'compact' && 'w-[10%]',
      name === 'content' && 'hidden',
      name === 'sidebar' && value === 'floating' && 'h-4/5 bg-primary shadow-[0_0_0_3px_var(--surface-alt)]',
      name === 'sidebar' && value === 'inset' && 'bg-surface-alt')}>
      <b className="h-0.5 w-full rounded-full bg-muted" />
      <b className="h-0.5 w-full rounded-full bg-muted" />
      <b className="h-0.5 w-2/3 rounded-full bg-muted" />
    </i>
    <i className={cn('flex flex-1 flex-col gap-1 rounded-xs bg-surface-alt pt-1',
      name === 'layout' && value === 'full' && 'border-t-4 border-muted',
      name === 'content' && 'h-5 items-center justify-center self-center border border-muted !bg-line p-0')}>
      <b className="h-1.5 w-2/3 rounded-full bg-subtle" />
      <b className={cn('h-1 rounded-full bg-line', name === 'content' && 'hidden')} />
      <b className={cn('h-2.5 w-full rounded-xs bg-line', name === 'content' && 'hidden')} />
    </i>
  </span>;
}

function Choices<K extends keyof Preferences>({ name, title, current }: { name: K; title: string; current: Preferences[K] }) {
  const { t } = useI18n();
  return <fieldset className="flex flex-col gap-2.5">
    <legend className="text-sm font-semibold text-ink">{t(title)}</legend>
    <div className={cn('grid gap-2.5', columns[name])}>
      {preferenceOptions[name].map(value => {
        const selected = current === value;
        return <button type="button" key={value} aria-pressed={selected} onClick={() => setPreferences({ [name]: value })}
          className="group flex min-w-0 flex-col items-stretch gap-1.5 rounded-md text-center text-xs text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <span aria-hidden="true" className={cn('relative flex h-14 items-center justify-center gap-1 rounded-md border bg-surface p-1.5 transition-colors',
            selected ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-line group-hover:border-primary')}>
            <PreferencePreview name={name} value={value} />
            {selected && <span className="absolute -end-1 -top-1.5 flex size-4 items-center justify-center rounded-full border-2 border-surface bg-primary text-on-primary"><Check size={10} /></span>}
          </span>
          <span>{t((labels[name] as Record<string, string>)[value])}</span>
        </button>;
      })}
    </div>
  </fieldset>;
}

export function AppearanceControls() {
  const current = usePreferences();
  // The workspace and its controls keep a stable left-to-right order.
  return <div className="flex flex-col gap-6" dir="ltr">
    {groups.map(({ name, title }) => <Choices key={name} name={name} title={title} current={current[name]} />)}
  </div>;
}

export function AppearanceDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showClose={false} dir="ltr" aria-labelledby="appearance-drawer-title" aria-describedby="appearance-drawer-description"
      className="inset-y-0 end-0 start-auto top-0 h-dvh max-h-none w-[min(420px,100%)] max-w-none translate-x-0 translate-y-0 rounded-none rounded-s-xl border-0 border-s p-0">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3.5 border-b border-line px-5 pb-4 pt-5">
          <div>
            <DialogTitle id="appearance-drawer-title" className="text-lg font-semibold text-ink">{t('主题设置')}</DialogTitle>
            <DialogDescription id="appearance-drawer-description" className="mt-1 text-xs text-muted">{t('按你的偏好调整外观与布局。')}</DialogDescription>
          </div>
          <DialogClose asChild>
            <button className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-primary-soft hover:text-accent focus-visible:ring-2 focus-visible:ring-focus" aria-label={t('关闭主题设置')}><X size={19} /></button>
          </DialogClose>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <AppearanceControls />
        </div>
        <footer className="flex shrink-0 flex-col gap-3 border-t border-line px-5 py-4">
          <small className="text-xs text-muted">{t('即时生效，仅保存在当前客户端。')}</small>
          <Button variant="secondary" onClick={resetAppearance}><RotateCcw size={15} aria-hidden="true" />{t('重置外观')}</Button>
        </footer>
      </div>
    </DialogContent>
  </Dialog>;
}
