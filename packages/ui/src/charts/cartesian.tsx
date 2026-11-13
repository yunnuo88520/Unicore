// Author: yunnuo <ymz@ebox.vip>
// Description: Responsive Cartesian cards with explicit gaps, diverging stacks, dual domains and unique fills.
import { useId } from 'react';
import { finiteValue, linePath, normalizePercent, numericDomain, scale, type XY } from './data';
import { ChartFrame, ChartSvg, chartColor, useChart, useInspection } from './shared';
import type { ChartPoint, ChartSeries, SeriesChartProps } from './types';

export type AreaChartCardProps = SeriesChartProps & { mode?: 'stacked' | 'overlap' | 'percent'; curve?: 'sharp' | 'smooth' };
export type LineChartCardProps = SeriesChartProps & { curve?: 'sharp' | 'smooth'; dots?: boolean };
export type ComboChartCardProps = SeriesChartProps & { barKeys: readonly string[]; curve?: 'sharp' | 'smooth' };
type CartesianProps = SeriesChartProps & { kind: 'area' | 'line' | 'combo' | 'earnings' | 'orders' | 'revenue'; mode?: AreaChartCardProps['mode']; curve?: 'sharp' | 'smooth'; barKeys?: readonly string[]; dots?: boolean };
type Segment = { top: XY[]; bottom: XY[] };

function CartesianCard(props: CartesianProps) {
  const { format } = useChart(props); const inspection = useInspection(props); const id = useId().replace(/:/g, '');
  const visible = props.series.filter(series => !props.visibleSeries || props.visibleSeries.includes(series.key));
  const points = props.mode === 'percent' ? normalizePercent(props.points, visible) : props.points;
  const left = 54; const right = 546; const top = 12; const bottom = 218;
  const x = (index: number) => points.length === 1 ? (left + right) / 2 : left + index * (right - left) / Math.max(1, points.length - 1);
  const isBar = (series: ChartSeries) => props.kind === 'earnings' || props.kind === 'orders' || props.kind === 'combo' && props.barKeys?.includes(series.key) || props.kind === 'revenue' && series.key === visible[0]?.key;
  const stacked = props.kind === 'area' && props.mode !== 'overlap';
  // Stacks diverge around zero and never mix the independent left/right units.
  const layers = new Map<string, { low: number; high: number }[]>();
  for (const series of visible) layers.set(series.key, []);
  points.forEach((point, index) => {
    const positive = { left: 0, right: 0 }; const negative = { left: 0, right: 0 };
    for (const series of visible) {
      const value = point.values[series.key]; const axis = series.axis ?? 'left'; const valid = finiteValue(value);
      const low = valid && stacked ? value < 0 ? negative[axis] : positive[axis] : 0;
      layers.get(series.key)![index] = { low, high: valid ? low + value : low };
      if (valid && stacked) { if (value < 0) negative[axis] += value; else positive[axis] += value; }
    }
  });
  const domain = (axis: 'left' | 'right') => props.mode === 'percent' ? [0, 100] as [number, number] : numericDomain(visible.filter(series => (series.axis ?? 'left') === axis).flatMap(series => layers.get(series.key)!.flatMap(layer => [layer.low, layer.high])));
  const domains = { left: domain('left'), right: domain('right') };
  const y = (value: number, series: ChartSeries) => scale(value, domains[series.axis ?? 'left'], [bottom, top]);
  const invalid = props.points.some(point => props.series.some(series => !finiteValue(point.values[series.key]) || props.mode === 'percent' && point.values[series.key]! < 0));
  const bars = visible.filter(isBar); const groupWidth = Math.min(60, (right - left) / Math.max(1, points.length) * 0.7); const barWidth = groupWidth / Math.max(1, bars.length);
  function segments(series: ChartSeries): Segment[] {
    const result: Segment[] = []; let current: Segment | undefined;
    points.forEach((point, index) => {
      if (!finiteValue(point.values[series.key])) { current = undefined; return; }
      if (!current) { current = { top: [], bottom: [] }; result.push(current); }
      const layer = layers.get(series.key)![index]; current.top.push([x(index), y(layer.high, series)]); current.bottom.push([x(index), y(layer.low, series)]);
    });
    return result;
  }
  const hoverFor = (point: ChartPoint) => ({ id: point.id, label: point.label, values: props.series.filter(series => visible.includes(series)).map(series => ({ key: series.key, label: series.label, value: point.values[series.key] })) });
  return <ChartFrame props={props} series={props.series} rows={props.points} invalid={invalid} hover={inspection.hover}>
    <ChartSvg height={props.height}>
      <defs>{visible.map((series, index) => <linearGradient key={series.key} id={`${id}-fill-${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColor(props.series.indexOf(series), series.color)} stopOpacity={0.45} /><stop offset="100%" stopColor={chartColor(props.series.indexOf(series), series.color)} stopOpacity={0.04} /></linearGradient>)}</defs>
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => <g key={fraction} aria-hidden="true"><line x1={left} x2={right} y1={bottom - fraction * (bottom - top)} y2={bottom - fraction * (bottom - top)} stroke="var(--color-line)" strokeDasharray="3 4" /><text x={left - 8} y={bottom - fraction * (bottom - top) + 4} textAnchor="end" fill="var(--color-muted)" fontSize="10">{props.mode === 'percent' ? `${fraction * 100}%` : format(domains.left[0] + fraction * (domains.left[1] - domains.left[0]), { purpose: 'axis', seriesKey: visible.find(series => series.axis !== 'right')?.key })}</text>{visible.some(series => series.axis === 'right') && <text x={right + 8} y={bottom - fraction * (bottom - top) + 4} fill="var(--color-muted)" fontSize="10">{format(domains.right[0] + fraction * (domains.right[1] - domains.right[0]), { purpose: 'axis', seriesKey: visible.find(series => series.axis === 'right')?.key })}</text>}</g>)}
      {visible.map((series, seriesIndex) => {
        const color = chartColor(props.series.indexOf(series), series.color);
        if (isBar(series)) return <g key={series.key} aria-hidden="true">{points.map((point, index) => { const value = point.values[series.key]; if (!finiteValue(value)) return null; const end = y(value, series); const baseline = y(0, series); return <rect key={point.id} x={x(index) - groupWidth / 2 + bars.indexOf(series) * barWidth} y={Math.min(end, baseline)} width={Math.max(1, barWidth - 2)} height={Math.abs(end - baseline)} rx={props.kind === 'earnings' ? 4 : 1} fill={color} opacity={props.kind === 'revenue' ? 0.35 : 0.9} />; })}</g>;
        return <g key={series.key} aria-hidden="true">{segments(series).map((segment, index) => <g key={index}>{props.kind === 'area' && <path d={`${linePath(segment.top, props.curve === 'smooth')} ${linePath([...segment.bottom].reverse(), props.curve === 'smooth').replace(/^M/, 'L')} Z`} fill={`url(#${id}-fill-${seriesIndex})`} />}<path d={linePath(segment.top, props.curve === 'smooth')} stroke={color} strokeWidth={props.kind === 'revenue' ? 3 : 2} strokeLinejoin="round" />{(props.dots || segment.top.length === 1) && segment.top.map(([px, py], index) => <circle key={index} cx={px} cy={py} r={3} fill={color} stroke="var(--color-surface)" />)}</g>)}</g>;
      })}
      {points.map((point, index) => <g key={point.id}><rect {...inspection.bind(hoverFor(props.points[index]))} x={x(index) - Math.min(25, (right - left) / Math.max(1, points.length) / 2)} y={top} width={Math.min(50, (right - left) / Math.max(1, points.length))} height={bottom - top} fill="transparent" />{(index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 6)) === 0) && <text aria-hidden="true" x={x(index)} y={242} textAnchor="middle" fontSize="10" fill="var(--color-muted)">{point.label.length > 14 ? `${point.label.slice(0, 13)}…` : point.label}</text>}</g>)}
    </ChartSvg>
  </ChartFrame>;
}
export function AreaChartCard(props: AreaChartCardProps) { return <CartesianCard {...props} kind="area" mode={props.mode ?? 'stacked'} />; }
export function LineChartCard(props: LineChartCardProps) { return <CartesianCard {...props} kind="line" />; }
/** Series axis selects the independently scaled domain; barKeys selects geometry, not units. */
export function ComboChartCard(props: ComboChartCardProps) { return <CartesianCard {...props} kind="combo" />; }
export function EarningsChartCard(props: SeriesChartProps) { return <CartesianCard {...props} kind="earnings" />; }
export function OrdersComparisonChartCard(props: SeriesChartProps) { return <CartesianCard {...props} kind="orders" />; }
/** First visible series is a translucent bar baseline, later series are comparison lines. */
export function RevenueComparisonChartCard(props: SeriesChartProps) { return <CartesianCard {...props} kind="revenue" curve="smooth" dots />; }
