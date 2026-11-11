// Author: yunnuo <ymz@ebox.vip>
// Description: Per-table column visibility persisted in device preferences; the menu data stays page-rendered.
import { useCallback, useMemo } from 'react';
import { getPreferences, setPreferences, usePreferences } from '@unicore/theme/preferences';

export type ColumnOption = { id: string; label: string };
export type ColumnMenuEntry = { id: string; label: string; visible: boolean };

/** Persisted per-table hidden columns; `tableKey` namespaces the preference so tables never collide. */
export function useColumnVisibility(tableKey: string, columns: readonly ColumnOption[]) {
  const { hiddenColumns } = usePreferences();
  const hidden = useMemo(() => new Set(hiddenColumns?.[tableKey] ?? []), [hiddenColumns, tableKey]);
  const columnVisibility = useMemo(() => Object.fromEntries(columns.map(column => [column.id, !hidden.has(column.id)])), [columns, hidden]);
  const menu = useMemo<ColumnMenuEntry[]>(() => columns.map(column => ({ id: column.id, label: column.label, visible: !hidden.has(column.id) })), [columns, hidden]);
  const toggle = useCallback((id: string, visible: boolean) => {
    const current = { ...getPreferences().hiddenColumns };
    const ids = new Set(current[tableKey] ?? []);
    if (visible) ids.delete(id); else ids.add(id);
    if (ids.size) current[tableKey] = [...ids]; else delete current[tableKey];
    setPreferences({ hiddenColumns: current });
  }, [tableKey]);
  return { columnVisibility, menu, toggle };
}
