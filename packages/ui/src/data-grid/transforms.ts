// Author: yunnuo <ymz@ebox.vip>
// Description: Pure identity, projection, selection, clipboard and atomic editing transforms.
import { dataGridValidationMessages as messages } from './messages';
import type { DataGridColumn, GridCell, GridFilter, GridSelection, GridSort, GridTransformResult, GridValidationError, GridValue } from './types';

export function indexRows<T>(data: readonly T[], getRowId: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of data) {
    const id = getRowId(row);
    if (typeof id !== 'string' || !id.trim() || result.has(id)) throw new Error('DataGrid requires unique, nonempty stable row IDs.');
    result.set(id, row);
  }
  return result;
}
export function cellText<T>(column: DataGridColumn<T>, row: T): string {
  const value = column.getValue(row);
  return column.toText?.(value, row) ?? (column.kind === 'options' ? column.options.find(option => option.value === value)?.label ?? String(value ?? '') : String(value ?? ''));
}
export function isEditable<T>(column: DataGridColumn<T>, row: T): boolean {
  return !!column.setValue && !(typeof column.readOnly === 'function' ? column.readOnly(row) : column.readOnly);
}
export function projectRows<T>(data: readonly T[], columns: readonly DataGridColumn<T>[], search = '', filters: readonly GridFilter[] = [], sort?: GridSort, locale = 'en'): T[] {
  const normalize = (value: string) => value.toLocaleLowerCase(locale);
  const query = normalize(search.trim());
  const result = data.filter(row => (!query || columns.some(column => column.searchable !== false && normalize(cellText(column, row)).includes(query))) && filters.every(filter => {
    const column = columns.find(candidate => candidate.id === filter.columnId);
    return !column || column.filterable === false || normalize(cellText(column, row)).includes(normalize(filter.value));
  }));
  const column = columns.find(candidate => candidate.id === sort?.columnId);
  if (column && column.sortable !== false && sort) {
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    result.sort((a, b) => {
      const av = column.getValue(a), bv = column.getValue(b);
      const comparison = column.compare?.(a, b) ?? (av == null ? (bv == null ? 0 : -1) : bv == null ? 1 : typeof av === 'number' && typeof bv === 'number' ? av - bv : collator.compare(String(av), String(bv)));
      return comparison * (sort.direction === 'desc' ? -1 : 1);
    });
  }
  return result;
}
export function selectionBounds(selection: GridSelection | null, rowIds: readonly string[], columnIds: readonly string[]) {
  if (!selection) return null;
  const ar = rowIds.indexOf(selection.anchor.rowId), fr = rowIds.indexOf(selection.focus.rowId);
  const ac = columnIds.indexOf(selection.anchor.columnId), fc = columnIds.indexOf(selection.focus.columnId);
  if ([ar, fr, ac, fc].some(index => index < 0)) return null;
  return { top: Math.min(ar, fr), bottom: Math.max(ar, fr), left: Math.min(ac, fc), right: Math.max(ac, fc) };
}
/** Spreadsheet-compatible quoted fields, including tabs, CRLF and embedded newlines. */
export function parseTSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === '\t' || char === '\n' || char === '\r') {
      row.push(field); field = ''; closed = false;
      if (char !== '\t') { rows.push(row); row = []; if (char === '\r' && text[i + 1] === '\n') i++; }
    } else { if (closed) throw new Error(messages.invalidClipboard); field += char; }
  }
  if (quoted) throw new Error(messages.invalidClipboard);
  if (field || row.length || !rows.length || (!text.endsWith('\n') && !text.endsWith('\r'))) { row.push(field); rows.push(row); }
  if (rows.some(candidate => candidate.length !== rows[0].length)) throw new Error(messages.clipboardWidth);
  return rows;
}
function encode(value: string, separator: string): string { return value.includes(separator) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }
export function serializeTSV(rows: readonly (readonly string[])[]): string { return rows.map(row => row.map(value => encode(value, '\t')).join('\t')).join('\r\n'); }
export function exportCSV<T>(data: readonly T[], columns: readonly DataGridColumn<T>[]): string {
  // Prefix spreadsheet formulas to avoid execution when an exported file is opened.
  const safe = (text: string) => encode(/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text) ? `'${text}` : text, ',');
  return [columns.map(column => column.header), ...data.map(row => columns.map(column => cellText(column, row)))].map(row => row.map(safe).join(',')).join('\r\n');
}
export function applyGridEdits<T>(data: readonly T[], columns: readonly DataGridColumn<T>[], getRowId: (row: T) => string, edits: readonly (GridCell & { text: string })[]): GridTransformResult<T> {
  const originals = indexRows(data, getRowId), drafts = new Map(originals), errors: GridValidationError[] = [];
  const parsed: { rowId: string; column: DataGridColumn<T>; value: GridValue }[] = [];
  const seen = new Set<string>();
  for (const edit of edits) {
    const row = drafts.get(edit.rowId), column = columns.find(candidate => candidate.id === edit.columnId);
    const fail = (message: string) => errors.push({ rowId: edit.rowId, columnId: edit.columnId, message });
    const key = JSON.stringify([edit.rowId, edit.columnId]);
    if (seen.has(key)) { fail(messages.duplicateEdit); continue; } seen.add(key);
    if (!row || !column) { fail(messages.missingCell); continue; }
    // Permissions describe the pre-transaction row; an earlier pasted value must not unlock a later cell.
    if (!isEditable(column, originals.get(edit.rowId)!)) { fail(messages.readOnlyCell); continue; }
    let value: GridValue = edit.text;
    if (column.kind === 'number') {
      value = edit.text.trim() === '' ? null : Number(edit.text);
      if (value !== null && !Number.isFinite(value)) { fail(messages.finiteNumber); continue; }
    }
    if (column.kind === 'options' && !column.options.some(option => option.value === value)) { fail(messages.validOption); continue; }
    try {
      let next: T;
      if (column.kind === 'number') next = column.setValue!(row, value as number | null);
      else next = column.setValue!(row, value as string);
      if (getRowId(next) !== edit.rowId) { fail(messages.immutableId); continue; }
      drafts.set(edit.rowId, next); parsed.push({ rowId: edit.rowId, column, value });
    } catch { fail(messages.updateFailed); }
  }
  // Validate against the final draft so cross-field validators see the entire transaction.
  for (const { rowId, column, value } of parsed) {
    try {
      const row = drafts.get(rowId)!;
      const message = column.kind === 'number' ? column.validate?.(value as number | null, row) : column.validate?.(value as string, row);
      if (message) errors.push({ rowId, columnId: column.id, message });
    } catch { errors.push({ rowId, columnId: column.id, message: messages.validationFailed }); }
  }
  if (errors.length) return { ok: false, errors };
  const changes = parsed.map(({ rowId, column }) => ({ rowId, columnId: column.id, before: column.getValue(originals.get(rowId)!), after: column.getValue(drafts.get(rowId)!) })).filter(change => !Object.is(change.before, change.after));
  return { ok: true, data: data.map(row => drafts.get(getRowId(row))!), changes };
}
export function pasteGrid<T>(data: readonly T[], columns: readonly DataGridColumn<T>[], getRowId: (row: T) => string, visibleRowIds: readonly string[], start: GridCell, text: string): GridTransformResult<T> {
  let matrix: string[][];
  try { matrix = parseTSV(text); } catch (error) { return { ok: false, errors: [{ message: (error as Error).message }] }; }
  const r = visibleRowIds.indexOf(start.rowId), c = columns.findIndex(column => column.id === start.columnId);
  if (r < 0 || c < 0 || r + matrix.length > visibleRowIds.length || c + matrix[0].length > columns.length) return { ok: false, errors: [{ message: messages.pasteBounds }] };
  return applyGridEdits(data, columns, getRowId, matrix.flatMap((row, y) => row.map((text, x) => ({ rowId: visibleRowIds[r + y], columnId: columns[c + x].id, text }))));
}
/** Explicit and user-resized widths stay fixed; unspecified columns share spare space up to their caps. */
export function sizeGridColumns<T>(columns: readonly DataGridColumn<T>[], resized: Readonly<Record<string, number>>, availableWidth: number): number[] {
  const resizedWidth = (id: string) => Object.hasOwn(resized, id) ? resized[id] : undefined;
  const sizes = columns.map(column => Math.max(column.minWidth ?? 80, Math.min(column.maxWidth ?? 800, resizedWidth(column.id) ?? column.width ?? 180)));
  let spare = Math.max(0, availableWidth - sizes.reduce((sum, width) => sum + width, 0));
  let flexible = columns.map((_, index) => index).filter(index => resizedWidth(columns[index].id) === undefined && columns[index].width === undefined && sizes[index] < (columns[index].maxWidth ?? 800));
  while (spare > 0.01 && flexible.length) {
    const share = spare / flexible.length;
    for (const index of flexible) {
      const growth = Math.min(share, (columns[index].maxWidth ?? 800) - sizes[index]);
      sizes[index] += growth; spare -= growth;
    }
    flexible = flexible.filter(index => sizes[index] < (columns[index].maxWidth ?? 800));
  }
  return sizes;
}
export function virtualWindow(count: number, scrollTop: number, height: number, rowHeight: number, overscan = 5) {
  if (!Number.isFinite(rowHeight) || rowHeight <= 0 || !Number.isFinite(height) || height <= 0) throw new Error('Grid dimensions must be positive finite numbers.');
  const buffer = Math.max(0, Math.floor(overscan));
  const start = Math.min(count, Math.max(0, Math.floor(scrollTop / rowHeight) - buffer));
  const end = Math.min(count, Math.max(start, Math.ceil((scrollTop + height) / rowHeight) + buffer));
  return { start, end, offset: start * rowHeight, totalHeight: count * rowHeight };
}
