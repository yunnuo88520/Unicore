// Author: yunnuo <ymz@ebox.vip>
// Description: Standard data table renderer: one header/body loop, skeleton loading, error retry and icon empty state so list pages stop hand-rolling scaffolding.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { RotateCcw } from 'lucide-react';
import { flexRender, type Cell, type Row, type RowData, type Table as TableInstance, type TableFeatures } from '@tanstack/react-table';
import { Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { t } from '../../i18n';

export type DataTableEmptyProps = { icon?: LucideIcon; title: string; hint?: string; action?: ReactNode };

/** Rich empty state rendered inside the table body when a query returns no rows. */
export function DataTableEmpty({ icon: Icon, title, hint, action }: DataTableEmptyProps) {
  return <span className="flex flex-col items-center gap-1.5 py-2">
    {Icon && <Icon size={24} className="text-subtle" aria-hidden="true" />}
    <strong className="text-sm text-ink">{title}</strong>
    {hint && <span className="text-xs text-muted">{hint}</span>}
    {action}
  </span>;
}

// Column visibility is a per-page feature: when the instance carries it, hidden
// columns must drop out of the render; otherwise the core cell list is complete.
type VisibilityRow<TFeatures extends TableFeatures, TData extends RowData> = Row<TFeatures, TData> & { getVisibleCells?: () => Array<Cell<TFeatures, TData>> };

const cellsOf = <TFeatures extends TableFeatures, TData extends RowData>(row: Row<TFeatures, TData>): Array<Cell<TFeatures, TData>> => {
  const cells = (row as VisibilityRow<TFeatures, TData>).getVisibleCells?.() ?? row.getAllCells();
  return cells as Array<Cell<TFeatures, TData>>;
};

const SKELETON_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-1/3'] as const;

// Sorting is a per-page feature: announce the direction only when the column
// carries the API, leaving plain instances untouched.
type SortableColumn = { getIsSorted?: () => false | 'asc' | 'desc' };

const ariaSortOf = (column: unknown): 'ascending' | 'descending' | undefined => {
  const getIsSorted = (column as SortableColumn).getIsSorted;
  const sorted = typeof getIsSorted === 'function' ? getIsSorted.call(column) : false;
  return sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined;
};

export type DataTableProps<TFeatures extends TableFeatures, TData extends RowData> = {
  table: TableInstance<TFeatures, TData>;
  /** The list query is loading its first page; renders skeleton rows. */
  pending?: boolean;
  /** A background refetch is running; keeps rows visible and marks the wrapper busy. */
  busy?: boolean;
  /** The list query failed; renders one alert row with a retry action. */
  error?: { message: string } | null;
  onRetry?: () => void;
  /** Shown when the query succeeded without rows. */
  empty?: DataTableEmptyProps;
  pendingRows?: number;
  /** Passed to the inner <table>; use for min-width on dense tables. */
  className?: string;
  /** Passed to the bordered scroll wrapper. */
  wrapperClassName?: string;
};

export function DataTable<TFeatures extends TableFeatures, TData extends RowData>({
  table, pending = false, busy = false, error, onRetry, empty, pendingRows = 5, className, wrapperClassName,
}: DataTableProps<TFeatures, TData>) {
  const columnCount = table.getHeaderGroups()[0]?.headers.length ?? 0;
  const rows = pending ? [] : table.getRowModel().rows;
  return <div className={cn('min-w-0 rounded-lg border border-line', wrapperClassName)} aria-busy={pending || busy || undefined}>
    <Table className={className}>
      <TableHeader>
        {table.getHeaderGroups().map(group => <TableRow key={group.id} className="hover:bg-transparent">
          {group.headers.map(header => <TableHead key={header.id} aria-sort={ariaSortOf(header.column)}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}
        </TableRow>)}
      </TableHeader>
      <TableBody>
        {pending
          ? Array.from({ length: pendingRows }, (_, index) => <TableRow key={index}>
              <TableCell colSpan={columnCount}><Skeleton className={cn('h-5', SKELETON_WIDTHS[index % SKELETON_WIDTHS.length])} /></TableCell>
            </TableRow>)
          : error
            ? <TableRow><TableCell colSpan={columnCount}>
                <div role="alert" className="flex flex-wrap items-center justify-center gap-3 py-1">
                  <span className="text-sm text-danger">{t(error.message)}</span>
                  {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}><RotateCcw size={13} />{t('重试')}</Button>}
                </div>
              </TableCell></TableRow>
            : rows.length
              ? rows.map(row => <TableRow key={row.id}>
                  {cellsOf(row).map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                </TableRow>)
              : <TableRow><TableCell colSpan={columnCount} className="h-24 text-center"><DataTableEmpty icon={empty?.icon} title={empty?.title ?? t('暂无数据')} hint={empty?.hint} action={empty?.action} /></TableCell></TableRow>}
      </TableBody>
    </Table>
  </div>;
}
