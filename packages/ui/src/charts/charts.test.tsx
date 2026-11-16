// Author: yunnuo <ymz@ebox.vip>
// Description: Public chart geometry, controlled controls, localization and accessible inspection tests.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ActivityRingsChartCard, AreaChartCard, BarListChartCard, ComboChartCard, ContributionsCalendarChartCard,
  EarningsChartCard, HeatmapChartCard, HorizontalFunnelChartCard, LineChartCard, MostActiveDatesChartCard,
  OrdersComparisonChartCard, RadarChartCard, RadialChartCard, RevenueComparisonChartCard, SankeyChartCard,
  ScatterChartCard, SegmentedScoreChartCard, StageBarsChartCard, StepsChartCard,
} from './index';

const series = [{ key: 'a', label: 'Actual' }, { key: 'b', label: 'Prior', axis: 'right' as const }];
const points = [{ id: 'one', label: 'Monday', values: { a: 10, b: 100 } }, { id: 'two', label: 'Tuesday', values: { a: -3, b: 20 } }, { id: 'three', label: 'Wednesday', values: { a: 0, b: null } }];
const data = [{ id: 'one', label: 'First', value: 30, target: 50 }, { id: 'two', label: 'Second', value: 20, target: 100 }];

describe('chart card public surface', () => {
  it('renders all nineteen card kinds with a real geometry and accessible table', () => {
    const common = { title: 'Chart', locale: 'en' };
    const cards = [
      <ActivityRingsChartCard {...common} data={data} />, <AreaChartCard {...common} points={points} series={series} />,
      <BarListChartCard {...common} data={data} />, <ComboChartCard {...common} points={points} series={series} barKeys={['a']} />,
      <ContributionsCalendarChartCard {...common} data={[{ date: '2026-01-01', value: 1 }]} start="2026-01-01" end="2026-01-03" />,
      <EarningsChartCard {...common} points={points} series={series} />, <HorizontalFunnelChartCard {...common} data={data} />,
      <HeatmapChartCard {...common} columns={[{ id: 'a', label: 'A' }]} rows={[{ id: 'b', label: 'B' }]} cells={[{ row: 'b', column: 'a', value: 1 }]} />,
      <LineChartCard {...common} points={points} series={series} />, <MostActiveDatesChartCard {...common} data={data} />,
      <OrdersComparisonChartCard {...common} points={points} series={series} />, <RadarChartCard {...common} points={points.map(point => ({ ...point, values: { a: 20, b: 30 } }))} series={series} />,
      <RadialChartCard {...common} data={data} />, <RevenueComparisonChartCard {...common} points={points} series={series} />,
      <SankeyChartCard {...common} nodes={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} links={[{ source: 'a', target: 'b', value: 2 }]} />,
      <ScatterChartCard {...common} data={[{ id: 'a', label: 'A', x: -1, y: 3 }]} xLabel="X" yLabel="Y" />,
      <SegmentedScoreChartCard {...common} data={data} />, <StageBarsChartCard {...common} data={data} />, <StepsChartCard {...common} data={data} />,
    ];
    for (const card of cards) {
      const result = render(card);
      expect(screen.getByRole('region', { name: 'Chart' })).toBeInTheDocument();
      expect(result.container.querySelector('svg')).not.toBeNull();
      expect(result.container.querySelector('path, rect, circle, polygon')).not.toBeNull();
      expect(screen.getByText('View chart data')).toBeInTheDocument();
      expect(result.container.querySelector('table caption')).toHaveTextContent('Chart');
      expect(result.container.innerHTML).not.toContain('NaN');
      result.unmount();
    }
  });
  it('uses host-controlled range and legend state without optimistic internal changes', () => {
    const onRange = vi.fn(); const onLegend = vi.fn();
    const result = render(<LineChartCard title="Trend" locale="en" points={points} series={series} visibleSeries={['a', 'b']} onVisibleSeriesChange={onLegend} range={{ value: 'week', options: [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }], onChange: onRange }} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'month' } }); expect(onRange).toHaveBeenCalledWith('month');
    fireEvent.click(screen.getByRole('button', { name: 'Actual' })); expect(onLegend).toHaveBeenCalledWith(['b']);
    expect(screen.getByRole('button', { name: 'Actual' })).toHaveAttribute('aria-pressed', 'true');
    result.rerender(<LineChartCard title="Trend" locale="en" points={points} series={series} visibleSeries={['b']} onVisibleSeriesChange={onLegend} />);
    expect(screen.getByRole('button', { name: 'Actual' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('supports keyboard and pointer inspection, selection and shared context formatting', () => {
    const onHover = vi.fn(); const onSelect = vi.fn(); const format = vi.fn((value: number) => `${value} units`);
    const result = render(<BarListChartCard title="Ranking" locale="en" data={data} onHoverChange={onHover} onSelect={onSelect} formatValue={format} />);
    const first = screen.getByRole('button', { name: /First/ }); fireEvent.focus(first);
    expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'one' }));
    expect(result.container.querySelector('[aria-live]')).toHaveTextContent('30 units');
    fireEvent.keyDown(first, { key: 'Enter' }); expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(first, { key: ' ' }); expect(onSelect).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(first, { key: 'Escape' }); expect(onHover).toHaveBeenLastCalledWith(null);
    fireEvent.mouseEnter(first); expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'First' }));
    fireEvent.mouseLeave(first); expect(onHover).toHaveBeenLastCalledWith(null);
    expect(format).toHaveBeenCalledWith(30, expect.objectContaining({ purpose: 'table', datumId: 'one' }));
  });
  it('controls scatter series visibility without confusing coordinate axes with legend series', () => {
    const onLegend = vi.fn();
    const result = render(<ScatterChartCard title="Groups" locale="en" xLabel="Distance" yLabel="Duration" series={series} visibleSeries={['a']} onVisibleSeriesChange={onLegend} data={[{ id: 'a', label: 'Point A', x: 1, y: 2, seriesKey: 'a' }, { id: 'b', label: 'Point B', x: 2, y: 4, seriesKey: 'b' }]} />);
    expect(screen.getByRole('button', { name: 'Actual' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Prior' })).toHaveAttribute('aria-pressed', 'false');
    expect(result.container.querySelectorAll('circle')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Prior' }));
    expect(onLegend).toHaveBeenCalledWith(['a', 'b']);
    expect(result.container.querySelector('table')).toHaveTextContent('Distance');
    expect(result.container.querySelector('table')).toHaveTextContent('Point B');
  });
  it('has unique gradient references per mounted card and no animation', () => {
    const result = render(<><AreaChartCard title="One" points={points} series={series} /><AreaChartCard title="Two" points={points} series={series} /></>);
    const gradients = [...result.container.querySelectorAll('linearGradient')].map(node => node.id);
    expect(new Set(gradients).size).toBe(4);
    for (const path of result.container.querySelectorAll('path[fill^="url"]')) expect(gradients).toContain(path.getAttribute('fill')?.slice(5, -1));
    expect(result.container.querySelector('animate')).toBeNull();
  });
  it('preserves raw missing/negative table data, empty states and localizes built-in text', () => {
    const result = render(<AreaChartCard title="Percent" locale="en" mode="percent" points={points} series={series} />);
    expect(result.container.querySelector('table')).toHaveTextContent('-3');
    expect(result.container.querySelector('table')).toHaveTextContent('Not available');
    expect(screen.getByRole('status')).toHaveTextContent('Some values are missing or invalid');
    result.rerender(<BarListChartCard title="Empty" data={[]} locale="zh-CN" />);
    expect(screen.getByRole('status')).toHaveTextContent('暂无图表数据');
    expect(screen.getByText('查看图表数据')).toBeInTheDocument();
  });
  it('implements distinct area, funnel, radar, radial and bubble variants', () => {
    const renderMarkup = (card: React.ReactNode) => { const result = render(card); const html = result.container.querySelector('svg')?.innerHTML; result.unmount(); return html; };
    expect(renderMarkup(<AreaChartCard title="A" points={points} series={series} curve="sharp" />)).not.toEqual(renderMarkup(<AreaChartCard title="A" points={points} series={series} curve="smooth" />));
    expect(renderMarkup(<HorizontalFunnelChartCard title="F" data={data} shape="sharp" />)).toContain('<path');
    for (const variant of ['rings', 'labels', 'grid', 'gauge', 'solid', 'stacked'] as const) expect(renderMarkup(<RadialChartCard title="R" data={data} variant={variant} />)).toContain('data-radial-value="true"');
    for (const variant of ['filled', 'dots', 'lines', 'score'] as const) expect(renderMarkup(<RadarChartCard title="R" points={points.map(point => ({ ...point, values: { a: 20 } }))} series={[series[0]]} variant={variant} />)).toContain('<circle');
    expect(renderMarkup(<ScatterChartCard title="S" xLabel="X" yLabel="Y" variant="bubble" data={[{ id: 'a', label: 'A', x: 0, y: 0, size: 4 }]} />)).toContain('r="19"');
  });
  it('splits missing runs, keeps independent dual axes, and exposes stage targets', () => {
    const result = render(<LineChartCard title="Gaps" locale="en" points={[{ id: 'a', label: 'A', values: { a: 1 } }, { id: 'b', label: 'B', values: { a: null } }, { id: 'c', label: 'C', values: { a: 3 } }]} series={[series[0]]} />);
    expect(result.container.querySelectorAll('path').length).toBe(2);
    result.rerender(<ComboChartCard title="Domains" locale="en" points={[{ id: 'a', label: 'A', values: { a: 10, b: 1000 } }]} series={series} barKeys={['a']} />);
    expect(result.container.querySelector('svg')).toHaveTextContent('1,000');
    expect(result.container.querySelector('svg')).toHaveTextContent('10');
    result.rerender(<StageBarsChartCard title="Capacity" locale="en" data={data} />);
    expect(result.container.querySelector('table')).toHaveTextContent('Target');
    expect(result.container.querySelector('table')).toHaveTextContent('100');
  });
  it('handles zero-only and invalid geometry without NaN, infinity or negative SVG sizes', () => {
    const variants = [
      <RadialChartCard title="Z" data={[{ id: 'z', label: 'Zero', value: 0 }]} variant="stacked" />,
      <SegmentedScoreChartCard title="Z" data={[{ id: 'z', label: 'Zero', value: 0 }]} target={0} />,
      <AreaChartCard title="Z" points={[{ id: 'z', label: 'Zero', values: { a: 0 } }]} series={[series[0]]} mode="percent" />,
      <ScatterChartCard title="Z" xLabel="X" yLabel="Y" variant="bubble" data={[{ id: 'z', label: 'Zero', x: 0, y: 0, size: 0 }]} />,
      <SankeyChartCard title="Z" nodes={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} links={[{ source: 'a', target: 'b', value: 0 }]} />,
    ];
    for (const card of variants) {
      const result = render(card);
      const svg = result.container.querySelector('svg');
      expect(svg?.innerHTML).not.toMatch(/NaN|Infinity/);
      for (const node of result.container.querySelectorAll('rect, circle')) for (const attribute of ['width', 'height', 'r']) { const value = node.getAttribute(attribute); if (value !== null) expect(Number(value)).toBeGreaterThanOrEqual(0); }
      result.unmount();
    }
  });
  it('fails closed on invalid graph and calendar input without crashing', () => {
    const result = render(<SankeyChartCard title="Cycle" locale="en" nodes={[{ id: 'a', label: 'A' }]} links={[{ source: 'a', target: 'a', value: 2 }]} />);
    expect(result.container.querySelector('svg')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('invalid');
    result.rerender(<ContributionsCalendarChartCard title="Invalid date" locale="en" data={[]} start="2026-02-31" end="2026-03-01" />);
    expect(within(screen.getByRole('region')).getAllByRole('status').length).toBeGreaterThan(0);
  });
});
