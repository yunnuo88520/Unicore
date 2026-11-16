// Author: yunnuo <ymz@ebox.vip>
// Description: Trailing row actions as one ghost more-menu; callers keep per-row permission gating and accessible names.
import { MoreHorizontal } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';

export type DataTableAction = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean };

export function DataTableRowActions({ label, items }: { label: string; items: readonly DataTableAction[] }) {
  if (!items.length) return null;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" aria-label={label}><MoreHorizontal size={15} aria-hidden="true" /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-36">
      {items.map(item => <DropdownMenuItem key={item.label} disabled={item.disabled}
        className={cn(item.danger && 'text-danger')} onSelect={item.onSelect}>{item.label}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
