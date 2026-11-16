// Author: yunnuo <ymz@ebox.vip>
// Description: Sortable column header button with a three-state direction icon; non-sorting columns keep plain text headers.
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export function DataTableSortHeader({ label, sorted, onToggle }: { label: ReactNode; sorted: false | 'asc' | 'desc'; onToggle: () => void }) {
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
  return <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 hover:text-ink">
    {label}<Icon size={13} aria-hidden="true" />
  </button>;
}
