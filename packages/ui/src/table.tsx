// Author: yunnuo <ymz@ebox.vip>
// Description: Styled table surface for TanStack Table renders; keeps reading order and selection states accessible.
import { forwardRef, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { cn } from './cn';

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(function Table({ className, ...props }, ref) {
  return <div className="w-full overflow-x-auto">
    <table ref={ref} className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
  </div>;
});

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(function TableHeader({ className, ...props }, ref) {
  return <thead ref={ref} className={cn('bg-surface-hover [&_tr]:border-y [&_tr]:border-line', className)} {...props} />;
});

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(function TableBody({ className, ...props }, ref) {
  return <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
});

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(function TableRow({ className, ...props }, ref) {
  return <tr ref={ref} className={cn('border-b border-line transition-colors hover:bg-surface-hover data-[state=selected]:bg-primary-soft', className)} {...props} />;
});

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(function TableHead({ className, ...props }, ref) {
  return <th ref={ref} scope="col" className={cn('h-9 px-3 text-start align-middle text-xs font-medium text-muted whitespace-nowrap', className)} {...props} />;
});

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(function TableCell({ className, ...props }, ref) {
  return <td ref={ref} className={cn('px-3 py-2.5 align-middle text-ink', className)} {...props} />;
});

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return <TableRow><TableCell colSpan={colSpan} className="h-24 text-center text-muted">{children}</TableCell></TableRow>;
}
