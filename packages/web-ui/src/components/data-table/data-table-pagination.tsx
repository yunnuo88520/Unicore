// Author: yunnuo <ymz@ebox.vip>
// Description: Standard pagination bar in two shapes: bound to a TanStack paginated instance or driven by server-side page state.
import { Button, SimpleSelect } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { t } from '../../i18n';

// Minimal structural view of a pagination-enabled table so the bar stays
// decoupled from the instance's concrete feature set. `state` is the v9
// instance snapshot; pagination exists when the page registered the feature.
export type DataTablePager = {
  state: { pagination: { pageIndex: number; pageSize: number } };
  getPageCount?: () => number;
  getCanPreviousPage(): boolean;
  getCanNextPage(): boolean;
  previousPage(): void;
  nextPage(): void;
  setPageSize?: (size: number) => void;
};

export type DataTablePaginationProps = {
  /** Client-side mode: a paginated TanStack table instance. */
  table?: DataTablePager;
  /** Server-side mode: current 1-based page and page size from the caller's query state. */
  page?: number;
  pageSize?: number;
  /** Server-side mode: total row count; client mode falls back to the page count. */
  total?: number;
  /** Server-side mode: called with the next 1-based page. */
  onPageChange?: (page: number) => void;
  /** Renders the page-size select in either mode. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  disabled?: boolean;
  /** Extra classes for the bar root; pages may carry stable test hooks here. */
  className?: string;
};

export function DataTablePagination({ table, page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50], disabled = false, className }: DataTablePaginationProps) {
  const current = table ? table.state.pagination.pageIndex + 1 : page ?? 1;
  const size = table ? table.state.pagination.pageSize : pageSize ?? pageSizeOptions[0];
  const pageCount = table ? table.getPageCount?.() ?? 1 : total != null && size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
  const canPrevious = table ? table.getCanPreviousPage() : current > 1;
  const canNext = table ? table.getCanNextPage() : current < pageCount;
  const goPrevious = () => table ? table.previousPage() : onPageChange?.(current - 1);
  const goNext = () => table ? table.nextPage() : onPageChange?.(current + 1);
  const changeSize = (next: number) => {
    if (table) table.setPageSize?.(next);
    onPageSizeChange?.(next);
  };
  return <div className={cn('flex flex-wrap items-center justify-between gap-3 text-xs text-muted', className)}>
    {!table && <span>{t('共 {{count}} 条', { count: total ?? 0 })}</span>}
    <div className="flex flex-wrap items-center gap-2">
      {onPageSizeChange && <SimpleSelect label={t('每页条数')} className="h-8 w-28" value={String(size)} disabled={disabled}
        onChange={value => changeSize(Number(value))}
        options={pageSizeOptions.map(option => ({ value: String(option), label: t('每页 {{v0}} 条', { v0: option }) }))} />}
      <Button variant="secondary" size="sm" disabled={!canPrevious || disabled} onClick={goPrevious}>{t('上一页')}</Button>
      <span>{t('第 {{page}} / {{total}} 页', { page: current, total: pageCount })}</span>
      <Button variant="secondary" size="sm" disabled={!canNext || disabled} onClick={goNext}>{t('下一页')}</Button>
    </div>
  </div>;
}
