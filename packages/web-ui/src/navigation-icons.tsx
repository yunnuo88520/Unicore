// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit searchable Lucide registry shared by navigation and its editor; persisted names never resolve arbitrary modules.
import { icons, Circle, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Input } from '@unicore/ui';
import { useI18n } from './i18n';

export const navigationIcons = icons as Record<string, LucideIcon>;
export const navigationIconNames = Object.keys(navigationIcons).sort();
export function resolveNavigationIcon(name: string): LucideIcon { return navigationIcons[name] ?? Circle; }

export function NavigationIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const matches = useMemo(() => navigationIconNames.filter(name => name.toLowerCase().includes(search.toLowerCase())), [search]);
  const Icon = resolveNavigationIcon(value);
  return <div className="flex flex-col gap-2">
    <span className="flex items-center gap-2 text-sm"><Icon size={18} aria-hidden="true" />{value || t('未选择图标')}</span>
    <Input aria-label={t('搜索 Lucide 图标')} placeholder={t('搜索 Lucide 图标')} value={search} onChange={event => setSearch(event.target.value)} />
    <div role="group" aria-label={t('Lucide 图标库')} className="grid max-h-44 grid-cols-3 gap-1 overflow-y-auto rounded-md border border-line p-2 sm:grid-cols-4">
      {matches.slice(0, 100).map(name => { const Choice = navigationIcons[name]; return <Button key={name} type="button" size="sm" variant={name === value ? 'primary' : 'ghost'} aria-label={name} aria-pressed={name === value} onClick={() => onChange(name)} className="min-w-0 flex-col text-2xs"><Choice size={18} aria-hidden="true" /><span className="max-w-full truncate">{name}</span></Button>; })}
    </div>
    <small className="text-muted">{t('显示前 100 个匹配图标，请搜索缩小范围。')}</small>
  </div>;
}
