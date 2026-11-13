// Author: yunnuo <ymz@ebox.vip>
// Description: Inventory and real-render coverage; verify controlled examples rather than registry-only placeholders.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import { baseIds, chartIds, compositeIds, catalogItems } from './catalog';
import { BaseDemo } from './base';
import { ChartDemo } from './charts';
import { CompositeDemo } from './composites';
import GridSection from './grid';
import FoundationsSection from './foundations';
afterEach(cleanup);
describe('explicit catalog coverage', () => {
  it('registers exactly 49 base + 19 chart + 19 composite families, with grid counted once', () => {
    expect(baseIds).toHaveLength(49); expect(chartIds).toHaveLength(19); expect(compositeIds).toHaveLength(19);
    expect(catalogItems).toHaveLength(2 + 49 + 19 + 19);
    expect(new Set(catalogItems.map(item => item.id)).size).toBe(89);
    expect(catalogItems.filter(item => item.category === 'data-grid').map(item => item.id)).toEqual(['data-grid']);
    expect(catalogItems.find(item => item.id === 'chip')?.implementation).toBe('Badge');
    expect(catalogItems.find(item => item.id === 'toast')?.implementation).toBe('useMessage');
  });
  it.each(['color', 'typography'])('renders actual foundation content: %s', id => {
    const { container } = render(<FoundationsSection />);
    expect(container.querySelector(`[data-catalog-id="${id}"]`)?.textContent?.length).toBeGreaterThan(20);
  });
  it.each(baseIds)('renders a nonempty real base example: %s', id => {
    const { container } = render(<MessageProvider><BaseDemo id={id} /></MessageProvider>);
    const section = container.querySelector(`[data-catalog-id="${id}"]`);
    expect(section).toBeTruthy(); expect(section?.querySelector('h2')).toHaveTextContent(id);
    expect(section?.querySelector('button,a,input,textarea,select,svg,table,[role],hr,[data-slot],.rounded-full') ?? section?.querySelector('.bg-surface-alt')).toBeTruthy();
  });
  it.each(chartIds)('renders supplied-data SVG and accessible chart table: %s', id => {
    const { container } = render(<ChartDemo id={id} />);
    expect(container.querySelector(`[data-catalog-id="${id}"] svg`)).toBeTruthy();
    expect(container.querySelector('table')).toBeTruthy();
  });
  it.each(compositeIds.filter((id): id is Exclude<typeof compositeIds[number], 'data-grid'> => id !== 'data-grid'))('renders real composite content: %s', id => {
    const { container } = render(<CompositeDemo id={id} />);
    const section = container.querySelector(`[data-catalog-id="${id}"]`);
    expect(section?.querySelector('button,input,form,svg,progress,meter,nav,article,[aria-busy],[role="progressbar"]')).toBeTruthy();
  });
  it('edits a controlled field without exposing a debug state dump', () => {
    render(<MessageProvider><BaseDemo id="input" /></MessageProvider>);
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'local-edit' } });
    expect(screen.getByLabelText('账号')).toHaveValue('local-edit');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('does not render default debug feedback under basic examples', () => {
    render(<MessageProvider><BaseDemo id="accordion" /><BaseDemo id="avatar" /></MessageProvider>);
    expect(screen.queryByText(/false.*42/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('bounds profile forms and compact controls independently of the showcase width', () => {
    const { container } = render(<MessageProvider><CompositeDemo id="agent-creator" /><BaseDemo id="select" /></MessageProvider>);
    expect(container.querySelector('form')).toHaveClass('max-w-xl');
    expect(container.querySelector('[data-catalog-id="select"] [data-sample-surface]')).toHaveClass('max-w-xs');
  });
  it('opens the command modal, chooses a real command and reports the selection', async () => {
    render(<MessageProvider><BaseDemo id="command-palette" /></MessageProvider>);
    await userEvent.click(screen.getByRole('button', { name: /打开菜单/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('option', { name: '选项二' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('选项二');
  });
  it('switches table fixtures and recovers a synthetic error using the actual retry callback', async () => {
    render(<CompositeDemo id="data-table" />);
    await userEvent.click(screen.getByRole('button', { name: 'error' }));
    expect(screen.getByRole('alert')).toHaveTextContent('合成错误');
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(screen.getByRole('cell', { name: 'sample-01' })).toBeInTheDocument();
  });
  it('renders a complete composer panel and saves only the local draft', async () => {
    render(<CompositeDemo id="composer-panel" />);
    const draft = screen.getByRole('textbox', { name: '本地消息草稿' });
    await userEvent.type(draft, 'local draft');
    await userEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(draft).toHaveValue('');
    expect(screen.getByText('草稿已保存在本页')).toBeInTheDocument();
    expect(screen.getByText('local draft', { selector: 'output' })).toBeInTheDocument();
  });
  it('switches representative chart variants without changing the family registration', async () => {
    const { container } = render(<ChartDemo id="radial" />);
    const gaugeStart = container.querySelector('[data-radial-value]')?.getAttribute('data-start-angle');
    await userEvent.click(screen.getByRole('button', { name: '半圆堆叠' }));
    expect(container.querySelector('[data-radial-value]')).toHaveAttribute('data-start-angle', '180');
    expect(gaugeStart).toBe('135');
    expect(container.querySelectorAll('[data-catalog-id="radial"]')).toHaveLength(1);
  });
  it('uses a real typed editable grid rather than a mock table', () => {
    const { container } = render(<GridSection />);
    expect(container.querySelector('[data-catalog-id="data-grid"] [role="grid"]')).toBeTruthy();
    expect(screen.getByText('Sample 1')).toBeInTheDocument();
  });
});
