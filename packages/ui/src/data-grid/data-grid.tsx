// Author: yunnuo <ymz@ebox.vip>
// Description: Accessible controlled grid with fixed-height windowing and atomic client-side editing.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../button';
import { Checkbox } from '../checkbox';
import { cn } from '../cn';
import { Input, NativeSelect } from '../input';
import { useI18n } from '../i18n';
import { dataGridMessages } from './messages';
export { dataGridMessages } from './messages';
import { createGridHistory, pushGridHistory, redoGridHistory, undoGridHistory, type GridHistory } from './history';
import { applyGridEdits, cellText, exportCSV, indexRows, isEditable, pasteGrid, projectRows, selectionBounds, serializeTSV, sizeGridColumns, virtualWindow } from './transforms';
import type { DataGridColumn, DataGridProps, GridCell, GridFilter, GridSelection, GridSort, GridTransformResult, GridValidationError } from './types';

const headerHeight = 40;
function sameRows<T>(a: readonly T[], b: readonly T[]) { return a.length === b.length && a.every((row, i) => row === b[i]); }

export function DataGrid<T>({ label, data, columns, getRowId, onDataChange, pending, readOnly, onDeleteRows, onRowSelectionChange, onCellSelectionChange, onValidationError, onExport, height = 400, rowHeight = 36, overscan = 5, className }: DataGridProps<T>) {
  const { t, locale } = useI18n();
  const uid = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<GridFilter[]>([]);
  const [sort, setSort] = useState<GridSort>();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setViewportWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const rowAnchor = useRef<string | null>(null);
  const dragging = useRef(false);
  const editCommitted = useRef(false);
  const rowShift = useRef(false);
  const [editing, setEditing] = useState<(GridCell & { text: string }) | null>(null);
  const [errors, setErrors] = useState<readonly GridValidationError[]>([]);
  const [history, setHistory] = useState<GridHistory<T>>(createGridHistory);
  const expected = useRef<readonly T[]>(data);
  const rowsById = useMemo(() => indexRows(data, getRowId), [data, getRowId]);
  const columnIds = new Set<string>();
  for (const column of columns) {
    if (!column.id.trim() || columnIds.has(column.id)) throw new Error('DataGrid requires unique nonempty column IDs.');
    columnIds.add(column.id);
  }
  const visibleColumns = columns.filter(column => !hidden.has(column.id));
  const rows = useMemo(() => projectRows(data, columns, search, filters, sort, locale), [data, columns, search, filters, sort, locale]);
  const rowIds = rows.map(getRowId);
  const visibleIds = visibleColumns.map(column => column.id);
  const bounds = selectionBounds(selection, rowIds, visibleIds);
  const active = bounds && selection ? selection.focus : rows.length && visibleColumns.length ? { rowId: rowIds[0], columnId: visibleIds[0] } : null;
  // The sticky header still occupies its normal-flow height: scrollTop is the first visible body offset.
  const window = virtualWindow(rows.length, scrollTop, Math.max(1, height - headerHeight), rowHeight, overscan);
  const columnWidths = sizeGridColumns(visibleColumns, widths, Math.max(0, viewportWidth - 44));
  const widthFor = (column: DataGridColumn<T>) => columnWidths[visibleColumns.indexOf(column)];
  const totalWidth = 44 + visibleColumns.reduce((sum, column) => sum + widthFor(column), 0);
  const cellId = (cell: GridCell) => `${uid}-cell-${encodeURIComponent(JSON.stringify([cell.rowId, cell.columnId]))}`;
  const writable = !pending && !readOnly;
  const focusGrid = () => viewport.current?.focus({ preventScroll: true });
  function select(next: GridSelection | null) { setSelection(next); onCellSelectionChange?.(next); }
  function chooseRows(next: Set<string>) { setSelectedRows(next); onRowSelectionChange?.([...next]); }
  function fail(next: readonly GridValidationError[]) { setErrors(next); onValidationError?.(next); }

  // A host-originated replacement invalidates snapshots; never undo over newer server data.
  useEffect(() => {
    if (!sameRows(data, expected.current)) { setHistory(createGridHistory()); setEditing(null); }
    expected.current = data;
  }, [data]);
  useEffect(() => { if (!writable) setEditing(null); }, [writable]);
  useEffect(() => {
    const existing = new Set([...selectedRows].filter(id => rowsById.has(id)));
    if (existing.size !== selectedRows.size) chooseRows(existing);
    // Row identity is the reconciliation boundary, not the current projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsById]);
  useEffect(() => {
    if (selection && !bounds) { setSelection(null); onCellSelectionChange?.(null); }
    if (editing && (!rowIds.includes(editing.rowId) || !visibleIds.includes(editing.columnId))) setEditing(null);
  });
  useEffect(() => {
    const stop = () => { dragging.current = false; };
    globalThis.addEventListener('pointerup', stop); globalThis.addEventListener('pointercancel', stop);
    return () => { globalThis.removeEventListener('pointerup', stop); globalThis.removeEventListener('pointercancel', stop); };
  }, []);
  // Clamp the scroll position after search/filter/deletion shrinks the projection.
  useEffect(() => {
    const max = Math.max(0, rows.length * rowHeight + headerHeight - height);
    if (viewport.current && viewport.current.scrollTop > max) { viewport.current.scrollTop = max; setScrollTop(max); }
  }, [rows.length, rowHeight, height]);

  function move(row: number, column: number, extend = false) {
    if (!rows.length || !visibleColumns.length) return;
    const r = Math.max(0, Math.min(rows.length - 1, row));
    const c = Math.max(0, Math.min(visibleColumns.length - 1, column));
    const cell = { rowId: rowIds[r], columnId: visibleIds[c] };
    select({ anchor: extend ? selection?.anchor ?? active ?? cell : cell, focus: cell });
    const element = viewport.current;
    if (element) {
      const top = r * rowHeight;
      if (top < element.scrollTop) element.scrollTop = top;
      else if (top + rowHeight > element.scrollTop + height - headerHeight) element.scrollTop = top + rowHeight - height + headerHeight;
      const left = 44 + visibleColumns.slice(0, c).reduce((sum, col) => sum + widthFor(col), 0);
      if (left < element.scrollLeft) element.scrollLeft = left;
      else if (left + widthFor(visibleColumns[c]) > element.scrollLeft + element.clientWidth && element.clientWidth > 0) element.scrollLeft = left + widthFor(visibleColumns[c]) - element.clientWidth;
      setScrollTop(element.scrollTop);
    }
  }
  function beginEdit(cell: GridCell | null = active) {
    if (!cell || !writable) return;
    if (editing && (editing.rowId !== cell.rowId || editing.columnId !== cell.columnId) && !finishEdit(false)) return;
    const row = rowsById.get(cell.rowId), column = columns.find(col => col.id === cell.columnId);
    if (row && column && isEditable(column, row)) {
      editCommitted.current = false;
      setErrors([]); setEditing({ ...cell, text: String(column.getValue(row) ?? '') });
      select({ anchor: cell, focus: cell });
    }
  }
  function commit(result: GridTransformResult<T>, reason: 'edit' | 'paste') {
    if (!writable) return false;
    if (!result.ok) { fail(result.errors); return false; }
    setErrors([]);
    if (result.changes.length) {
      setHistory(current => pushGridHistory(current, { before: data, after: result.data, changes: result.changes }));
      expected.current = result.data;
      onDataChange(result.data, { reason, cells: result.changes });
    }
    return true;
  }
  function finishEdit(restoreFocus = true) {
    if (!editing || editCommitted.current) return true;
    if (!commit(applyGridEdits(data, columns, getRowId, [editing]), 'edit')) return false;
    editCommitted.current = true;
    setEditing(null); if (restoreFocus) focusGrid(); return true;
  }
  function travel(direction: 'undo' | 'redo') {
    if (!writable || editing || !sameRows(data, expected.current)) return;
    const result = direction === 'undo' ? undoGridHistory(history) : redoGridHistory(history);
    if (!result) return;
    setHistory(result.history); expected.current = result.data; setErrors([]);
    onDataChange(result.data, { reason: direction, cells: result.changes });
  }
  function requestDelete() { if (writable && selectedRows.size) onDeleteRows?.([...selectedRows]); }
  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.isDefaultPrevented() || event.nativeEvent.isComposing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); travel(event.shiftKey ? 'redo' : 'undo'); return; }
    if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); travel('redo'); return; }
    if (mod && event.key.toLowerCase() === 'a' && rows.length && visibleColumns.length) {
      event.preventDefault(); select({ anchor: { rowId: rowIds[0], columnId: visibleIds[0] }, focus: { rowId: rowIds.at(-1)!, columnId: visibleIds.at(-1)! } }); return;
    }
    if (event.key === 'Escape') { event.preventDefault(); select(null); setErrors([]); return; }
    if (event.key === 'Delete') { if (onDeleteRows && selectedRows.size && writable) { event.preventDefault(); requestDelete(); } return; }
    if (!active) return;
    const r = rowIds.indexOf(active.rowId), c = visibleIds.indexOf(active.columnId);
    const page = Math.max(1, Math.floor((height - headerHeight) / rowHeight));
    const destinations: Record<string, [number, number]> = {
      ArrowUp: [r - 1, c], ArrowDown: [r + 1, c], ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1],
      Home: [mod ? 0 : r, 0], End: [mod ? rows.length - 1 : r, visibleColumns.length - 1], PageUp: [r - page, c], PageDown: [r + page, c],
    };
    if (destinations[event.key]) { event.preventDefault(); move(...destinations[event.key], event.shiftKey); }
    else if (event.key === 'Tab') {
      const index = r * visibleColumns.length + c + (event.shiftKey ? -1 : 1);
      // At either boundary, allow the browser to leave the grid normally.
      if (index >= 0 && index < rows.length * visibleColumns.length) { event.preventDefault(); move(Math.floor(index / visibleColumns.length), index % visibleColumns.length); }
    } else if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); beginEdit(); }
  }
  function exportRows() {
    const csv = exportCSV(rows, visibleColumns);
    if (onExport) { onExport(csv); return; }
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'data.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function rowToggle(id: string, checked: boolean, shift: boolean) {
    const next = new Set(selectedRows);
    const anchor = rowAnchor.current ? rowIds.indexOf(rowAnchor.current) : -1;
    const end = rowIds.indexOf(id);
    const ids = shift && anchor >= 0 ? rowIds.slice(Math.min(anchor, end), Math.max(anchor, end) + 1) : [id];
    for (const rowId of ids) { if (checked) next.add(rowId); else next.delete(rowId); }
    rowAnchor.current = id; chooseRows(next);
  }
  const allSelected = rowIds.length > 0 && rowIds.every(id => selectedRows.has(id));
  const someSelected = rowIds.some(id => selectedRows.has(id));
  const activeIndex = active ? rowIds.indexOf(active.rowId) : -1;
  const activeMounted = activeIndex >= window.start && activeIndex < window.end;

  return <section aria-label={label} className={cn('flex min-w-0 flex-col gap-3 text-sm text-ink', className)}>
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label={t(dataGridMessages.search)} value={search} disabled={pending} className="max-w-xs" onChange={event => setSearch(event.target.value)} />
      <details className="relative">
        <summary className="cursor-pointer rounded-md border border-line px-3 py-2 focus-visible:ring-2 focus-visible:ring-focus">{t(dataGridMessages.columns)}</summary>
        <div className="absolute z-20 mt-1 flex min-w-48 flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-floating">
          {columns.map(column => <Checkbox key={column.id} checked={!hidden.has(column.id)} disabled={!hidden.has(column.id) && visibleColumns.length === 1} onChange={checked => {
            const next = new Set(hidden); if (checked) next.delete(column.id); else next.add(column.id); setHidden(next);
          }}>{column.header}</Checkbox>)}
        </div>
      </details>
      <Button variant="secondary" size="sm" disabled={!writable || !!editing || !history.past.length} onClick={() => travel('undo')}>{t(dataGridMessages.undo)}</Button>
      <Button variant="secondary" size="sm" disabled={!writable || !!editing || !history.future.length} onClick={() => travel('redo')}>{t(dataGridMessages.redo)}</Button>
      <Button variant="secondary" size="sm" disabled={pending || !visibleColumns.length} onClick={exportRows}>{t(dataGridMessages.export)}</Button>
      {onDeleteRows && <Button variant="dangerSoft" size="sm" disabled={!writable || !selectedRows.size} onClick={requestDelete}>{t(dataGridMessages.delete)}</Button>}
      <span className="text-subtle">{t(dataGridMessages.count, { count: rows.length })}</span>
      {selectedRows.size > 0 && <span className="text-subtle">{t(dataGridMessages.selected, { count: selectedRows.size })}</span>}
    </div>
    {columns.some(column => column.filterable) && <div className="flex flex-wrap gap-2">{columns.filter(column => column.filterable).map(column => <Input key={column.id} className="max-w-48" disabled={pending} aria-label={t(dataGridMessages.filter, { column: column.header })} placeholder={t(dataGridMessages.filter, { column: column.header })} value={filters.find(filter => filter.columnId === column.id)?.value ?? ''} onChange={event => setFilters(current => [...current.filter(filter => filter.columnId !== column.id), ...(event.target.value ? [{ columnId: column.id, value: event.target.value }] : [])])} />)}</div>}
    <p id={`${uid}-help`} className="sr-only">{t(dataGridMessages.help)}</p>
    <div ref={viewport} role="grid" aria-label={label} aria-describedby={`${uid}-help`} aria-busy={pending} aria-readonly={!writable} aria-multiselectable="true" aria-rowcount={rows.length + 1} aria-colcount={visibleColumns.length + 1} aria-activedescendant={active && activeMounted && !editing ? cellId(active) : undefined} tabIndex={0} className="relative overflow-auto rounded-md border border-line bg-surface outline-none focus-visible:ring-2 focus-visible:ring-focus" style={{ height }} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} onKeyDown={handleKey}
      onCopy={event => {
        if (editing || event.target !== event.currentTarget || !active) return;
        const range = bounds ?? selectionBounds({ anchor: active, focus: active }, rowIds, visibleIds)!;
        const matrix = rows.slice(range.top, range.bottom + 1).map(row => visibleColumns.slice(range.left, range.right + 1).map(column => String(column.getValue(row) ?? '')));
        event.preventDefault(); event.clipboardData.setData('text/plain', serializeTSV(matrix));
      }}
      onPaste={event => {
        if (editing || event.target !== event.currentTarget || !writable || !active) return;
        event.preventDefault();
        const start = bounds ? { rowId: rowIds[bounds.top], columnId: visibleIds[bounds.left] } : active;
        commit(pasteGrid(data, visibleColumns, getRowId, rowIds, start, event.clipboardData.getData('text/plain')), 'paste');
      }}>
      <div role="row" aria-rowindex={1} className="sticky top-0 z-10 flex border-b border-line bg-surface-alt" style={{ width: totalWidth, height: headerHeight }}>
        <div role="columnheader" aria-colindex={1} className="flex shrink-0 items-center justify-center" style={{ width: 44 }}>
          <Checkbox aria-label={t(dataGridMessages.selectAll)} checked={allSelected ? true : someSelected ? 'indeterminate' : false} disabled={pending || !rowIds.length} onChange={checked => { const next = new Set(selectedRows); rowIds.forEach(id => { if (checked) next.add(id); else next.delete(id); }); chooseRows(next); }} />
        </div>
        {visibleColumns.map((column, c) => <div key={column.id} role="columnheader" aria-colindex={c + 2} aria-sort={sort?.columnId === column.id ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} className="relative flex shrink-0 items-center border-l border-line px-2" style={{ width: widthFor(column) }}>
          <Button variant="ghost" size="sm" disabled={pending || column.sortable === false} className="min-w-0 max-w-full justify-start truncate" onClick={() => setSort(current => current?.columnId === column.id ? current.direction === 'asc' ? { columnId: column.id, direction: 'desc' } : undefined : { columnId: column.id, direction: 'asc' })}>{column.header}{sort?.columnId === column.id && <span aria-hidden="true">{sort.direction === 'asc' ? '↑' : '↓'}</span>}</Button>
          <div role="separator" aria-orientation="vertical" aria-label={t(dataGridMessages.resize, { column: column.header })} aria-valuenow={widthFor(column)} aria-valuemin={column.minWidth ?? 80} aria-valuemax={column.maxWidth ?? 800} tabIndex={0} className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none hover:bg-line focus-visible:bg-focus focus-visible:outline-none" onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidths(current => ({ ...current, [column.id]: Math.max(column.minWidth ?? 80, Math.min(column.maxWidth ?? 800, widthFor(column) + (event.key === 'ArrowRight' ? 10 : -10))) })); } }} onPointerDown={event => { event.preventDefault(); const target = event.currentTarget; target.setPointerCapture(event.pointerId); target.dataset.start = String(event.clientX); target.dataset.width = String(widthFor(column)); }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const width = Number(event.currentTarget.dataset.width) + event.clientX - Number(event.currentTarget.dataset.start); setWidths(current => ({ ...current, [column.id]: Math.max(column.minWidth ?? 80, Math.min(column.maxWidth ?? 800, width)) })); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
        </div>)}
      </div>
      <div role="rowgroup" className="relative" style={{ height: window.totalHeight, width: totalWidth }}>
        {rows.slice(window.start, window.end).map((row, offset) => {
          const r = window.start + offset, rowId = getRowId(row);
          return <div key={rowId} role="row" aria-rowindex={r + 2} aria-selected={selectedRows.has(rowId)} className="absolute left-0 flex border-b border-line" style={{ top: r * rowHeight, height: rowHeight, width: totalWidth }}>
            <div role="gridcell" aria-colindex={1} className="flex shrink-0 items-center justify-center bg-surface-alt" style={{ width: 44 }} onClickCapture={event => { rowShift.current = event.shiftKey; }}>
              <Checkbox aria-label={t(dataGridMessages.selectRow, { row: r + 1 })} checked={selectedRows.has(rowId)} disabled={pending} onChange={checked => rowToggle(rowId, checked, rowShift.current)} id={cellId({ rowId, columnId: '__row-checkbox' })} />
            </div>
            {visibleColumns.map((column, c) => {
              const cell = { rowId, columnId: column.id };
              const selected = !!bounds && r >= bounds.top && r <= bounds.bottom && c >= bounds.left && c <= bounds.right;
              const focused = active?.rowId === rowId && active.columnId === column.id;
              const editor = editing?.rowId === rowId && editing.columnId === column.id;
              const invalid = errors.some(error => error.rowId === rowId && error.columnId === column.id);
              const editorKey = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
                event.stopPropagation();
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Escape') { event.preventDefault(); editCommitted.current = true; setEditing(null); setErrors([]); focusGrid(); }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  const next = r * visibleColumns.length + c + (event.shiftKey ? -1 : 1);
                  const boundary = event.key === 'Tab' && (next < 0 || next >= rows.length * visibleColumns.length);
                  // Leave a valid boundary Tab to the browser; blur commits without stealing the next focus.
                  if (boundary) {
                    const result = applyGridEdits(data, columns, getRowId, [editing!]);
                    if (!result.ok) { event.preventDefault(); fail(result.errors); }
                    return;
                  }
                  event.preventDefault();
                  if (finishEdit()) {
                    if (event.key === 'Enter') move(r + (event.shiftKey ? -1 : 1), c);
                    else move(Math.floor(next / visibleColumns.length), next % visibleColumns.length);
                  }
                }
              };
              return <div key={column.id} id={cellId(cell)} role="gridcell" aria-colindex={c + 2} aria-selected={selected} aria-readonly={!writable || !isEditable(column, row)} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${uid}-errors` : undefined} className={cn('flex shrink-0 items-center overflow-hidden border-l border-line px-2', selected && 'bg-surface-alt', focused && 'ring-2 ring-inset ring-focus', invalid && 'text-danger')} style={{ width: widthFor(column) }} onPointerDown={event => { if (editor || event.button !== 0) return; event.preventDefault(); if (editing && !finishEdit(false)) return; dragging.current = true; select({ anchor: event.shiftKey && selection ? selection.anchor : cell, focus: cell }); focusGrid(); }} onPointerEnter={() => { if (dragging.current && selection && !editing) select({ anchor: selection.anchor, focus: cell }); }} onDoubleClick={() => { if (!editor) beginEdit(cell); }}>
                {editor ? column.kind === 'options' ? <NativeSelect autoFocus aria-label={t(dataGridMessages.edit, { column: column.header })} aria-invalid={invalid} value={editing.text} onChange={event => setEditing({ ...editing, text: event.target.value })} onKeyDown={editorKey} onBlur={() => finishEdit(false)}><option value="" disabled hidden />{column.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</NativeSelect> : <Input autoFocus aria-label={t(dataGridMessages.edit, { column: column.header })} aria-invalid={invalid} inputMode={column.kind === 'number' ? 'decimal' : undefined} value={editing.text} onChange={event => setEditing({ ...editing, text: event.target.value })} onKeyDown={editorKey} onBlur={() => finishEdit(false)} onFocus={event => event.currentTarget.select()} className="h-full" /> : <span className="truncate">{column.format ? column.format(column.getValue(row), row) : cellText(column, row)}</span>}
              </div>;
            })}
          </div>;
        })}
      </div>
      {!rows.length && <div role="status" className="p-6 text-subtle">{t(pending ? dataGridMessages.pending : dataGridMessages.empty)}</div>}
    </div>
    <div aria-live="polite" className="sr-only">{pending ? t(dataGridMessages.pending) : readOnly ? t(dataGridMessages.readOnly) : ''}</div>
    {errors.length > 0 && <div id={`${uid}-errors`} role="alert" className="text-sm text-danger"><strong>{t(dataGridMessages.error)}</strong><ul>{errors.map((error, index) => <li key={index}>{t(error.message)}</li>)}</ul></div>}
  </section>;
}
