// Author: yunnuo <ymz@ebox.vip>
// Description: User-observable keyboard, atomic clipboard and virtualization behavior.
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTranslator } from '../i18n';
import { dataGridEnglishMessages } from './messages';
beforeEach(() => setTranslator(value => dataGridEnglishMessages[value] ?? value));
afterEach(() => setTranslator(value => value));
import { DataGrid } from './data-grid';
import type { DataGridColumn, DataGridProps } from './types';
type Row = { id: string; name: string; amount: number | null; status: string };
const initial: Row[] = [{ id: 'a', name: 'Alpha', amount: 1, status: 'open' }, { id: 'b', name: 'Beta', amount: 2, status: 'closed' }, { id: 'c', name: 'Gamma', amount: 3, status: 'open' }];
const columns: DataGridColumn<Row>[] = [
  { id: 'name', header: 'Name', kind: 'text', filterable: true, getValue: row => row.name, setValue: (row, name) => ({ ...row, name }), validate: value => value.trim() ? undefined : 'Required' },
  { id: 'amount', header: 'Amount', kind: 'number', getValue: row => row.amount, setValue: (row, amount) => ({ ...row, amount }) },
  { id: 'status', header: 'Status', kind: 'options', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }], getValue: row => row.status, setValue: (row, status) => ({ ...row, status }) },
];
const getRowId = (row: Row) => row.id;
function Harness(props: Partial<DataGridProps<Row>> = {}) {
  const [data, setData] = useState(initial);
  return <DataGrid label="Inventory" columns={columns} data={data} getRowId={getRowId} onDataChange={setData} pending={false} readOnly={false} {...props} />;
}
function activeText() {
  const grid = screen.getByRole('grid');
  const id = grid.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id)?.textContent : undefined;
}
function key(key: string, options = {}) { fireEvent.keyDown(screen.getByRole('grid'), { key, ...options }); }
function paste(text: string) { fireEvent.paste(screen.getByRole('grid'), { clipboardData: { getData: () => text } }); }

describe('DataGrid measured layout', () => {
  it('keeps header and body aligned through container resize, manual resize and hiding columns', () => {
    let notify = () => {};
    const disconnect = vi.fn();
    const OriginalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { notify = () => callback([], this); }
      observe() {} unobserve() {} disconnect = disconnect;
    };
    try {
      const view = render(<Harness />);
      const grid = screen.getByRole('grid');
      const measure = (width: number) => {
        Object.defineProperty(grid, 'clientWidth', { configurable: true, value: width });
        act(() => notify());
      };
      const check = (widths: number[], total: number) => {
        const rows = within(grid).getAllByRole('row');
        for (const row of rows) {
          expect(row).toHaveStyle({ width: `${total}px` });
          Array.from(row.children).slice(1).forEach((cell, index) => expect(cell).toHaveStyle({ width: `${widths[index]}px` }));
        }
      };
      measure(1244); check([400, 400, 400], 1244);
      fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize Name' }), { key: 'ArrowRight' });
      check([410, 395, 395], 1244);
      measure(344); check([410, 180, 180], 814);
      measure(1444); check([410, 495, 495], 1444);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Status' }));
      check([410, 800], 1254); // Respect the remaining column's maximum rather than silently breaking its contract.
      measure(1044); check([410, 590], 1044);
      view.unmount(); expect(disconnect).toHaveBeenCalledOnce();
    } finally { globalThis.ResizeObserver = OriginalResizeObserver; }
  });
  it('renders the entire visible body below a sticky header with zero overscan', () => {
    const sample = Array.from({ length: 30 }, (_, n) => ({ ...initial[0], id: `row-${n}`, name: `Item ${n}` }));
    render(<Harness data={sample} height={220} rowHeight={36} overscan={0} />);
    fireEvent.scroll(screen.getByRole('grid'), { target: { scrollTop: 72 } });
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 6')).toBeInTheDocument();
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });
});

describe('DataGrid keyboard', () => {
  it('navigates, extends rectangular cell ranges and keeps row selection separate', () => {
    render(<Harness />);
    const grid = screen.getByRole('grid'); grid.focus();
    expect(activeText()).toBe('Alpha');
    key('ArrowRight'); expect(activeText()).toBe('1');
    key('ArrowDown', { shiftKey: true });
    expect(within(grid).getAllByRole('gridcell').filter(cell => cell.getAttribute('aria-selected') === 'true')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Select row 1' })).not.toBeChecked();
    key('End'); expect(activeText()).toBe('Closed');
    key('Home', { ctrlKey: true }); expect(activeText()).toBe('Alpha');
    key('End', { ctrlKey: true }); expect(activeText()).toBe('Open');
    key('Tab', { shiftKey: true }); expect(activeText()).toBe('3');
    key('PageUp'); expect(activeText()).toBe('1');
    key('PageDown'); expect(activeText()).toBe('3');
    key('Escape');
    expect(within(grid).getAllByRole('gridcell').filter(cell => cell.getAttribute('aria-selected') === 'true')).toHaveLength(0);
  });
  it('edits text and numbers with Enter/F2, cancels Escape, commits once, undo/redo works', () => {
    const changes = vi.fn();
    function Controlled() { const [data, setData] = useState(initial); return <Harness data={data} onDataChange={(next, meta) => { changes(meta); setData(next); }} />; }
    render(<Controlled />);
    key('Enter');
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit Name' }), { target: { value: 'Changed' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit Name' }), { key: 'Enter' });
    expect(screen.getByText('Changed')).toBeInTheDocument(); expect(changes).toHaveBeenCalledTimes(1);
    key('z', { ctrlKey: true }); expect(screen.getByText('Alpha')).toBeInTheDocument();
    key('z', { ctrlKey: true, shiftKey: true }); expect(screen.getByText('Changed')).toBeInTheDocument();
    key('Home', { ctrlKey: true }); key('ArrowRight'); key('F2');
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit Amount' }), { target: { value: '8' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit Amount' }), { key: 'Escape' });
    expect(screen.queryByText('8')).not.toBeInTheDocument();
    key('F2'); fireEvent.change(screen.getByRole('textbox', { name: 'Edit Amount' }), { target: { value: '9' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit Amount' }), { key: 'Tab' });
    expect(screen.getByText('9')).toBeInTheDocument(); expect(activeText()).toBe('Open');
    key('F2'); fireEvent.change(screen.getByRole('combobox', { name: 'Edit Status' }), { target: { value: 'closed' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Edit Status' }), { key: 'Enter' });
    expect(screen.getAllByText('Closed')).toHaveLength(2);
  });
  it('keeps invalid edits open with accessible feedback', () => {
    render(<Harness />); key('Enter');
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit Name' }), { target: { value: '' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit Name' }), { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.getByRole('textbox', { name: 'Edit Name' })).toHaveAttribute('aria-invalid', 'true');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit Name' }), { key: 'Escape' });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });
  it('copies a rectangle and rejects paste atomically before accepting valid data', () => {
    render(<Harness />); key('ArrowRight', { shiftKey: true }); key('ArrowDown', { shiftKey: true });
    const setData = vi.fn(); fireEvent.copy(screen.getByRole('grid'), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith('text/plain', 'Alpha\t1\r\nBeta\t2');
    paste('Changed\tbad'); expect(screen.getByRole('alert')).toHaveTextContent('finite number'); expect(screen.getByText('Alpha')).toBeInTheDocument();
    paste('Changed\t7'); expect(screen.getByText('Changed')).toBeInTheDocument(); expect(screen.getByText('7')).toBeInTheDocument();
    key('z', { ctrlKey: true }); expect(screen.getByText('Alpha')).toBeInTheDocument();
  });
  it('only requests row deletion and supports separate shift row selection', () => {
    const deletion = vi.fn(); render(<Harness onDeleteRows={deletion} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row 3' }), { shiftKey: true });
    expect(screen.getByRole('checkbox', { name: 'Select row 2' })).toBeChecked();
    key('Delete'); expect(deletion).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });
  it('blocks mutation while pending or readonly but permits navigation', () => {
    const change = vi.fn(), deletion = vi.fn();
    const view = render(<Harness readOnly onDataChange={change} onDeleteRows={deletion} />);
    key('Enter'); expect(screen.queryByRole('textbox', { name: 'Edit Name' })).not.toBeInTheDocument();
    paste('Changed'); key('Delete'); expect(change).not.toHaveBeenCalled(); expect(deletion).not.toHaveBeenCalled();
    key('ArrowDown'); expect(activeText()).toBe('Beta');
    view.rerender(<Harness pending onDataChange={change} />); key('Enter'); paste('Changed'); expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('grid')).toHaveAttribute('aria-busy', 'true');
  });
  it('searches, filters, hides columns and exports only visible columns', () => {
    const exportData = vi.fn(); render(<Harness onExport={exportData} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search rows' }), { target: { value: 'Beta' } });
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search rows' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter Name' }), { target: { value: 'Alpha' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Amount' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(exportData).toHaveBeenCalledWith('Name\r\nAlpha');
  });
  it('sorts stably and resizes columns with keyboard within their bounds', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Gamma');
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'descending');
    const resize = screen.getByRole('separator', { name: 'Resize Name' });
    fireEvent.keyDown(resize, { key: 'ArrowRight' });
    expect(resize).toHaveAttribute('aria-valuenow', '190');
    for (let n = 0; n < 30; n++) fireEvent.keyDown(resize, { key: 'ArrowLeft' });
    expect(resize).toHaveAttribute('aria-valuenow', '80');
  });
  it('renders Chinese source keys without a translator and disables readonly column edits', () => {
    setTranslator(value => value);
    render(<Harness columns={columns.map(column => ({ ...column, readOnly: true }))} />);
    expect(screen.getByRole('textbox', { name: '搜索行' })).toBeInTheDocument();
    key('F2');
    expect(screen.queryByRole('textbox', { name: '编辑 Name' })).not.toBeInTheDocument();
    paste('Changed');
    expect(screen.getByRole('alert')).toHaveTextContent('此单元格为只读。');
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });
  it('commits when clicking another cell and keeps invalid edits from switching', () => {
    render(<Harness />); key('Enter');
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit Name' }), { target: { value: 'Updated' } });
    fireEvent.pointerDown(screen.getByRole('gridcell', { name: '2' }), { button: 0 });
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(activeText()).toBe('2');
    key('Home', { ctrlKey: true }); key('Enter');
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit Name' }), { target: { value: '' } });
    fireEvent.pointerDown(screen.getByRole('gridcell', { name: '2' }), { button: 0 });
    expect(screen.getByRole('textbox', { name: 'Edit Name' })).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
  it('does not reset an editor draft when double-clicking inside the input', () => {
    render(<Harness />); key('Enter');
    const editor = screen.getByRole('textbox', { name: 'Edit Name' });
    fireEvent.change(editor, { target: { value: 'Draft' } });
    fireEvent.doubleClick(editor);
    expect(editor).toHaveValue('Draft');
  });
  it('allows valid editor boundary Tab to leave and blocks invalid boundary Tab', () => {
    render(<Harness />); key('Enter');
    const editor = screen.getByRole('textbox', { name: 'Edit Name' });
    fireEvent.change(editor, { target: { value: '' } });
    expect(fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    fireEvent.change(editor, { target: { value: 'Valid' } });
    expect(fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })).toBe(true);
    fireEvent.blur(editor);
    expect(screen.getByText('Valid')).toBeInTheDocument();
    key('End', { ctrlKey: true }); key('Enter');
    expect(fireEvent.keyDown(screen.getByRole('combobox', { name: 'Edit Status' }), { key: 'Tab' })).toBe(true);
  });
  it('uses stable IDs for sorted filtered paste and retains hidden row selections without selecting hidden rows', () => {
    const change = vi.fn(), selected = vi.fn();
    render(<Harness onDataChange={change} onRowSelectionChange={selected} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter Name' }), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    key('Home', { ctrlKey: true });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search rows' }), { target: { value: 'Gamma' } });
    paste('Updated Gamma');
    expect(change.mock.calls[0][0].map((row: Row) => [row.id, row.name])).toEqual([['a', 'Alpha'], ['b', 'Beta'], ['c', 'Updated Gamma']]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible rows' }));
    expect(selected).toHaveBeenLastCalledWith(['a', 'c']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible rows' }));
    expect(selected).toHaveBeenLastCalledWith(['a']);
  });
  it('cancels an open editor and disables row selection while pending, but readonly still allows selection', () => {
    const change = vi.fn(), selected = vi.fn();
    const view = render(<Harness onDataChange={change} onRowSelectionChange={selected} />);
    key('Enter');
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit Name' }), { target: { value: 'Draft' } });
    view.rerender(<Harness pending onDataChange={change} onRowSelectionChange={selected} />);
    expect(screen.queryByRole('textbox', { name: 'Edit Name' })).not.toBeInTheDocument();
    expect(screen.getByRole('grid')).toHaveAttribute('aria-readonly', 'true');
    for (const checkbox of within(screen.getByRole('grid')).getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    paste('Changed'); expect(change).not.toHaveBeenCalled(); expect(selected).not.toHaveBeenCalled();
    view.rerender(<Harness readOnly onDataChange={change} onRowSelectionChange={selected} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    expect(selected).toHaveBeenLastCalledWith(['a']);
    paste('Changed'); expect(change).not.toHaveBeenCalled();
  });
  it('invalidates undo after host-originated replacement', () => {
    const change = vi.fn(); const view = render(<Harness onDataChange={change} />);
    paste('Changed'); expect(change).toHaveBeenCalledTimes(1);
    view.rerender(<Harness data={initial.map(row => ({ ...row, name: `External ${row.name}` }))} onDataChange={change} />);
    key('z', { ctrlKey: true }); expect(change).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
  it('renders a bounded window of 10,000 rows and navigates to the last row', () => {
    const sample = Array.from({ length: 10_000 }, (_, n) => ({ ...initial[0], id: `row-${n}`, name: `Item ${n}` }));
    render(<Harness data={sample} height={400} />);
    expect(screen.getAllByRole('row').length).toBeLessThan(30);
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', '10001');
    key('End', { ctrlKey: true });
    expect(screen.getByText('Item 9999')).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeLessThan(30);
  });
});
