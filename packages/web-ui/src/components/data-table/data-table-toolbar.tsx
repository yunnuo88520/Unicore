// Author: yunnuo <ymz@ebox.vip>
// Description: Standard list toolbar: search field, filter slot, primary actions and the persisted column-visibility menu.
import { SearchField } from '@unicore/ui/controls';
import type { ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
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

export function DataTableToolbar({ search, summary, children, actions, columnMenu, className }: {
  search?: DataTableSearch;
  /** Result summary shown on the leading edge: a muted label over the current count. */
  summary?: { label: ReactNode; value: ReactNode };
  /** Filters and secondary controls rendered after the search field. */
  children?: ReactNode;
  /** Primary actions pinned to the trailing edge, before the column menu. */
  actions?: ReactNode;
  columnMenu?: { entries: readonly ColumnMenuEntry[]; onToggle: (id: string, visible: boolean) => void };
  className?: string;
}) {
  const field = search && <div className={cn('flex min-w-40 items-center', summary ? 'w-full max-w-56 sm:w-56 sm:min-w-0 sm:flex-none' : 'min-w-44 flex-1 sm:max-w-xs')}>
    <SearchField label={search.label} maxLength={search.maxLength ?? 128} autoComplete="off" value={search.value} onValueChange={search.onChange} className="min-w-0 flex-1" />
  </div>;
  // The summary layout mirrors the showcase pattern: the count leads on the
  // left, while filters, the search field and actions close the line on the
  // right. Enter still submits a search form without a visible submit button.
  if (summary) {
    const fieldNode = search?.onSubmit
      ? <form className="contents" onSubmit={event => { event.preventDefault(); search.onSubmit?.(); }}>{field}</form>
      : field;
    return <div className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <div className="flex flex-col justify-center">
        <p className="whitespace-nowrap text-xs text-muted">{summary.label}</p>
        <p className="whitespace-nowrap text-sm font-medium text-ink">{summary.value}</p>
      </div>
      <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        {children}
        {fieldNode}
        {actions}
        {columnMenu && <DataTableColumnMenu entries={columnMenu.entries} onToggle={columnMenu.onToggle} />}
      </div>
    </div>;
  }
  return <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
    {search?.onSubmit ? <form className="contents" onSubmit={event => { event.preventDefault(); search.onSubmit?.(); }}>{field}</form> : field}
    {children}
    <div className="ms-auto flex items-center gap-2">
      {actions}
      {columnMenu && <DataTableColumnMenu entries={columnMenu.entries} onToggle={columnMenu.onToggle} />}
    </div>
  </div>;
}
