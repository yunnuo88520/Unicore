// Author: yunnuo <ymz@ebox.vip>
// Description: Data table kit semantics: state rendering, column-visibility cells, pagination modes, toolbar search and menus.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { columnVisibilityFeature, createColumnHelper, tableFeatures, useTable, type TableFeatures } from '@tanstack/react-table';
import { DataTable, DataTablePagination, DataTableRowActions, DataTableSortHeader, DataTableToolbar, type DataTablePager, type DataTableProps } from './index';

type Row = { name: string; count: number };

const ROWS: Row[] = [{ name: 'alpha', count: 1 }, { name: 'beta', count: 2 }];

const coreFeatures = tableFeatures({});
const coreHelper = createColumnHelper<typeof coreFeatures, Row>();
const coreColumns = coreHelper.columns([
  coreHelper.accessor('name', { header: () => '名称', cell: info => info.getValue() }),
  coreHelper.accessor('count', { header: () => '数量', cell: info => String(info.getValue()) }),
]);

const visibilityFeatures = tableFeatures({ columnVisibilityFeature });
const visibilityHelper = createColumnHelper<typeof visibilityFeatures, Row>();
const visibilityColumns = visibilityHelper.columns([
  visibilityHelper.accessor('name', { header: () => '名称', cell: info => info.getValue() }),
  visibilityHelper.accessor('count', { header: () => '数量', cell: info => String(info.getValue()) }),
]);

function CoreTable({ rows, ...props }: Omit<Partial<DataTableProps<typeof coreFeatures, Row>>, 'table'> & { rows?: Row[] }) {
  const table = useTable({ features: coreFeatures, columns: coreColumns, data: rows ?? [] });
  return <DataTable table={table} {...props} />;
}

function VisibilityTable({ hidden }: { hidden: Record<string, boolean> }) {
  const table = useTable({ features: visibilityFeatures, columns: visibilityColumns, data: ROWS, state: { columnVisibility: hidden } });
  return <DataTable table={table} />;
}

it('renders skeleton rows while pending, rows when ready and the empty state without data', () => {
  const pending = render(<CoreTable rows={ROWS} pending />);
  expect(pending.container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  expect(screen.queryByText('alpha')).not.toBeInTheDocument();
  pending.unmount();

  render(<CoreTable rows={ROWS} />);
  expect(screen.getByRole('cell', { name: 'alpha' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '数量' })).toBeInTheDocument();
});

it('renders the empty state with icon title and hint', () => {
  render(<CoreTable rows={[]} empty={{ title: '暂无访问令牌', hint: '创建后开始使用' }} />);
  expect(screen.getByText('暂无访问令牌')).toBeInTheDocument();
  expect(screen.getByText('创建后开始使用')).toBeInTheDocument();
});

it('reports query errors with a retry action', async () => {
  const onRetry = vi.fn();
  render(<CoreTable rows={[]} error={{ message: '无法读取访问令牌' }} onRetry={onRetry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('无法读取访问令牌');
  await userEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

it('drops hidden columns when the instance carries the visibility feature', () => {
  render(<VisibilityTable hidden={{ count: false }} />);
  expect(screen.getByRole('columnheader', { name: '名称' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: '数量' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(3); // header + two body rows
});

it('drives server-side pagination from explicit page state', async () => {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  const view = render(<DataTablePagination page={2} pageSize={20} total={45} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />);
  expect(screen.getByText('共 45 条')).toBeInTheDocument();
  expect(screen.getByText('第 2 / 3 页')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '上一页' }));
  expect(onPageChange).toHaveBeenCalledWith(1);
  await userEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(onPageChange).toHaveBeenCalledWith(3);
  await userEvent.click(screen.getByRole('button', { name: '上一页' }));
  expect(onPageChange).toHaveBeenCalledWith(1);
  view.rerender(<DataTablePagination page={1} pageSize={20} total={45} onPageChange={onPageChange} disabled />);
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
});

it('binds client-side pagination to the table instance state', async () => {
  const calls: string[] = [];
  const pager: DataTablePager = {
    state: { pagination: { pageIndex: 1, pageSize: 20 } },
    getPageCount: () => 4,
    getCanPreviousPage: () => true,
    getCanNextPage: () => true,
    previousPage: () => calls.push('prev'),
    nextPage: () => calls.push('next'),
    setPageSize: size => calls.push(`size:${size}`),
  };
  render(<DataTablePagination table={pager} onPageSizeChange={() => {}} />);
  expect(screen.getByText('第 2 / 4 页')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '上一页' }));
  await userEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(calls).toEqual(['prev', 'next']);
});

it('keeps sortable headers wired to the column toggle', async () => {
  const onToggle = vi.fn();
  render(<DataTableSortHeader label="时间" sorted="asc" onToggle={onToggle} />);
  await userEvent.click(screen.getByRole('button', { name: '时间' }));
  expect(onToggle).toHaveBeenCalledOnce();
});

it('search submits through the toolbar and column menus report toggles', async () => {
  const onSubmit = vi.fn();
  const onToggle = vi.fn();
  render(<DataTableToolbar search={{ label: '搜索访问令牌', placeholder: '搜索名称或备注', value: 'api', onChange: () => {}, onSubmit }}
    columnMenu={{ entries: [{ id: 'name', label: '名称', visible: true }, { id: 'count', label: '数量', visible: false }], onToggle }} />);
  const input = screen.getByRole('textbox', { name: '搜索访问令牌' });
  await userEvent.type(input, '{Enter}');
  expect(onSubmit).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: '列设置' }));
  await userEvent.click(screen.getByRole('checkbox', { name: '名称' }));
  expect(onToggle).toHaveBeenCalledWith('name', false);
});

it('hides row actions without items and fires selected actions through the menu', async () => {
  const onSelect = vi.fn();
  const empty = render(<DataTableRowActions label="行操作" items={[]} />);
  expect(empty.container).toBeEmptyDOMElement();
  empty.unmount();
  render(<DataTableRowActions label="操作 alpha" items={[{ label: '续期', onSelect }, { label: '作废', onSelect, danger: true }]} />);
  await userEvent.click(screen.getByRole('button', { name: '操作 alpha' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '作废' }));
  expect(onSelect).toHaveBeenCalledOnce();
});
