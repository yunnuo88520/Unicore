// Author: yunnuo <ymz@ebox.vip>
// Description: Pure grid transaction, projection, clipboard and windowing regression tests.
import { describe, expect, it } from 'vitest';
import { applyGridEdits, exportCSV, indexRows, parseTSV, pasteGrid, projectRows, selectionBounds, serializeTSV, sizeGridColumns, virtualWindow } from './transforms';
import { createGridHistory, pushGridHistory, redoGridHistory, undoGridHistory } from './history';
import type { DataGridColumn } from './types';

type Row = { id: string; name: string; amount: number | null; status: string };
const id = (row: Row) => row.id;
const data: Row[] = [{ id: 'a', name: 'Alpha', amount: 2, status: 'open' }, { id: 'b', name: 'Beta', amount: 1, status: 'closed' }, { id: 'c', name: 'Gamma', amount: 2, status: 'open' }];
const columns: DataGridColumn<Row>[] = [
  { id: 'name', header: 'Name', kind: 'text', getValue: row => row.name, setValue: (row, name) => ({ ...row, name }), validate: value => !value.trim() ? 'Required' : undefined },
  { id: 'amount', header: 'Amount', kind: 'number', getValue: row => row.amount, setValue: (row, amount) => ({ ...row, amount }), validate: value => value !== null && value < 0 ? 'Positive' : undefined },
  { id: 'status', header: 'Status', kind: 'options', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }], getValue: row => row.status, setValue: (row, status) => ({ ...row, status }) },
];
describe('grid pure transforms', () => {
  it('rejects unstable identities and duplicate IDs', () => {
    expect(() => indexRows([...data, data[0]], id)).toThrow(/unique/);
    expect(() => indexRows([{ ...data[0], id: '' }], id)).toThrow();
    const result = applyGridEdits(data, [{ id: 'name', header: 'Name', kind: 'text', getValue: row => row.name, setValue: row => ({ ...row, id: 'new' }) }], id, [{ rowId: 'a', columnId: 'name', text: 'x' }]);
    expect(result.ok).toBe(false);
  });
  it('sorts stably, searches and filters without changing the source', () => {
    expect(projectRows(data, columns, '', [], { columnId: 'amount', direction: 'asc' }).map(id)).toEqual(['b', 'a', 'c']);
    expect(projectRows(data, columns, 'ALP').map(id)).toEqual(['a']);
    expect(projectRows(data, columns, '', [{ columnId: 'status', value: 'open' }]).map(id)).toEqual(['a', 'c']);
    expect(data.map(id)).toEqual(['a', 'b', 'c']);
  });
  it('roundtrips quoted TSV with tabs, CRLF and quotes, and rejects malformed rectangles', () => {
    const matrix = [['a\tb', 'two\nlines', 'say "yes"'], ['', 'x', '']];
    expect(parseTSV(serializeTSV(matrix))).toEqual(matrix);
    expect(parseTSV('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(() => parseTSV('"unclosed')).toThrow();
    expect(() => parseTSV('a\tb\nc')).toThrow();
    expect(() => parseTSV('"a"x')).toThrow();
  });
  it('pastes against visible order and visible columns by ID', () => {
    const result = pasteGrid(data, [columns[0], columns[1]], id, ['b', 'a'], { rowId: 'b', columnId: 'name' }, 'New B\t8\nNew A\t9');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.map(row => [row.id, row.name, row.amount])).toEqual([['a', 'New A', 9], ['b', 'New B', 8], ['c', 'Gamma', 2]]);
    expect(data[0].name).toBe('Alpha');
  });
  it('rejects an entire paste for invalid numbers, validation, bounds, readonly and options', () => {
    for (const text of ['Changed\tNaN', 'Changed\tInfinity', 'Changed\t-1', '\t2']) {
      expect(pasteGrid(data, columns, id, data.map(id), { rowId: 'a', columnId: 'name' }, text).ok).toBe(false);
    }
    expect(pasteGrid(data, columns, id, ['a'], { rowId: 'a', columnId: 'status' }, 'missing').ok).toBe(false);
    expect(pasteGrid(data, columns, id, ['a'], { rowId: 'a', columnId: 'status' }, 'open\textra').ok).toBe(false);
    expect(applyGridEdits(data, columns.map(column => ({ ...column, readOnly: true })), id, [{ rowId: 'a', columnId: 'name', text: 'x' }]).ok).toBe(false);
    expect(data[0]).toEqual({ id: 'a', name: 'Alpha', amount: 2, status: 'open' });
  });
  it('validates all cells against the final draft', () => {
    const pair: DataGridColumn<Row>[] = [{ ...columns[0], kind: 'text', getValue: row => row.name, setValue: (row, name) => ({ ...row, name }), validate: (value, row) => value === String(row.amount) ? undefined : 'Mismatch' }, columns[1]];
    expect(pasteGrid(data, pair, id, ['a'], { rowId: 'a', columnId: 'name' }, '7\t7').ok).toBe(true);
  });
  it('exports only supplied columns, quotes CSV and neutralizes spreadsheet formulas', () => {
    expect(exportCSV([{ ...data[0], name: '=1+1' }], [columns[0]])).toBe("Name\r\n'=1+1");
    expect(exportCSV([{ ...data[0], name: 'a,"b"' }], [columns[0]])).toBe('Name\r\n"a,""b"""');
  });
  it('computes rectangular selection independently of row selection', () => {
    expect(selectionBounds({ anchor: { rowId: 'c', columnId: 'status' }, focus: { rowId: 'a', columnId: 'name' } }, data.map(id), columns.map(col => col.id))).toEqual({ top: 0, bottom: 2, left: 0, right: 2 });
    expect(selectionBounds({ anchor: { rowId: 'missing', columnId: 'name' }, focus: { rowId: 'a', columnId: 'name' } }, data.map(id), ['name'])).toBeNull();
  });
  it('distributes spare width only to flexible columns, redistributing at caps without shrinking narrow grids', () => {
    expect(sizeGridColumns(columns, {}, 1200)).toEqual([400, 400, 400]);
    expect(sizeGridColumns(columns, {}, 300)).toEqual([180, 180, 180]);
    expect(sizeGridColumns([{ ...columns[0], width: 240 }, columns[1], columns[2]], {}, 1200)).toEqual([240, 480, 480]);
    expect(sizeGridColumns(columns, { name: 220 }, 1200)).toEqual([220, 490, 490]);
    expect(sizeGridColumns([{ ...columns[0], maxWidth: 200 }, columns[1], columns[2]], {}, 1200)).toEqual([200, 500, 500]);
    expect(sizeGridColumns(columns.map(column => ({ ...column, maxWidth: 200 })), {}, 1200)).toEqual([200, 200, 200]);
    expect(sizeGridColumns(columns.slice(0, 1), {}, 700)).toEqual([700]);
    expect(sizeGridColumns(columns.slice(0, 1), { name: 900 }, 1000)).toEqual([800]);
    expect(sizeGridColumns([{ ...columns[0], id: 'constructor' }], {}, 500)).toEqual([500]);
  });
  it('does not let an earlier pasted column unlock a row-dependent readonly cell', () => {
    const guarded = [columns[0], { ...columns[1], readOnly: (row: Row) => row.name === 'Alpha' }];
    const result = pasteGrid(data, guarded, id, ['a'], { rowId: 'a', columnId: 'name' }, 'Unlocked\t9');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([expect.objectContaining({ rowId: 'a', columnId: 'amount' })]);
    expect(data[0].name).toBe('Alpha');
  });
  it('windows a 10,000 row sample using a fixed height', () => {
    const sample = Array.from({ length: 10_000 }, (_, n) => ({ ...data[0], id: `row-${n}` }));
    expect(indexRows(sample, id).size).toBe(10_000);
    const range = virtualWindow(sample.length, 180_000, 360, 36, 5);
    expect(range).toEqual({ start: 4995, end: 5015, offset: 179820, totalHeight: 360000 });
    expect(sample.slice(range.start, range.end)).toHaveLength(20);
    expect(() => virtualWindow(1, 0, 100, 0)).toThrow();
  });
});
it('caps undo at 100 transactions, reverses changes and clears redo on a branch', () => {
  let history = createGridHistory<Row>();
  for (let n = 0; n < 105; n++) history = pushGridHistory(history, { before: data, after: data, changes: [{ rowId: 'a', columnId: 'amount', before: n, after: n + 1 }] });
  expect(history.past).toHaveLength(100);
  const undo = undoGridHistory(history)!;
  expect(undo.changes[0]).toMatchObject({ before: 105, after: 104 });
  const redo = redoGridHistory(undo.history)!;
  expect(redo.changes[0]).toMatchObject({ before: 104, after: 105 });
  expect(pushGridHistory(undo.history, history.past[0]).future).toHaveLength(0);
  let current = undo.history;
  for (let n = 0; n < 99; n++) current = undoGridHistory(current)!.history;
  expect(undoGridHistory(current)).toBeNull();
});
