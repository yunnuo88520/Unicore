// Author: yunnuo <ymz@ebox.vip>
// Description: Standard list toolbar: search field, filter slot, primary actions and the persisted column-visibility menu.
import type { ReactNode } from 'react';
import { ChevronRight, Search, Settings2 } from 'lucide-react';
import { Button, Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Input } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { t } from '../../i18n';
import type { ColumnMenuEntry } from '../../column-visibility';

export type DataTableSearch = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** When provided the field submits on Enter and renders a submit button. */
  onSubmit?: () => void;
  maxLength?: number;
};

/** Column visibility menu fed by `useColumnVisibility().menu`; hiding stays a display choice. */
export function DataTableColumnMenu({ entries, onToggle }: { entries: readonly ColumnMenuEntry[]; onToggle: (id: string, visible: boolean) => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" aria-label={t('列设置')}><Settings2 size={15} aria-hidden="true" /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-40">
      <DropdownMenuLabel>{t('显示列')}</DropdownMenuLabel>
      {entries.map(column => <DropdownMenuItem key={column.id} onSelect={event => event.preventDefault()}>
        <Checkbox checked={column.visible} onChange={value => onToggle(column.id, value)} aria-label={column.label}>{column.label}</Checkbox>
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function DataTableToolbar({ search, children, actions, columnMenu, className }: {
  search?: DataTableSearch;
  /** Filters and secondary controls rendered after the search field. */
  children?: ReactNode;
  /** Primary actions pinned to the trailing edge, before the column menu. */
  actions?: ReactNode;
  columnMenu?: { entries: readonly ColumnMenuEntry[]; onToggle: (id: string, visible: boolean) => void };
  className?: string;
}) {
  const field = search && <label className="flex h-9 min-w-44 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 text-base text-muted shadow-tint focus-within:border-focus focus-within:ring-2 focus-within:ring-focus sm:max-w-xs">
    <Search size={15} aria-hidden="true" />
    <input aria-label={search.label} placeholder={search.placeholder} maxLength={search.maxLength ?? 128} autoComplete="off"
      className="w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-subtle"
      value={search.value} onChange={event => search.onChange(event.target.value)} />
    {search.onSubmit && <button type="submit" aria-label={t('搜索')} className="text-muted transition-colors hover:text-ink"><ChevronRight size={15} /></button>}
  </label>;
  return <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
    {search?.onSubmit ? <form className="contents" onSubmit={event => { event.preventDefault(); search.onSubmit?.(); }}>{field}</form> : field}
    {children}
    <div className="ms-auto flex items-center gap-2">
      {actions}
      {columnMenu && <DataTableColumnMenu entries={columnMenu.entries} onToggle={columnMenu.onToggle} />}
    </div>
  </div>;
}
