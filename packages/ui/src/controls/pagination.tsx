// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded controlled pagination with a compact page window and native button semantics.
import { forwardRef, type HTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../button';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { IconButton } from './actions';
import { clamp } from './utils';

export type PaginationProps = Omit<HTMLAttributes<HTMLElement>, 'onChange'> & {
  /** One-based page index. total is the page count, not the item count. */
  current: number; total: number; onPageChange: (page: number) => void; disabled?: boolean; label?: string;
};
export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination({ current, total, onPageChange, disabled, label = 'Pagination', className, ...props }, ref) {
  const { t, locale } = useControlI18n();
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const page = clamp(Number.isFinite(current) ? Math.floor(current) : 1, 1, Math.max(1, count));
  const pages = [...new Set([1, page - 1, page, page + 1, count])].filter(value => value >= 1 && value <= count).sort((a, b) => a - b);
  const change = (next: number) => { if (!disabled && count && next !== page) onPageChange(clamp(next, 1, count)); };
  return <nav ref={ref} aria-label={t(label)} className={cn('flex flex-wrap items-center gap-1', className)} {...props}>
    <IconButton label="Previous page" variant="secondary" disabled={disabled || !count || page === 1} onClick={() => change(page - 1)}><ChevronLeft size={16} /></IconButton>
    {pages.map((value, index) => <span key={value} className="inline-flex items-center gap-1">{index > 0 && value - pages[index - 1] > 1 && <span aria-hidden="true" className="px-2 text-muted">…</span>}<Button size="sm" variant={value === page ? 'primary' : 'ghost'} aria-label={t('Page {{page}}', { page: value })} aria-current={value === page ? 'page' : undefined} disabled={disabled} onClick={() => change(value)}>{new Intl.NumberFormat(locale).format(value)}</Button></span>)}
    <IconButton label="Next page" variant="secondary" disabled={disabled || !count || page === count} onClick={() => change(page + 1)}><ChevronRight size={16} /></IconButton>
  </nav>;
});
