// Author: yunnuo <ymz@ebox.vip>
// Description: Searchable Lucide icon picker over the curated navigation catalog for the menu editor.
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@unicore/ui';
import { useI18n } from './i18n';
import { navigationIconCatalog } from './navigation-icon-catalog';
import iconKeywords from './navigation-icon-keywords.json';
import { navigationIcons, resolveNavigationIcon } from './navigation-icons';

/** Catalog entries paired with their keyword text and resolved component for the editor picker. */
const keywordOf = iconKeywords as Record<string, string>;
const catalogEntries = navigationIconCatalog.map(name => ({ name, zh: keywordOf[name] ?? '', Icon: resolveNavigationIcon(name) }));

// The menu editor's icon picker: one searchable grid over the curated
// catalog. Search matches the Lucide name or the Chinese keywords; clearing
// falls back to the workspace's own default icon resolution.
export function NavigationIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const matches = useMemo(() => (
    query ? catalogEntries.filter(entry => entry.name.toLowerCase().includes(query) || entry.zh.toLowerCase().includes(query)) : catalogEntries
  ), [query]);
  const Current = resolveNavigationIcon(value);
  const select = (icon: string) => { onChange(icon); setOpen(false); };
  void navigationIcons;
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setSearch(''); }}>
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{t('图标')}</span>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" aria-label={t('选择图标')} className="w-full justify-start">
          <Current size={16} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-start">{value || t('默认图标')}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
    </div>
    <PopoverContent aria-label={t('图标选择器')} className="w-[min(22rem,calc(100vw-2rem))]">
      <div className="flex flex-col gap-2">
        <Input aria-label={t('搜索图标名称或用途')} placeholder={t('搜索图标名称或用途')} value={search} autoComplete="off" onChange={event => setSearch(event.target.value)} />
        <div role="group" aria-label={t('图标选择器')} className="grid max-h-[min(12rem,30dvh)] grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] justify-items-center gap-1 overflow-y-auto rounded-lg border border-line p-1">
          {matches.map(({ name, Icon }) => (
            <Button key={name} type="button" size="icon" variant={name === value ? 'primary' : 'ghost'}
              aria-label={name} aria-pressed={name === value} title={name} onClick={() => select(name)}>
              <Icon size={16} aria-hidden="true" />
            </Button>
          ))}
          {!matches.length && <p className="col-span-full py-4 text-center text-sm text-muted">{t('没有匹配的图标')}</p>}
        </div>
        {value && <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => select('')}>{t('使用默认图标')}</Button>}
      </div>
    </PopoverContent>
  </Popover>;
}
